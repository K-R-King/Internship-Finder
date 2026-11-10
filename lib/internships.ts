import { STATES } from "./places";

export interface Internship {
  id: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  terms: string[];         // e.g. "Summer 2027"; empty when the listing doesn't say
  field: string;
  gradOnly: boolean;       // for graduate students
  type?: Level;            // older saved listings don't have one, and are internships
  employees?: number;      // the company's exact size, when it's known
  band?: number;           // the company's size band, an index into SIZES, when it's known
  sponsorship: "offers" | "none" | "citizens" | null;  // null when the listing doesn't say
  posted: number | null;   // seconds since 1970
  added?: number;          // when it first appeared here, seconds since 1970
  source: string;
}

export interface Data {
  updated: number;  // seconds since 1970
  sources: { name: string; count: number; ok: boolean }[];
  items: Internship[];
}

export type Level = "internship" | "entry" | "mid" | "senior";
export type Kind = "internship" | "job";
export type LevelChoice = "undergrad" | "grad" | "entry" | "mid" | "senior";
export type Status = "saved" | "applied";

/** Keyed by listing page, with a copy of the listing so it stays here after it closes. */
export type Tracked = Record<string, { status: Status; item: Internship }>;

export interface Filters {
  query: string;
  location: string;
  field: string[];   // any of these; empty means any field
  term: string[];    // any of these, e.g. "Summer 2027"; empty means any term
  kind: Kind;
  level: LevelChoice[];  // any of these, within the kind; empty means all of it
  size: string[];        // any of these indexes into SIZES; empty means any
  miles: string;         // how far from the location to look; "" means only the place named
  grad: string;          // when the student graduates, "2027-05"; "" means any
  verified: boolean;     // only listings from verified companies
  remote: boolean;
  sponsorship: boolean;  // hide listings that rule out visa sponsorship
  permanent: boolean;    // hide listings only for U.S. citizens
  fresh: boolean;        // only listings added since the last visit
  view: "all" | "saved" | "applied";
}

export const NO_FILTERS: Filters = {
  query: "", location: "", field: [], term: [], kind: "internship", level: [], size: [], miles: "", grad: "", verified: false, remote: false, sponsorship: false, permanent: false, fresh: false, view: "all",
};

// internships have no entry, mid or senior; what sets them apart is who can apply
export const LEVELS: Record<Kind, { id: LevelChoice; label: string }[]> = {
  internship: [
    { id: "undergrad", label: "Open to undergrads" },
    { id: "grad", label: "Graduate students only" },
  ],
  job: [
    { id: "entry", label: "Entry level" },
    { id: "mid", label: "Mid level" },
    { id: "senior", label: "Senior level" },
  ],
};

export const LEVEL_NAMES: Record<Level, string> = { internship: "Internship", entry: "Entry level", mid: "Mid level", senior: "Senior level" };

export const kindOf = (item: Internship): Kind => ((item.type ?? "internship") === "internship" ? "internship" : "job");

/** Levels kept in their own files, loaded only when someone asks for them. */
export function extraLevels(kind: Kind, levels: LevelChoice[]): ("mid" | "senior")[] {
  if (kind !== "job") return [];
  return (["mid", "senior"] as const).filter((level) => levels.length === 0 || levels.includes(level));
}

/** Whether a listing is the kind and level asked for. */
export function inLevel(item: Internship, kind: Kind, levels: LevelChoice[]): boolean {
  if (kindOf(item) !== kind) return false;
  if (levels.length === 0) return true;
  return levels.some((level) => (level === "undergrad" ? !item.gradOnly : level === "grad" ? item.gradOnly : item.type === level));
}

// the hiring systems employers post their own openings on
const HIRING_SYSTEM = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|myworkdaysite\.com|smartrecruiters\.com|icims\.com|jobvite\.com|workable\.com|taleo\.net|oraclecloud\.com|successfactors\.com|successfactors\.eu|bamboohr\.com|rippling\.com|paylocity\.com|ultipro\.com|dayforcehcm\.com|adp\.com)$/i;

const EMPLOYER_BOARDS = new Set(["Greenhouse", "Lever", "Ashby", "Workday", "SmartRecruiters"]);

