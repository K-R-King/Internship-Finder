// Gathers internships from every source into public/internships.json. Run with: npm run sync
// A source that fails is skipped and reported; if the result shrinks by more than half, the old file is kept.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  dedupe, fromAshby, fromGreenhouse, fromLever, fromSimplify, fromVansh, isHttpUrl, isInternship, isShortLink, keep,
  pageOf, parseBoardLink,
} from "../lib/normalize.mjs";

const OUTPUT = new URL("../public/internships.json", import.meta.url);
const SHORT_LINKS = new URL("../data/short-links.json", import.meta.url);  // short link -> where it goes
const HEADERS = { "User-Agent": "internship-finder" };
const boards = JSON.parse(readFileSync(new URL("../data/boards.json", import.meta.url)));

const LISTS = {
  simplify: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
  vansh: "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json",
};

async function getJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((done) => setTimeout(done, attempt * 1000));
    }
  }
}

const listed = (rows) => rows.filter((row) => row.active && row.is_visible !== false);

const BOARD_APIS = {
  greenhouse: async (token, company) => (await getJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`)).jobs
    .filter((job) => isInternship(job.title)).map((job) => fromGreenhouse(job, company)),
  lever: async (token, company) => (await getJson(`https://api.lever.co/v0/postings/${token}?mode=json`))
    .filter((job) => isInternship(job.text)).map((job) => fromLever(job, company)),
  ashby: async (token, company) => (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${token}`)).jobs
    .filter((job) => job.isListed !== false && isInternship(job.title)).map((job) => fromAshby(job, company)),
};

/** Runs tasks a few at a time, to go easy on the job boards. */
async function inBatches(tasks, size = 6) {
  const results = [];
  for (let i = 0; i < tasks.length; i += size) {
    results.push(...await Promise.allSettled(tasks.slice(i, i + size).map((task) => task())));
  }
  return results;
}

async function companyBoards() {
  const entries = Object.entries(boards).flatMap(([kind, companies]) =>
    Object.entries(companies).map(([token, company]) => ({ kind, token, company })));
  const results = await inBatches(entries.map(({ kind, token, company }) => () => BOARD_APIS[kind](token, company)));
  const failed = entries.filter((_, i) => results[i].status === "rejected").map((e) => e.company);
  return { items: results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])), failed };
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

const OPEN_JOB_IDS = {
  greenhouse: async (token) => (await getJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`, 1)).jobs.map((job) => job.id),
  lever: async (token) => (await getJson(`https://api.lever.co/v0/postings/${token}?mode=json`, 1)).map((job) => job.id),
  ashby: async (token) => (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${token}`, 1)).jobs.map((job) => job.id),
};

/**
 * Drops listings whose job has left its Greenhouse, Lever or Ashby board. Most other job sites answer a closed
 * job with a normal page, so they can't be checked this way. A board that can't be read leaves its listings alone.
 */
async function withoutClosedJobs(items) {
  const boardsUsed = [...new Set(items.map((item) => parseBoardLink(item.url)).filter(Boolean).map((b) => `${b.kind}/${b.token}`))];
  const results = await inBatches(boardsUsed.map((board) => () => {
    const [kind, token] = board.split("/");
    return OPEN_JOB_IDS[kind](token);
  }));
  const open = new Map();
  results.forEach((result, i) => {
    if (result.status === "fulfilled") open.set(boardsUsed[i], new Set(result.value.map((id) => String(id).toLowerCase())));
  });
  return items.filter((item) => {
    const board = parseBoardLink(item.url);
    const ids = board && open.get(`${board.kind}/${board.token}`);
    return !ids || ids.has(board.id);
  });
}

/** When each listing first appeared, so the page can mark what's new. */
function withDatesAdded(items, previous, now) {
  const added = new Map(previous.flatMap((item) => [[item.url, item.added], [item.id, item.added]]));
  const firstRun = !previous.some((item) => item.added);
  return items.map((item) => ({ ...item, added: added.get(item.url) ?? added.get(item.id) ?? (firstRun ? item.posted ?? now : now) }));
}

async function main() {
  const report = [];
  const board = await companyBoards();
  report.push({ name: "Company job boards", count: board.items.length, ok: board.failed.length === 0 });
  if (board.failed.length) console.warn(`Boards that failed: ${board.failed.join(", ")}`);

  const collected = [...board.items];  // direct company links come first, so they win duplicates
  const closedPages = new Set();
  const openPages = new Set();
  for (const [name, url, convert] of [
    ["SimplifyJobs list", LISTS.simplify, fromSimplify],
    ["Summer Internships list", LISTS.vansh, fromVansh],
  ]) {
    try {
      const rows = await getJson(url);
      const items = listed(rows).map(convert);
      rows.filter((row) => !row.active).forEach((row) => closedPages.add(pageOf(row.url)));
      items.forEach((item) => openPages.add(pageOf(item.url)));
      collected.push(...items);
      report.push({ name, count: items.length, ok: true });
    } catch (err) {
      console.warn(`${name} failed: ${err.message}`);
      report.push({ name, count: 0, ok: false });
    }
  }

  const direct = await resolveShortLinks(collected);
  // one list can still show a job that another has marked closed
  const stillOpen = direct.filter((item) => openPages.has(pageOf(item.url)) || !closedPages.has(pageOf(item.url)));
  const merged = dedupe(stillOpen.filter((item) => keep(item)));
  const open = await withoutClosedJobs(merged);

  const previous = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT)).items : [];
  if (open.length < previous.length / 2) {
    throw new Error(`Only ${open.length} listings, down from ${previous.length}. Keeping the old file.`);
  }

  const now = Math.round(Date.now() / 1000);
  const items = withDatesAdded(open, previous, now).sort((a, b) => (b.posted ?? 0) - (a.posted ?? 0));
  writeFileSync(OUTPUT, JSON.stringify({ updated: now, sources: report, items }));
  console.log(`${items.length} internships from ${collected.length} listings, ${merged.length - open.length} closed on their boards`, report);
  console.log(`${items.filter((item) => isShortLink(item.url)).length} short links left`);

  // the listings are saved, but a missing list is worth knowing about
  if (report.some((source) => !source.ok && source.name !== "Company job boards")) process.exitCode = 1;
}

await main();
