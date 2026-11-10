// Turns each source's listings into one shape, used by scripts/sync-internships.mjs. Everything here is pure.

const INTERN_TITLE = /\b(interns?|internships?|co-?ops?|summer (students?|analysts?|associates?)|student (workers?|assistants?|interns?|employees?|researchers?))\b/i;
const ENTRY_TITLE = /\b(new grad(uate)?s?|entry.level|early career|recent grad(uate)?s?|university grad(uate)?s?|college grad(uate)?s?|junior|jr\.?|graduate (program|engineer|analyst|developer|scientist)|(engineer|developer|analyst|scientist|technician) (i|1))\b/i;
const TOO_SENIOR = /\b(senior|sr\.?|staff|lead|principal|manager|director|head of|vice president|vp|architect|ii|iii|iv)\b/i;
const SENIOR_TITLE = /\b(senior|sr\.?|staff|principal|lead|director|head of|vice president|vp|chief|architect|distinguished|iii|iv|engineering manager|general manager)\b/i;
const NEEDS_CITIZENSHIP = /\b(security )?clearance\b|\bu\.?s\.? citizen|\bts\/sci\b/i;
const NOT_UNIVERSITY = /\bhigh school\b/i;
const GRAD_TITLE = /\b(ph\.?d|doctoral|doctorate|master'?s|mba|jd|postdoc(toral)?)\b/i;
const TERM = /\b(spring|summer|fall|autumn|winter)\s*(?:of\s*)?'?(20\d\d)\b/gi;

// first match wins, so the more specific fields come first
/** @type {[string, RegExp][]} */
const FIELDS = [
  ["Healthcare", /\b(nurse|nursing|rn|lpn|lvn|clinical|pharmac\w*|therapist|medical assistant|caregiver|dental)\b/i],
  ["Education", /\b(teacher|tutor|teaching|instructor)\b/i],
  ["Retail & Service", /\b(retail|store|barista|cashier|hospitality|restaurant|warehouse|driver|customer service)\b/i],
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
/** @type {[RegExp, string][]} */
const LIST_CATEGORIES = [
  [/software/i, "Software"],
  [/\bai\b|\bml\b|data/i, "AI & Data"],
  [/hardware/i, "Hardware"],
  [/product/i, "Product"],
  [/quant/i, "Quant"],
  [/health|medical/i, "Healthcare"],
  [/education/i, "Education"],
  [/retail|food|hospitality|customer/i, "Retail & Service"],
  [/account|financ|sales|business|consult/i, "Business & Finance"],
  [/marketing|media|\bpr\b|writing/i, "Marketing & Comms"],
  [/human resources|recruit|legal/i, "People & Legal"],
  [/design|\bux\b/i, "Design"],
];

const SPONSORSHIP = {
  "Offers Sponsorship": "offers",
  "Does Not Offer Sponsorship": "none",
  "U.S. Citizenship is Required": "citizens",
};

export const isInternship = (title) => INTERN_TITLE.test(title) && !NOT_UNIVERSITY.test(title);
export const isEntryLevel = (title) => ENTRY_TITLE.test(title) && !TOO_SENIOR.test(title) && !NOT_UNIVERSITY.test(title);

/** A title's experience level. A title that doesn't say counts as mid level. Null if it isn't for adults at all. */
export function jobType(title) {
  if (NOT_UNIVERSITY.test(title)) return null;
  if (isInternship(title)) return "internship";
  if (isEntryLevel(title)) return "entry";
  return SENIOR_TITLE.test(title) ? "senior" : "mid";
}

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

/** "Summer" alone means the next one to start. Winter counts from December, like the lists' "Winter 2026". */
export function withYear(term, now = new Date()) {
  const starts = { Spring: 0, Summer: 5, Fall: 8, Winter: 11 }[term];
  if (starts === undefined) return term;
  return `${term} ${now.getUTCMonth() < starts ? now.getUTCFullYear() : now.getUTCFullYear() + 1}`;
}

const NOT_US_COUNTRY = /\b(canada|united kingdom|uk|u\.k\.|england|scotland|wales|ireland|germany|deutschland|france|spain|italy|netherlands|belgium|luxembourg|sweden|norway|denmark|finland|poland|romania|bulgaria|hungary|serbia|croatia|ukraine|czech\w*|slovakia|austria|switzerland|portugal|greece|cyprus|malta|estonia|latvia|lithuania|israel|india|pakistan|bangladesh|sri lanka|china|hong kong|taiwan|singapore|japan|korea|australia|new zealand|brazil|mexico|argentina|colombia|chile|peru|costa rica|philippines|malaysia|thailand|vietnam|indonesia|uae|united arab emirates|dubai|abu dhabi|saudi arabia|qatar|kuwait|south africa|nigeria|kenya|ghana|egypt|morocco|turkey|t\u00fcrkiye|emea|apac|latam|europe|asia|africa|worldwide|global)\b/i;
const CANADIAN_PROVINCE = /,\s*(ON|BC|QC|AB|MB|NS|NB|SK|NL|PE)\b/;
// Workday writes Canada as "CA", as in "CA-Ontario-Toronto", which would otherwise read as California
const CANADA_CODE = /^\s*(CAD\b|CA[\s.\-]+(ON|BC|QC|AB|MB|NS|Ontario|British Columbia|Quebec|Alberta|Manitoba|Toronto|Vancouver|Montr[e\u00e9]al|Ottawa|Mississauga|Calgary|Waterloo|Markham)\b)/i;
const NOT_US_CITY = /^\s*(london|toronto|vancouver|montreal|montr\u00e9al|ottawa|calgary|edmonton|waterloo|mississauga|markham|winnipeg|bengaluru|bangalore|hyderabad|mumbai|pune|gurgaon|gurugram|noida|chennai|delhi|shanghai|beijing|shenzhen|hangzhou|tokyo|seoul|sydney|melbourne|paris|berlin|munich|hamburg|amsterdam|dublin|zurich|stockholm|copenhagen|oslo|helsinki|warsaw|krakow|prague|vienna|madrid|barcelona|lisbon|milan|rome|tel aviv|mexico city|s\u00e3o paulo|sao paulo|manila|bangkok|jakarta|kuala lumpur)\b/i;
// a foreign city anywhere, as in Workday's "DE-Munich-MSO", unless the place also names a U.S. city or state
const NOT_US_CITY_ANYWHERE = new RegExp(NOT_US_CITY.source.replace("^\\s*", "(^|[^a-z])"), "i");
const US_STATE_AFTER_COMMA = /,\s*(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/;
// a place that starts with another country's code, as Workday writes them: "MEX - Tijuana", "DEU - Remote"
const COUNTRY_PREFIX = /^\s*(MEX|DEU|GBR|IND|CAN|CHN|JPN|BRA|FRA|ESP|ITA|NLD|POL|IRL|ISR|SGP|AUS|CHE|SWE|KOR|TWN|PHL|ARG|COL|CRI|ROU|CZE|HUN|PRT|BEL|AUT|DNK|NOR|FIN|MYS|THA|VNM|IDN|ZAF|ARE|SAU|TUR|EGY)\b/;
// "America" alone also means North or South America, so it doesn't count
const US_MARK = /\b(usa?|u\.s\.a?\.?|united states|nationwide)\b/i;
// codes that are both a U.S. state and a country: "Berlin, DE" is Germany, "London, CA" is Canada
const STATE_OR_COUNTRY = /,\s*(DE|IN|IL|CA)\b/;
const US_STATE_CODE = /(^|[\s,(/-])(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])($|[\s,)/.-])/;
const US_STATE_NAME = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\b/i;
const US_CITY = /\b(sf|nyc|bay area|silicon valley|san francisco|san jose|los angeles|san diego|seattle|chicago|boston|austin|dallas|houston|denver|atlanta|miami|philadelphia|phoenix|portland|detroit|minneapolis|pittsburgh|nashville|charlotte|raleigh|salt lake city|las vegas|palo alto|mountain view|sunnyvale|santa clara|menlo park|redmond|bellevue|cambridge|brooklyn|manhattan)\b/i;

/** Is this place in the U.S.? A place that names no country counts only if it's clearly American. */
export function isUSPlace(place) {
  if (NOT_US_COUNTRY.test(place) && !US_MARK.test(place)) return false;
  if (CANADIAN_PROVINCE.test(place) || CANADA_CODE.test(place) || COUNTRY_PREFIX.test(place)) return false;
  if (US_MARK.test(place)) return true;
  if (NOT_US_CITY.test(place) && !(US_STATE_AFTER_COMMA.test(place) && !STATE_OR_COUNTRY.test(place))) return false;
  if (NOT_US_CITY_ANYWHERE.test(place) && !US_CITY.test(place) && !US_STATE_AFTER_COMMA.test(place) && !US_STATE_NAME.test(place)) return false;
  if (US_STATE_CODE.test(place) || US_STATE_NAME.test(place)) return true;
  // "Hybrid" alone names no place at all
  return US_CITY.test(place) || /\b(remote|work from home|wfh)\b/i.test(place) || /^\s*flexible\b/i.test(place);
}

/** The listing with only its U.S. places, or null if it has none. */
export function usOnly(item) {
  const split = item.locations.flatMap((place) => place.split(/\s*[;|]\s*/)).map((place) => place.trim()).filter(Boolean);
  // some boards send ["Kansas City", "MO"] for one place
  const places = split.reduce((all, place) => {
    if (/^[A-Z]{2}$/.test(place) && all.length && !all.at(-1).includes(",")) all[all.length - 1] += `, ${place}`;
    else all.push(place);
    return all;
  }, []);
  const us = [...new Set(places.filter(isUSPlace))];
  return us.length ? { ...item, locations: us } : null;
}

export const isHttpUrl = (url) => /^https?:\/\//i.test(url ?? "");

/** Terms without repeats: a bare "Summer" adds nothing next to "Summer 2027". */
function tidyTerms(terms) {
  const unique = [...new Set(terms)];
  return unique.filter((term) => /\d/.test(term) || !unique.some((other) => other.startsWith(`${term} `)));
}

/** A short, steady id: two 32-bit hashes of the source's own id, so 100,000 listings won't collide. */
export function shortId(text) {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822507);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

function listing({ id, company, title, url, locations, terms = [], category, degrees = [], sponsorship, posted, source, type }) {
  const name = (title ?? "").trim();
  const grad = degrees.length > 0 && !degrees.some((d) => /bachelor|associate/i.test(d));
  const allTerms = tidyTerms([...terms, ...termsIn(name)]);
  return {
    id: shortId(`${source}:${id}`),
    company: (company ?? "").trim(),
    title: name,
    url,
    locations: [...new Set((locations ?? []).map((l) => (l ?? "").trim()).filter(Boolean))],
    terms: allTerms,
    field: fieldOf(name, category),
    gradOnly: grad || GRAD_TITLE.test(name),
    type: type ?? jobType(name) ?? "internship",
    sponsorship: NEEDS_CITIZENSHIP.test(name) ? "citizens" : SPONSORSHIP[sponsorship] ?? null,
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
  sponsorship: row.sponsorship, posted: row.date_posted, source: "Simplify", type: "internship",
});

export const fromNewGrad = (row) => listing({
  id: row.id, company: row.company_name, title: row.title, url: row.url, locations: row.locations,
  category: row.category, degrees: row.degrees ?? [], sponsorship: row.sponsorship, posted: row.date_posted,
  source: "New Grad list", type: "entry",
});

export const fromVansh = (row, now = new Date()) => listing({
  id: row.id, company: row.company_name, title: row.title, url: row.url, locations: row.locations,
  terms: (row.season ?? "").split("/").filter(Boolean).map((season) => withYear(season, now)), sponsorship: row.sponsorship, posted: row.date_posted,
  source: "Summer Internships list", type: "internship",
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

const BOARD_LINKS = [
  ["greenhouse", /^https?:\/\/(?:job-)?boards\.greenhouse\.io\/([^/?#]+)(?:\/jobs\/(\d+))?/i],
  ["lever", /^https?:\/\/jobs\.lever\.co\/([^/?#]+)(?:\/([0-9a-f-]{36}))?/i],
  ["ashby", /^https?:\/\/jobs\.ashbyhq\.com\/([^/?#]+)(?:\/([0-9a-f-]{36}))?/i],
];

/** The job board a link belongs to, for the boards that publish their open jobs. Null for anything else. */
export function parseBoardLink(url) {
  for (const [kind, pattern] of BOARD_LINKS) {
    const match = pattern.exec(url);
    if (match) return { kind, token: match[1].toLowerCase(), id: match[2]?.toLowerCase() ?? null };
  }
  return null;
}

/** The company and links on each row of a Markdown job table, in the shape findCompanies reads. */
export function rowsFromTable(text) {
  return text.split("\n").filter((line) => line.startsWith("|")).flatMap((line) => {
    const company = line.split("|")[1].replace(/<[^>]+>/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_]/g, "").trim();
    if (!company || company === "↳") return [];
    return [...line.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map(([url]) => ({ url, company_name: company }));
  });
}

/** A company's SmartRecruiters or Workday site, found in one of its job links. */
export function parseCareerSite(url) {
  const smart = /^https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([^/?#]+)/i.exec(url);
  if (smart) return { kind: "smartrecruiters", token: smart[1] };
  const workday = /^https?:\/\/([^./]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/.exec(url);
  if (workday && !["job", "details"].includes(workday[3])) {
    return { kind: "workday", token: workday[1], host: `${workday[1]}.${workday[2]}.myworkdayjobs.com`, site: workday[3] };
  }
  return null;
}

const YEAR = 365 * 86400;

/** Listings this old are probably abandoned, unless they name a term that's still ahead. */
function isStale(item, now) {
  if (!item.posted) return false;
  const age = now.getTime() / 1000 - item.posted;
  const namesAYear = item.terms.some((t) => /\d/.test(t));
  return age > 2 * YEAR || (age > YEAR && !namesAYear);
}

export const fromSmartRecruiters = (job, slug) => listing({
  id: job.id, company: job.company?.name ?? slug, title: job.name, url: `https://jobs.smartrecruiters.com/${slug}/${job.id}`,
  locations: [job.location?.remote ? "Remote" : null, [job.location?.city, job.location?.region].filter(Boolean).join(", ")],
  posted: seconds(job.releasedDate), source: "SmartRecruiters",
  type: { internship: "internship", entry_level: "entry", associate: "entry", director: "senior", executive: "senior" }[job.experienceLevel?.id],
});

function museLevel(levels) {
  if (levels.includes("Internship")) return "internship";
  if (levels.includes("Entry Level")) return "entry";
  return levels.includes("Mid Level") ? "mid" : "senior";
}

export const fromMuse = (job) => listing({
  id: job.id, company: job.company?.name, title: job.name, url: job.refs?.landing_page,
  locations: (job.locations ?? []).map((place) => (/flexible|remote/i.test(place.name) ? "Remote" : place.name)),
  category: job.categories?.[0]?.name, posted: seconds(job.publication_date), source: "The Muse",
  type: museLevel((job.levels ?? []).map((level) => level.name)),
});

function workdayPosted(text, now) {
  const day = 86400;
  const today = Math.round(now.getTime() / 1000);
  if (/today/i.test(text ?? "")) return today;
  if (/yesterday/i.test(text ?? "")) return today - day;
  const days = /(\d+)\+? days? ago/i.exec(text ?? "");
  return days ? today - Number(days[1]) * day : null;
}

function workdayPlace(job) {
  const text = job.locationsText ?? "";
  const place = /^\d+ locations?$/i.test(text) ? (job.externalPath ?? "").split("/")[2]?.replace(/-/g, " ") ?? "" : text;
  const parts = /^US(?:A)?[,\s-]+([A-Z]{2})[,\s-]+(.+)$/.exec(place);
  return parts ? `${parts[2].trim()}, ${parts[1]}` : place;
}

export const fromWorkday = (job, { host, site, company }, now = new Date()) => listing({
  id: `${host}${job.externalPath}`, company, title: job.title, url: `https://${host}/${site}${job.externalPath}`,
  locations: [workdayPlace(job)], posted: workdayPosted(job.postedOn, now), source: "Workday",
});

/** The listing without terms that have ended; a listing is kept while any term is still ahead. */
export const withoutEndedTerms = (item, now = new Date()) => ({ ...item, terms: item.terms.filter((t) => !termHasPassed(t, now)) });

// sources whose listings come with their level, so it needn't be in the title
const TRUSTED_LEVELS = new Set(["Simplify", "Summer Internships list", "New Grad list", "The Muse", "SmartRecruiters"]);

/** Listings worth showing: internships and entry-level jobs, with a link, for a term that hasn't ended. */
export function keep(item, now = new Date()) {
  // feeds that state the level can be trusted; elsewhere an internship has to say so in its title
  const fits = item.type === "internship" && !TRUSTED_LEVELS.has(item.source) ? isInternship(item.title) : !NOT_UNIVERSITY.test(item.title);
  if (!item.company || !fits || !isHttpUrl(item.url) || isStale(item, now)) return false;
  return item.terms.length === 0 || item.terms.some((t) => !termHasPassed(t, now));
}

const simple = (text) => text.toLowerCase()
  .replace(/\b(inc|incorporated|llc|llp|lp|ltd|limited|plc|gmbh|corp|corporation|co|company)\b\.?/g, "")
  .replace(/[^a-z0-9]/g, "");

// words that vary between sources for one company: "Palantir" and "Palantir Technologies"
export const simpleCompany = (name) => simple(name.toLowerCase().replace(/\b(technologies|technology|international|industries|holdings|group|labs)\b/g, ""));

export const pageOf = (url) => url.toLowerCase().split(/[?#]/)[0].replace(/\/$/, "").replace(/\/[a-z]{2}-[a-z]{2}\//, "/");
export const isShortLink = (url) => /^https?:\/\/go\.vansh\.nyc\//i.test(url);
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

// ---------- company size ----------
// The bands BigPicture's company dataset uses. Exact counts from Wikidata go in the same bands, so one filter
// covers both. Its "top" is the most employees a company in that band can have.
export const BANDS = [
  { id: "1-10", top: 10 }, { id: "11-50", top: 50 }, { id: "51-200", top: 200 }, { id: "201-500", top: 500 },
  { id: "501-1K", top: 1000 }, { id: "1K-5K", top: 5000 }, { id: "5K-10K", top: 10000 }, { id: "10K+", top: Infinity },
];

/**
 * A company's size band (an index into BANDS), or null. An exact count wins. A dataset band is matched by name,
 * so it's dropped when the company has more openings here than half its band allows: 40 openings can't come from a
 * company of 1 to 10, so that's another company with the same name.
 */
export function sizeBand(employees, datasetBand, openings) {
  if (employees) return BANDS.findIndex((band) => employees <= band.top);
  const index = BANDS.findIndex((band) => band.id === datasetBand);
  if (index < 0 || openings > BANDS[index].top / 2) return null;
  return index;
}