/** Posted by the employer itself (its hiring system or its own website), by a company found in the company records. */
export function isVerified(item: Internship): boolean {
  if (item.employees === undefined && item.band === undefined) return false;
  if (EMPLOYER_BOARDS.has(item.source)) return true;
  try {
    const host = new URL(item.url).hostname.toLowerCase();
    const name = item.company.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
    return HIRING_SYSTEM.test(host) || (name.length >= 4 && host.includes(name));
  } catch {
    return false;
  }
}

const GRAD_WORDS = String.raw`(?:(?:new|university|college|ph\.?d\.?(?:\/abd)?|mba|masters?)\s+)*(?:grads?|graduates?|graduation)\b(?!\s+(?:intern|co-?op|fellow|associate|student|research|program|assistant))`;
const GRAD_YEAR = [
  /\bclass of\s+(20\d\d)\b/gi,
  new RegExp(String.raw`\b(20\d\d)\s+${GRAD_WORDS}`, "gi"),
  /\b(?:new grad\w*|graduat(?:ion|ing))\s+(?:in\s+)?(?:[a-z]+\s+)?(20\d\d)\b/gi,
];

/** The graduation years a title names: "Class of 2028", "May 2027 Grad", "2026 New College Graduate". */
export function graduationYears(title: string): number[] {
  return [...new Set(GRAD_YEAR.flatMap((pattern) => [...title.matchAll(pattern)].map((m) => Number(m[1]))))];
}

const TERM_STARTS: Record<string, number> = { Spring: 1, Summer: 6, Fall: 9, Winter: 12 };

/**
 * Whether a listing can fit someone graduating then ("2027-05"). Few listings say who they're for, so this removes the
 * ones that rule the student out: another class year in the title, or an internship that only starts after they've left.
 */
export function fitsGraduation(item: Internship, grad: string): boolean {
  const [year, month] = grad.split("-").map(Number);
  const named = graduationYears(item.title);
  if (named.length) return named.includes(year);
  if (kindOf(item) !== "internship") return true;
  const starts = item.terms.map((term) => term.split(" ")).filter(([season, y]) => TERM_STARTS[season] !== undefined && /^\d{4}$/.test(y ?? ""));
  return starts.length === 0 || starts.some(([season, y]) => Number(y) * 12 + TERM_STARTS[season] < year * 12 + month);
}

/** The next eight graduation dates, May and December. */
export function graduationOptions(now: number): { value: string; label: string }[] {
  const today = new Date(now * 1000);
  const options: { value: string; label: string }[] = [];
  for (let year = today.getUTCFullYear(); options.length < 8; year++) {
    for (const [month, name] of [[5, "May"], [12, "December"]] as const) {
      if (options.length < 8 && year * 12 + month >= today.getUTCFullYear() * 12 + today.getUTCMonth() + 1) options.push({ value: `${year}-${String(month).padStart(2, "0")}`, label: `${name} ${year}` });
    }
  }
  return options;
}

// the bands of the company dataset (BANDS in normalize.mjs), in the same order
export const SIZES: { label: string }[] = [
  { label: "1\u201310 employees" },
  { label: "11\u201350 employees" },
  { label: "51\u2013200 employees" },
  { label: "201\u2013500 employees" },
  { label: "501\u20131,000 employees" },
  { label: "1,001\u20135,000 employees" },
  { label: "5,001\u201310,000 employees" },
  { label: "10,000+ employees" },
];

export const inSize = (item: Internship, size: number) => item.band === size;

/** How big the company is, for a job card: the exact count when it's known, otherwise its band. */
export function companySize(item: Internship): string {
  if (item.employees) return `${item.employees.toLocaleString()} employees`;
  if (item.band === undefined || !SIZES[item.band]) return "";
  const label = SIZES[item.band].label;
  return label.includes("+") ? label : `about ${label}`;  // "10,000+ employees" is already a rough number
}

const SEASON_ORDER = ["Spring", "Summer", "Fall", "Winter"];

