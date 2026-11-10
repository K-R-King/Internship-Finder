// Gathers U.S. jobs from every source. Run with: npm run sync
// public/internships.json holds internships and entry-level jobs, which the page loads first, and jobs-mid.json
// and jobs-senior.json the rest, loaded when someone asks for them.
// A source that fails is skipped and reported; if the result shrinks by more than half, the old files are kept.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readBands } from "./company-bands.mjs";
import {
  dedupe, fromAshby, fromGreenhouse, fromLever, fromMuse, fromNewGrad, fromSimplify, fromSmartRecruiters, fromVansh,
  fromWorkday, isHttpUrl, isShortLink, jobType, keep, pageOf, parseBoardLink, parseCareerSite, rowsFromTable, usOnly, withoutEndedTerms,
  simpleCompany, sizeBand,
} from "../lib/normalize.mjs";

const OUTPUT = new URL("../public/internships.json", import.meta.url);
const MID_OUTPUT = new URL("../public/jobs-mid.json", import.meta.url);
const SENIOR_OUTPUT = new URL("../public/jobs-senior.json", import.meta.url);
const COMPANY_SIZES = new URL("../data/company-sizes.json", import.meta.url);  // company -> employees, null if unknown
const COMPANY_BANDS = new URL("../data/company-bands.json", import.meta.url);  // company -> dataset size band, null if unknown
// the company dataset is a 630 MB download, so it's read again only once this many new companies have appeared
const NEW_COMPANIES_FOR_BANDS = 100;
const SHORT_LINKS = new URL("../data/short-links.json", import.meta.url);  // short link -> where it goes
const HEADERS = { "User-Agent": "internship-finder" };
const curated = JSON.parse(readFileSync(new URL("../data/boards.json", import.meta.url)));

// the listings live on the "data" branch, so a fresh checkout has no public/ folder to write them to
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });

const LISTS = [
  { name: "SimplifyJobs list", url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json", convert: fromSimplify },
  { name: "SimplifyJobs new grad list", url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json", convert: fromNewGrad },
  { name: "Summer Internships list", url: "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json", convert: (row) => fromVansh(row) },
];

// More public lists, read only to find companies' job boards. Their listings aren't used: the boards give those directly.
const MORE_BOARD_LISTS = [
  "speedyapply/2027-SWE-College-Jobs/main/README.md",
  "speedyapply/2027-SWE-College-Jobs/main/NEW_GRAD_USA.md",
  "speedyapply/2027-AI-College-Jobs/main/README.md",
  "speedyapply/2027-AI-College-Jobs/main/NEW_GRAD_USA.md",
].map((path) => `https://raw.githubusercontent.com/${path}`);

// The Muse allows 500 requests an hour without a key, and 100 pages of 20 per search. Newest jobs come first.
const MUSE_PAGES = 99;
const MUSE_LEVELS = ["Internship", "Entry Level", "Mid Level", "Senior Level"];
// a blank search takes each company's latest jobs; searching "intern" finds internships further down the list
const WORKDAY_SEARCHES = [["", 3], ["intern", 2]];
const SIZE_BATCH = 100;
const SIZE_LOOKUPS = 1500;  // companies to look up per run; the rest wait for the next one
const WANTED = (title) => jobType(title) !== null;

async function getJson(url, tries = 3, options = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000), ...options });
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((done) => setTimeout(done, attempt * 1000));
    }
  }
}

const listed = (rows) => rows.filter((row) => row.active && row.is_visible !== false);

/** Runs tasks a few at a time, to go easy on the job sites. */
async function inBatches(tasks, size = 6) {
  const results = [];
  for (let i = 0; i < tasks.length; i += size) {
    results.push(...await Promise.allSettled(tasks.slice(i, i + size).map((task) => task())));
  }
  return results;
}

