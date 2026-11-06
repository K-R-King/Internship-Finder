// Turns each source's listings into one shape, used by scripts/sync-internships.mjs. Everything here is pure.

const INTERN_TITLE = /\b(interns?|internships?|co-?ops?)\b/i;
const NOT_UNIVERSITY = /\bhigh school\b/i;
const GRAD_TITLE = /\b(ph\.?d|doctoral|doctorate|master'?s|mba|jd|postdoc(toral)?)\b/i;
const TERM = /\b(spring|summer|fall|autumn|winter)\s*(?:of\s*)?'?(20\d\d)\b/gi;

// first match wins, so the more specific fields come first
const FIELDS = [
  ["Quant", /\b(quant|quantitative|trading|trader)\b/i],
  ["AI & Data", /machine learning|\b(ml|ai|nlp|llm)\b|data (scien|analy|engineer)|analytics|research scientist/i],
  ["Hardware", /hardware|electrical|mechanical|embedded|firmware|fpga|asic|robotics|manufactur|aerospace|avionics|propulsion|silicon/i],
  ["Other Engineering", /\b(civil|chemical|environmental|biomedical|structural|materials|nuclear|petroleum|geotechnical|industrial|process|photonics|optical)\b.*\bengineer/i],
  ["Business & Finance", /\b(sales|solutions) engineer/i],
  ["Software", /software|developer|back.?end|front.?end|full.?stack|devops|\bsre\b|reliability|security|infrastructure|mobile|\bios\b|android|technical|programming|\bit\b/i],
  ["Design", /design|\bux\b|\bui\b/i],
  ["Product", /product|\bapm\b|program manag/i],
  ["Marketing & Comms", /marketing|communications|\bbrand\b|content|social media|\bpr\b|growth/i],
  ["People & Legal", /recruit|talent|people|human resources|\bhr\b|legal|compliance|policy/i],
  ["Business & Finance", /account|financ|audit|\btax\b|credit|risk|invest|banking|strategy|consult|operations|business|sales|partnership|controller/i],
];

// used when the title says nothing; these lists only cover tech-type roles
const LIST_CATEGORIES = [
  [/software/i, "Software"],
  [/ai|ml|data/i, "AI & Data"],
  [/hardware/i, "Hardware"],
  [/product/i, "Product"],
  [/quant/i, "Quant"],
];

const SPONSORSHIP = {
  "Offers Sponsorship": "offers",
  "Does Not Offer Sponsorship": "none",
  "U.S. Citizenship is Required": "citizens",
};

export const isInternship = (title) => INTERN_TITLE.test(title) && !NOT_UNIVERSITY.test(title);

export function fieldOf(title, category = "") {
  const byTitle = FIELDS.find(([, pattern]) => pattern.test(title));
  if (byTitle) return byTitle[0];
  const byCategory = LIST_CATEGORIES.find(([pattern]) => pattern.test(category));
  if (byCategory) return byCategory[1];
  return /\bengineer/i.test(title) ? "Other Engineering" : "Other";
}

export function termsIn(title) {
  return [...title.matchAll(TERM)].map(([, season, year]) => {
    const name = season.toLowerCase() === "autumn" ? "Fall" : season[0].toUpperCase() + season.slice(1).toLowerCase();
    return `${name} ${year}`;
  });
}

/** True once a term like "Summer 2026" is over. Winter may run into the next year, so it's kept until March. */
export function termHasPassed(term, now = new Date()) {
  const match = /^(Spring|Summer|Fall|Winter) (20\d\d)$/.exec(term);
  if (!match) return false;
  const year = Number(match[2]);
  const end = { Spring: [year, 5], Summer: [year, 8], Fall: [year, 12], Winter: [year + 1, 3] }[match[1]];
  return now > new Date(Date.UTC(end[0], end[1], 0));
}

export const isHttpUrl = (url) => /^https?:\/\//i.test(url ?? "");

/** Terms without repeats: a bare "Summer" adds nothing next to "Summer 2027". */
function tidyTerms(terms) {
  const unique = [...new Set(terms)];
  return unique.filter((term) => /\d/.test(term) || !unique.some((other) => other.startsWith(`${term} `)));
}

function listing({ id, company, title, url, locations, terms = [], category, degrees = [], sponsorship, posted, source }) {
  const name = (title ?? "").trim();
  const grad = degrees.length > 0 && !degrees.some((d) => /bachelor|associate/i.test(d));
  const allTerms = tidyTerms([...terms, ...termsIn(name)]);
  return {
    id: `${source}:${id}`,
    company: (company ?? "").trim(),
    title: name,
    url,
    locations: [...new Set((locations ?? []).map((l) => (l ?? "").trim()).filter(Boolean))],
    terms: allTerms,
    field: fieldOf(name, category),
    gradOnly: grad || GRAD_TITLE.test(name),
    sponsorship: SPONSORSHIP[sponsorship] ?? null,
    posted: posted ?? null,  // seconds since 1970
    source,
  };
}

const seconds = (date) => {
  const time = typeof date === "number" ? date : Date.parse(date ?? "");
  return Number.isNaN(time) ? null : Math.round(time / 1000);
};

export const fromSimplify = (row) => listing({
  id: row.id, company: row.company_name, title: row.title, url: row.url, locations: row.locations,
  terms: (row.terms ?? []).filter((t) => t !== "N/A"), category: row.category, degrees: row.degrees ?? [],
  sponsorship: row.sponsorship, posted: row.date_posted, source: "Simplify",
});

export const fromVansh = (row) => listing({
  id: row.id, company: row.company_name, title: row.title, url: row.url, locations: row.locations,
  terms: (row.season ?? "").split("/").filter(Boolean), sponsorship: row.sponsorship, posted: row.date_posted,
  source: "Summer Internships list",
});

export const fromGreenhouse = (job, company) => listing({
  id: job.id, company, title: job.title, url: job.absolute_url, locations: [job.location?.name],
  posted: seconds(job.first_published ?? job.updated_at), source: "Greenhouse",
});

export const fromLever = (job, company) => listing({
  id: job.id, company, title: job.text, url: job.hostedUrl,
  locations: [job.categories?.location, ...(job.categories?.allLocations ?? [])],
  posted: seconds(job.createdAt), source: "Lever",
});

export const fromAshby = (job, company) => listing({
  id: job.id ?? job.jobUrl, company, title: job.title, url: job.jobUrl ?? job.applyUrl,
  locations: [job.isRemote ? "Remote" : null, job.location, ...(job.secondaryLocations ?? []).map((l) => l.location)],
  posted: seconds(job.publishedAt), source: "Ashby",
});

const YEAR = 365 * 86400;

/** Listings this old are probably abandoned, unless they name a term that's still ahead. */
function isStale(item, now) {
  if (!item.posted) return false;
  const age = now.getTime() / 1000 - item.posted;
  const namesAYear = item.terms.some((t) => /\d/.test(t));
  return age > 2 * YEAR || (age > YEAR && !namesAYear);
}

/** Listings worth showing: real university internships, with a link, for a term that hasn't ended. */
export function keep(item, now = new Date()) {
  if (!item.company || !isInternship(item.title) || !isHttpUrl(item.url) || isStale(item, now)) return false;
  return item.terms.length === 0 || item.terms.some((t) => !termHasPassed(t, now));
}

const simple = (text) => text.toLowerCase()
  .replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b\.?/g, "")
  .replace(/[^a-z0-9]/g, "");

