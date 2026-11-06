// Gathers internships from every source into public/internships.json. Run with: npm run sync
// A source that fails is skipped and reported; if the result shrinks by more than half, the old file is kept.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  dedupe, fromAshby, fromGreenhouse, fromLever, fromSimplify, fromVansh, isInternship, keep,
} from "../lib/normalize.mjs";

const OUTPUT = new URL("../public/internships.json", import.meta.url);
const boards = JSON.parse(readFileSync(new URL("../data/boards.json", import.meta.url)));

const LISTS = {
  simplify: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
  vansh: "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json",
};

async function getJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "internship-finder" }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((done) => setTimeout(done, attempt * 1000));
    }
  }
}

const listed = (rows) => rows.filter((row) => row.active && row.is_visible !== false);

async function fromList(url, convert) {
  return listed(await getJson(url)).map(convert);
}

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

async function main() {
  const report = [];
  const board = await companyBoards();
  report.push({ name: "Company job boards", count: board.items.length, ok: board.failed.length === 0 });
  if (board.failed.length) console.warn(`Boards that failed: ${board.failed.join(", ")}`);

  const collected = [...board.items];  // direct company links come first, so they win duplicates
  for (const [name, url, convert] of [
    ["SimplifyJobs list", LISTS.simplify, fromSimplify],
    ["Summer Internships list", LISTS.vansh, fromVansh],
  ]) {
    try {
      const items = await fromList(url, convert);
      collected.push(...items);
      report.push({ name, count: items.length, ok: true });
    } catch (err) {
      console.warn(`${name} failed: ${err.message}`);
      report.push({ name, count: 0, ok: false });
    }
  }

  const items = dedupe(collected.filter((item) => keep(item))).sort((a, b) => (b.posted ?? 0) - (a.posted ?? 0));

  const previous = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT)).items.length : 0;
  if (items.length < previous / 2) {
    throw new Error(`Only ${items.length} listings, down from ${previous}. Keeping the old file.`);
  }

  writeFileSync(OUTPUT, JSON.stringify({ updated: Math.round(Date.now() / 1000), sources: report, items }));
  console.log(`${items.length} internships from ${collected.length} listings`, report);
}

await main();
