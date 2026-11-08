// Company size bands from BigPicture's free company dataset (ODC-BY, about 17 million companies). The file is
// big (630 MB compressed), so it's streamed once, keeping only the companies asked about.
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";

export const BIGPICTURE = "https://huggingface.co/datasets/bigpictureio/companies-2023-q4-sm/resolve/main/companies-2023-q4-sm.csv.gz";

/** One CSV line into fields, allowing quoted fields with commas and doubled quotes. */
export function csvFields(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { fields.push(field); field = ""; }
    else field += c;
  }
  fields.push(field);
  return fields;
}

const ORDER = ["1-10", "11-50", "51-200", "201-500", "501-1K", "1K-5K", "5K-10K", "10K+"];

/**
 * How likely a row is to be the company we mean. Many companies share a name ("Block" has 26), and the ones posting
 * on job boards are usually the big ones, so the largest U.S. company wins, then the largest anywhere. Checked
 * against Wikidata's exact counts, this lands in the right band for about 7 in 10 companies.
 */
export function matchScore(row) {
  const band = ORDER.indexOf(row.size);
  if (band < 0) return -1;
  return (row.country_code?.toLowerCase() === "us" ? 100 : 0) + band;
}

/** Size bands for the companies named, as { name: band or null }. */
export async function readBands(names, simplify, source = BIGPICTURE) {
  const wanted = new Map();
  for (const name of names) {
    const key = simplify(name);
    if (key) wanted.set(key, [...(wanted.get(key) ?? []), name]);
  }
  const best = new Map();  // key -> { score, band }

  const res = await fetch(source, { headers: { "User-Agent": "internship-finder" } });
  if (!res.ok) throw new Error(`${res.status} from the company dataset`);
  const lines = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity });
  let header = null;
  for await (const line of lines) {
    if (!header) { header = csvFields(line); continue; }
    const cells = csvFields(line);
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    if (!row.size) continue;
    const key = simplify(row.name ?? "");
    if (!wanted.has(key)) continue;
    const score = matchScore(row);
    if (score > (best.get(key)?.score ?? -1)) best.set(key, { score, band: row.size });
  }

  const bands = {};
  for (const [key, original] of wanted) {
    for (const name of original) bands[name] = best.get(key)?.band ?? null;
  }
  return bands;
}