// words that vary between sources for one company: "Palantir" and "Palantir Technologies"
const simpleCompany = (name) => simple(name.toLowerCase().replace(/\b(technologies|technology|international|industries|holdings|group|labs)\b/g, ""));

const pageOf = (url) => url.toLowerCase().split(/[?#]/)[0].replace(/\/$/, "");
const isShortLink = (url) => /^https?:\/\/go\.vansh\.nyc\//i.test(url);
const seasons = (item) => item.terms.map((t) => t.split(" ")[0]);

/**
 * Same posting listed twice? Same page, or the same place and an overlapping season. Roles that share a
 * title but differ in place or season are separate postings, each with its own Apply link. A short link
 * can't be compared and sources write places differently, so one is dropped for a direct link to that role.
 */
function samePosting(a, b) {
  if (pageOf(a.url) === pageOf(b.url)) return true;
  const samePlace = a.locations.some((l) => b.locations.includes(l));
  const sameSeason = !a.terms.length || !b.terms.length || seasons(a).some((s) => seasons(b).includes(s));
  return sameSeason && (samePlace || isShortLink(a.url) !== isShortLink(b.url));
}

/** One entry per posting, whichever sources list it. Earlier items win, so pass the most direct sources first. */
export function dedupe(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${simpleCompany(item.company)}|${simple(item.title)}`;
    if (!groups.has(key)) groups.set(key, []);
    const group = groups.get(key);
    const first = group.find((other) => samePosting(other, item));
    if (!first) {
      group.push({ ...item });
      continue;
    }
    // a short link's places may belong to a different posting of this role
    if (pageOf(first.url) === pageOf(item.url)) first.locations = [...new Set([...first.locations, ...item.locations])];
    first.terms = tidyTerms([...first.terms, ...item.terms]);
    first.posted = Math.max(first.posted ?? 0, item.posted ?? 0) || null;
    first.gradOnly &&= item.gradOnly;
    first.sponsorship ??= item.sponsorship;
  }
  return [...groups.values()].flat();
}
