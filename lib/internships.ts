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
export type Status = "saved" | "applied";

/** Keyed by listing page, with a copy of the listing so it stays here after it closes. */
export type Tracked = Record<string, { status: Status; item: Internship }>;

export interface Filters {
  query: string;
  location: string;
  field: string;     // "" means any
  term: string;      // e.g. "Summer 2027"; "" means any
  level: Level | "" | "all";  // "" means internships and entry level
  size: string;               // index into SIZES (one per size band); "" means any
  undergrad: boolean;
  remote: boolean;
  sponsorship: boolean;  // hide listings that rule out visa sponsorship
  permanent: boolean;    // hide listings only for U.S. citizens
  fresh: boolean;        // only listings added since the last visit
  view: "all" | "saved" | "applied";
}

export const NO_FILTERS: Filters = {
  query: "", location: "", field: "", term: "", level: "", size: "", undergrad: false, remote: false, sponsorship: false, permanent: false, fresh: false, view: "all",
};

export const LEVELS: { id: Filters["level"]; label: string }[] = [
  { id: "", label: "Internships and entry level" },
  { id: "internship", label: "Internships" },
  { id: "entry", label: "Entry level" },
  { id: "mid", label: "Mid level" },
  { id: "senior", label: "Senior level" },
  { id: "all", label: "All levels" },
];

export const LEVEL_NAMES: Record<Level, string> = { internship: "Internship", entry: "Entry level", mid: "Mid level", senior: "Senior level" };

/** Levels kept in their own files, loaded only when someone asks for them. */
export function extraLevels(level: Filters["level"]): ("mid" | "senior")[] {
  return level === "all" ? ["mid", "senior"] : level === "mid" || level === "senior" ? [level] : [];
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

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

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

export function matches(item: Internship, f: Filters, since: number | null = null): boolean {
  if (f.fresh && !isNew(item, since)) return false;
  const text = `${item.company} ${item.title}`;
  if (!f.query.trim().split(/\s+/).every((word) => has(text, word))) return false;
  // "LA" with "Remote" means jobs in LA or remote ones, since a remote job has no city to match
  if (f.location.trim() || f.remote) {
    const nearby = f.location.trim() !== "" && item.locations.some((l) => inPlace(l, f.location));
    if (!nearby && !(f.remote && item.locations.some((l) => has(l, "remote")))) return false;
  }
  const level = item.type ?? "internship";
  if (f.level === "" ? level !== "internship" && level !== "entry" : f.level !== "all" && level !== f.level) return false;
  if (f.size !== "" && !inSize(item, Number(f.size))) return false;
  if (f.field && item.field !== f.field) return false;
  if (f.term && !item.terms.includes(f.term)) return false;
  if (f.undergrad && item.gradOnly) return false;
  if (f.sponsorship && item.sponsorship && item.sponsorship !== "offers") return false;
  if (f.permanent && item.sponsorship === "citizens") return false;
  return true;
}

/** A search passed in the address, as links from the Planner do: ?q=security&field=Software&location=LA */
export function filtersFromUrl(search: string, items: Internship[]): Partial<Filters> {
  const params = new URLSearchParams(search);
  const field = params.get("field");
  const level = params.get("level");
  return {
    ...(LEVELS.some((l) => l.id === level) && { level: level as Filters["level"] }),
    ...(params.get("q") && { query: params.get("q")! }),
    ...(params.get("location") && { location: params.get("location")! }),
    ...(field && items.some((item) => item.field === field) && { field }),
  };
}

/** What a browser saved. Anything damaged is dropped, and entries from before listings were copied get their copy. */
export function readTracked(saved: unknown, items: Internship[]): Tracked {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return {};
  const tracked: Tracked = {};
  for (const [key, value] of Object.entries(saved)) {
    if (value === "saved" || value === "applied") {
      const item = items.find((i) => i.id === key);
      if (item) tracked[item.url] = { status: value, item };
    } else if ((value?.status === "saved" || value?.status === "applied") && value.item?.url === key) {
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
  const keywords = f.query.trim() || f.field;
  const kind = { "": "internship", internship: "internship", entry: "entry level", mid: "", senior: "senior", all: "" }[f.level];
  // LinkedIn's experience levels: 1 internship, 2 entry level, 3 associate, 4 mid-senior, 5 director
  const levels = { "": "1,2", internship: "1", entry: "2", mid: "3,4", senior: "4,5", all: "" }[f.level];
  const words = `${keywords} ${kind}`.trim();
  const place = f.location.trim() || "United States";
  const linkedin = new URLSearchParams({ keywords: words || "jobs", location: place });
  if (levels) linkedin.set("f_E", levels);
  if (f.remote) linkedin.set("f_WT", "2");  // f_WT=2: remote
  return [
    { name: "Handshake", url: `https://app.joinhandshake.com/stu/postings?${new URLSearchParams({ query: words })}` },
    { name: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?${linkedin}` },
    { name: "Indeed", url: `https://www.indeed.com/jobs?${new URLSearchParams({ q: words, l: f.remote && !f.location.trim() ? "Remote" : place })}` },
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