const BOARD_APIS = {
  greenhouse: async (token, company) => {
    const { jobs } = await getJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`, 1);
    return { ids: jobs.map((job) => job.id), items: jobs.filter((job) => WANTED(job.title)).map((job) => fromGreenhouse(job, company)) };
  },
  lever: async (token, company) => {
    const jobs = await getJson(`https://api.lever.co/v0/postings/${token}?mode=json`, 1);
    return { ids: jobs.map((job) => job.id), items: jobs.filter((job) => WANTED(job.text)).map((job) => fromLever(job, company)) };
  },
  ashby: async (token, company) => {
    const { jobs } = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${token}`, 1);
    const shown = jobs.filter((job) => job.isListed !== false);
    return { ids: jobs.map((job) => job.id), items: shown.filter((job) => WANTED(job.title)).map((job) => fromAshby(job, company)) };
  },
};

/** Every company with a job board, from the curated list plus any board that a listing links to. */
function findCompanies(rows) {
  const boards = new Map();
  const sites = new Map();
  for (const [kind, companies] of Object.entries(curated)) {
    for (const [token, company] of Object.entries(companies)) boards.set(`${kind}/${token}`, { kind, token, company });
  }
  for (const row of rows) {
    const board = parseBoardLink(row.url ?? "");
    if (board && !boards.has(`${board.kind}/${board.token}`)) {
      boards.set(`${board.kind}/${board.token}`, { ...board, company: row.company_name });
    }
    const site = parseCareerSite(row.url ?? "");
    if (site && !sites.has(`${site.kind}/${site.token}`)) sites.set(`${site.kind}/${site.token}`, { ...site, company: row.company_name });
  }
  return { boards: [...boards.values()], sites: [...sites.values()] };
}

/** Rows from the extra lists. One that fails only means fewer companies to read today. */
async function moreBoardRows() {
  const results = await inBatches(MORE_BOARD_LISTS.map((url) => async () => {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${res.status} from ${url}`);
    return rowsFromTable(await res.text());
  }));
  results.filter((r) => r.status === "rejected").forEach((r) => console.warn(`A list of job boards failed: ${r.reason.message}`));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** Each board's wanted jobs, and its open job ids, used later to spot listings that have closed. */
async function readBoards(boards) {
  const results = await inBatches(boards.map(({ kind, token, company }) => () => BOARD_APIS[kind](token, company)));
  const open = new Map();
  const items = [];
  results.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    open.set(`${boards[i].kind}/${boards[i].token}`, new Set(result.value.ids.map((id) => String(id).toLowerCase())));
    items.push(...result.value.items);
  });
  return { items, open, failed: results.filter((r) => r.status === "rejected").length };
}