/** Every term with listings, in order: Summer 2027, Fall 2027, Summer 2028. */
export function termsIn(items: Internship[]): string[] {
  const rank = (term: string) => {
    const [season, year] = term.split(" ");
    return Number(year) * 10 + SEASON_ORDER.indexOf(season);
  };
  return [...new Set(items.flatMap((item) => item.terms))].filter((term) => /^\S+ \d{4}$/.test(term)).sort((a, b) => rank(a) - rank(b));
}

const has = (text: string, part: string) => text.toLowerCase().includes(part.trim().toLowerCase());

// Sources write big cities differently ("LA", "Los Angeles", "NYC", "New York, NY"), so any of the names
// finds all of them, with the cities around them. "LA" also means Louisiana, which stays included.
const SF = "\\bSF\\b|San Francisco";
const AREAS: { names: string[]; places: RegExp }[] = [
  {
    names: ["la", "los angeles"],
    places: /\bLA\b|Louisiana|Los Angeles|Santa Monica|Culver City|El Segundo|Hawthorne|Burbank|Pasadena|Long Beach|Torrance|Playa Vista/,
  },
  { names: ["sf", "san francisco"], places: new RegExp(SF) },
  {
    names: ["bay area"],
    places: new RegExp(`${SF}|Bay Area|San Jose|Palo Alto|Santa Clara|Sunnyvale|Mountain View|Oakland|Berkeley|Fremont|Redwood City|San Mateo|Menlo Park|Cupertino`),
  },
  { names: ["ny", "nyc", "new york", "new york city"], places: /\bNY\b|\bNYC\b|New York|Brooklyn|Manhattan/ },
  { names: ["dc", "washington dc", "washington d.c."], places: /\bDC\b|D\.C\.|District of Columbia/ },
];

/** Big cities go by any of their names, and other pairs of letters mean a state or a code like UK, so "CA" finds California but not Chicago or Canada. */
export function inPlace(location: string, query: string): boolean {
  const q = query.trim();
  const area = AREAS.find((a) => a.names.includes(q.toLowerCase()));
  if (area) return area.places.test(location);
  if (!/^[a-z]{2}$/i.test(q)) return has(location, q);
  const code = q.toUpperCase();
  // listings written just "SF" or "LA" never say California; "Baton Rouge, LA" isn't either
  if (code === "CA" && /^LA$|\bSF\b/.test(location.trim())) return true;
  if (new RegExp(`\\b${code}\\b`).test(location)) return true;
  return STATES[code] !== undefined && has(location, STATES[code]);
}

export const isNew = (item: Internship, since: number | null) => since !== null && (item.added ?? 0) > since;

/** anyLevel is for Saved and Applied, which list everything marked, whatever its kind. */
export function matches(item: Internship, f: Filters, since: number | null = null, anyLevel = false, within?: (place: string) => boolean): boolean {
  if (f.fresh && !isNew(item, since)) return false;
  const text = `${item.company} ${item.title}`;
  if (!f.query.trim().split(/\s+/).every((word) => has(text, word))) return false;
  // "LA" with "Remote" means jobs in LA or remote ones, since a remote job has no city to match
  if (f.location.trim() || f.remote) {
    const nearby = f.location.trim() !== "" && item.locations.some((l) => inPlace(l, f.location) || within?.(l));
    if (!nearby && !(f.remote && item.locations.some((l) => has(l, "remote")))) return false;
  }
  if (!anyLevel && !inLevel(item, f.kind, f.level)) return false;
  if (f.size.length && !f.size.some((size) => inSize(item, Number(size)))) return false;
  if (f.verified && !isVerified(item)) return false;
  if (f.grad && !fitsGraduation(item, f.grad)) return false;
  if (f.field.length && !f.field.includes(item.field)) return false;
  if (f.term.length && !f.term.some((term) => item.terms.includes(term))) return false;
  if (f.sponsorship && item.sponsorship && item.sponsorship !== "offers") return false;
  if (f.permanent && item.sponsorship === "citizens") return false;
  return true;
}

/** The kind and level a link asks for: ?kind=jobs, ?level=mid. Links from before the two lists say level=all or internship. */
function kindAndLevel(kind: string | null, level: string | null): Partial<Filters> {
  for (const k of ["internship", "job"] as const) {
    const found = LEVELS[k].find((l) => l.id === level);
    if (found) return { kind: k, level: [found.id] };
  }
  if (kind === "jobs" || kind === "job" || level === "all") return { kind: "job" };
  return {};
}