async function readSmartRecruiters(sites) {
  const results = await inBatches(sites.map(({ token }) => async () => {
    const { content } = await getJson(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100&country=us`, 1);
    return content.filter((job) => WANTED(job.name)).map((job) => fromSmartRecruiters(job, token));
  }));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function workdayPage(site, searchText, offset) {
  return getJson(`https://${site.host}/wday/cxs/${site.token}/${site.site}/jobs`, 1, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }),
  });
}

async function readWorkday(sites) {
  const results = await inBatches(sites.map((site) => async () => {
    const found = [];
    for (const [search, pages] of WORKDAY_SEARCHES) {
      for (let page = 0; page < pages; page++) {
        const { jobPostings = [], total = 0 } = await workdayPage(site, search, page * 20);
        found.push(...jobPostings.filter((job) => WANTED(job.title)).map((job) => fromWorkday(job, site)));
        if ((page + 1) * 20 >= total) break;
      }
    }
    return found;
  }), 4);
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** Takes what it can: a level that stops partway keeps its pages, and the other levels still run. */
async function readMuse() {
  const items = [];
  for (const level of MUSE_LEVELS) {
    try {
      for (let page = 0; page < MUSE_PAGES; page++) {
        const { results = [], page_count: last = 0 } = await getJson(
          `https://www.themuse.com/api/public/jobs?page=${page}&descending=true&level=${encodeURIComponent(level)}`, 2,
        );
        items.push(...results.map(fromMuse));
        if (page + 1 >= last) break;
      }
    } catch (err) {
      console.warn(`The Muse's ${level} jobs stopped early: ${err.message}`);
    }
  }
  if (!items.length) throw new Error("The Muse gave nothing");
  return items;
}

/** Size bands from BigPicture's company dataset, kept between runs and read again when enough companies are new. */
async function companyBands(companies) {
  const known = existsSync(COMPANY_BANDS) ? JSON.parse(readFileSync(COMPANY_BANDS)) : {};
  const unknown = companies.filter((name) => !(name in known));
  if (unknown.length >= NEW_COMPANIES_FOR_BANDS) {
    try {
      Object.assign(known, await readBands(unknown, simpleCompany));
      console.log(`Company dataset: looked up ${unknown.length} companies`);
    } catch (err) {
      console.warn(`Company dataset failed: ${err.message}`);
    }
  }
  writeFileSync(COMPANY_BANDS, JSON.stringify(known));
  return known;
}

/** Employee counts from Wikidata, kept between runs. Most small companies aren't there, so they stay unknown. */
async function companySizes(companies) {
  const known = existsSync(COMPANY_SIZES) ? JSON.parse(readFileSync(COMPANY_SIZES)) : {};
  const unknown = companies.filter((name) => !(name in known) && !/["\\\n]/.test(name)).slice(0, SIZE_LOOKUPS);
  for (let i = 0; i < unknown.length; i += SIZE_BATCH) {
    const names = unknown.slice(i, i + SIZE_BATCH);
    const query = `SELECT ?label (MAX(?n) AS ?employees) WHERE {
      VALUES ?label { ${names.map((name) => `"${name}"@en`).join(" ")} }
      ?company rdfs:label ?label ; wdt:P1128 ?n ; wdt:P31/wdt:P279* wd:Q4830453 .
    } GROUP BY ?label`;
    try {
      const { results } = await getJson("https://query.wikidata.org/sparql", 2, {
        method: "POST",
        headers: { ...HEADERS, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ query }),
      });
      const found = new Map(results.bindings.map((row) => [row.label.value, Number(row.employees.value)]));
      names.forEach((name) => { known[name] = found.get(name) ?? null; });
    } catch (err) {
      console.warn(`Company sizes stopped early: ${err.message}`);
      break;
    }
    await new Promise((done) => setTimeout(done, 1500));
  }
  writeFileSync(COMPANY_SIZES, JSON.stringify(known, null, 1));
  return known;
}

/** Swaps short links for where they go, asking only about ones not seen before. A link that fails stays short. */
async function resolveShortLinks(items) {
  const known = existsSync(SHORT_LINKS) ? JSON.parse(readFileSync(SHORT_LINKS)) : {};
  const short = [...new Set(items.map((item) => item.url).filter(isShortLink))];
  const results = await inBatches(short.filter((url) => !known[url]).map((url) => async () => {
    const res = await fetch(url, { redirect: "manual", headers: HEADERS, signal: AbortSignal.timeout(20_000) });
    const target = res.headers.get("location");
    if (!isHttpUrl(target)) throw new Error(`${url} goes nowhere`);
    return [url, target];
  }));
  const found = { ...known, ...Object.fromEntries(results.filter((r) => r.status === "fulfilled").map((r) => r.value)) };
  writeFileSync(SHORT_LINKS, JSON.stringify(Object.fromEntries(short.filter((url) => found[url]).map((url) => [url, found[url]])), null, 1));
  return items.map((item) => (found[item.url] ? { ...item, url: found[item.url] } : item));
}

/**
 * Drops listings whose job has left its Greenhouse, Lever or Ashby board. Most other job sites answer a closed
 * job with a normal page, so they can't be checked this way. A board that can't be read leaves its listings alone.
 */
function withoutClosedJobs(items, open) {
  return items.filter((item) => {
    const board = parseBoardLink(item.url);
    const ids = board?.id && open.get(`${board.kind}/${board.token}`);
    return !ids || ids.has(board.id);
  });
}

/** When each listing first appeared, so the page can mark what's new. */
function withDatesAdded(items, previous, now) {
  const added = new Map(previous.flatMap((item) => [[item.url, item.added], [item.id, item.added]]));
  const firstRun = !previous.some((item) => item.added);
  return items.map((item) => ({ ...item, added: added.get(item.url) ?? added.get(item.id) ?? (firstRun ? item.posted ?? now : now) }));
}

/** Reads one source, reporting it either way, so a failure can't stop the others. */
async function gather(report, name, work) {
  try {
    const items = await work();
    report.push({ name, count: items.length, ok: true });
    console.log(`${name}: ${items.length}`);
    return items;
  } catch (err) {
    console.warn(`${name} failed: ${err.message}`);
    report.push({ name, count: 0, ok: false });
    return [];
  }
}

async function main() {
  const report = [];
  const allRows = [];
  const fromLists = [];
  const closedPages = new Set();
  const openPages = new Set();
  for (const { name, url, convert } of LISTS) {
    fromLists.push(...await gather(report, name, async () => {
      const rows = await getJson(url);
      const items = listed(rows).map(convert);
      allRows.push(...rows);
      rows.filter((row) => !row.active).forEach((row) => closedPages.add(pageOf(row.url)));
      items.forEach((item) => openPages.add(pageOf(item.url)));
      return items;
    }));
  }

  // the main lists come first, so their company names win
  const { boards, sites } = findCompanies([...allRows, ...await moreBoardRows()]);
  console.log(`${boards.length} job boards and ${sites.length} career sites to read`);
  const board = await readBoards(boards);
  report.push({ name: "Company job boards", count: board.items.length, ok: board.failed < boards.length / 2 });
  console.log(`Company job boards: ${board.items.length}, ${board.failed} of ${boards.length} unreadable`);

  // direct company links come first, so they win duplicates
  const smart = await gather(report, "SmartRecruiters", () => readSmartRecruiters(sites.filter((s) => s.kind === "smartrecruiters")));
  const workday = await gather(report, "Workday", () => readWorkday(sites.filter((s) => s.kind === "workday")));
  const muse = await gather(report, "The Muse", readMuse);
  const collected = [...board.items, ...smart, ...workday, ...fromLists, ...muse];

  const direct = await resolveShortLinks(collected);
  // one list can still show a job that another has marked closed
  const stillOpen = direct.filter((item) => openPages.has(pageOf(item.url)) || !closedPages.has(pageOf(item.url)));
  const inUS = stillOpen.map(usOnly).filter(Boolean);
  const merged = dedupe(inUS.filter((item) => keep(item)).map((item) => withoutEndedTerms(item)));
  const open = withoutClosedJobs(merged, board.open);

  const previous = [OUTPUT, MID_OUTPUT, SENIOR_OUTPUT].flatMap((file) => (existsSync(file) ? JSON.parse(readFileSync(file)).items : []));
  if (open.length < previous.length / 2) {
    throw new Error(`Only ${open.length} listings, down from ${previous.length}. Keeping the old files.`);
  }

  const companies = [...new Set(open.map((item) => item.company))];
  const sizes = await companySizes(companies);
  const datasetBands = await companyBands(companies);
  const openings = {};
  for (const item of open) openings[item.company] = (openings[item.company] ?? 0) + 1;
  const now = Math.round(Date.now() / 1000);
  const items = withDatesAdded(open, previous, now)
    .map((item) => {
      const band = sizeBand(sizes[item.company], datasetBands[item.company], openings[item.company]);
      return { ...item, ...(sizes[item.company] && { employees: sizes[item.company] }), ...(band !== null && { band }) };
    })
    .sort((a, b) => (b.posted ?? 0) - (a.posted ?? 0));
  const ofLevels = (...levels) => items.filter((item) => levels.includes(item.type));
  writeFileSync(OUTPUT, JSON.stringify({ updated: now, sources: report, items: ofLevels("internship", "entry") }));
  writeFileSync(MID_OUTPUT, JSON.stringify({ items: ofLevels("mid") }));
  writeFileSync(SENIOR_OUTPUT, JSON.stringify({ items: ofLevels("senior") }));
  console.log(`${items.length} jobs from ${collected.length} listings: ${stillOpen.length - inUS.length} outside the U.S., ${merged.length - open.length} closed on their boards`, report);
  console.log("by level", Object.fromEntries(["internship", "entry", "mid", "senior"].map((level) => [level, ofLevels(level).length])));
  console.log(`${items.filter((item) => item.band !== undefined).length} with a company size; ${items.filter((item) => isShortLink(item.url)).length} short links left`);

  // the listings are saved, but a missing list is worth knowing about. The Muse closed its public API in November 2026.
  if (report.some((source) => !source.ok && !["Workday", "SmartRecruiters", "The Muse"].includes(source.name))) process.exitCode = 1;
}

await main();