/** A search passed in the address, as links from the Planner do: ?q=security&field=Software&location=LA */
export function filtersFromUrl(search: string, items: Internship[]): Partial<Filters> {
  const params = new URLSearchParams(search);
  const field = params.getAll("field").filter((name) => items.some((item) => item.field === name));
  return {
    ...kindAndLevel(params.get("kind"), params.get("level")),
    ...(params.get("q") && { query: params.get("q")! }),
    ...(params.get("location") && { location: params.get("location")! }),
    ...(field.length > 0 && { field }),
  };
}

const isWhole = (item: Internship) => typeof item.title === "string" && typeof item.company === "string" && Array.isArray(item.locations) && Array.isArray(item.terms);

/** What a browser saved. Anything damaged is dropped, and entries from before listings were copied get their copy. */
export function readTracked(saved: unknown, items: Internship[]): Tracked {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return {};
  const tracked: Tracked = {};
  for (const [key, value] of Object.entries(saved)) {
    if (value === "saved" || value === "applied") {
      const item = items.find((i) => i.id === key);
      if (item) tracked[item.url] = { status: value, item };
    } else if ((value?.status === "saved" || value?.status === "applied") && value.item?.url === key && isWhole(value.item)) {
      // a listing's link can change, so use the current copy when it's still here
      const current = items.find((i) => i.url === key || i.id === value.item.id) ?? value.item;
      tracked[current.url] = { status: value.status, item: current };
    }
  }
  return tracked;
}

/**
 * The student's current search on sites whose listings can't be gathered here. LinkedIn forbids automated
 * access, Indeed's rules block it, and Handshake needs a student login, so these are plain links that the student
 * opens themselves.
 */
export function searchElsewhere(f: Filters): { name: string; url: string }[] {
  // these sites take one search, so several fields can't be asked for at once
  const keywords = f.query.trim() || (f.field.length === 1 ? f.field[0] : "");
  const all = f.kind === "internship" ? { word: "internship", linkedin: "1" } : { word: "", linkedin: "2,3,4,5" };
  // LinkedIn's experience levels: 1 internship, 2 entry level, 3 associate, 4 mid-senior, 5 director
  const sites: Record<LevelChoice, { word: string; linkedin: string }> = {
    undergrad: { word: "undergraduate internship", linkedin: "1" },
    grad: { word: "graduate internship", linkedin: "1" },
    entry: { word: "entry level", linkedin: "2" },
    mid: { word: "", linkedin: "3,4" },
    senior: { word: "senior", linkedin: "4,5" },
  };
  const picks = f.level.map((level) => sites[level]);
  const word = picks.length === 1 ? picks[0].word : all.word;
  const levels = picks.length ? [...new Set(picks.flatMap((p) => p.linkedin.split(",")))].sort().join(",") : all.linkedin;
  const miles = f.location.trim() ? Math.min(Number(f.miles) || 0, 100) : 0;  // neither site looks further than 100
  const words = `${keywords} ${word}`.trim();
  const place = f.location.trim() || "United States";
  const linkedin = new URLSearchParams({ keywords: words || "jobs", location: place });
  linkedin.set("f_E", levels);
  if (miles) linkedin.set("distance", String(miles));
  if (f.remote) linkedin.set("f_WT", "2");  // f_WT=2: remote
  return [
    { name: "Handshake", url: `https://app.joinhandshake.com/stu/postings?${new URLSearchParams({ query: words })}` },
    { name: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?${linkedin}` },
    { name: "Indeed", url: `https://www.indeed.com/jobs?${new URLSearchParams({ q: words, l: f.remote && !f.location.trim() ? "Remote" : place, ...(miles && { radius: String(miles) }) })}` },
    { name: "Simplify", url: `https://simplify.jobs/jobs?${new URLSearchParams({ q: words })}` },
  ];
}

/** "today", "3d ago", "2mo ago": how long before the data's last update a listing was posted. */
export function age(posted: number | null, updated: number): string {
  if (!posted) return "";
  const days = Math.floor((updated - posted) / 86400);
  if (days < 1) return "today";
  return days < 60 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}
