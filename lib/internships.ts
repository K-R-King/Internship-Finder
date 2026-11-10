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
export type Status = "saved" | "applied";

/** Keyed by listing page, with a copy of the listing so it stays here after it closes. */
export type Tracked = Record<string, { status: Status; item: Internship }>;

export interface Filters {
  query: string;
  location: string;
  major: string[];   // any of these, from MAJORS; empty means any
  term: string[];    // any of these, e.g. "Summer 2027"; empty means any term
  level: Level[];        // any of these; empty means every level
  size: string[];        // any of these indexes into SIZES; empty means any
  miles: string;         // how far from the location to look; "" means only the place named
  grad: string;          // when the student graduates, "2027-05"; "" means any
  verified: boolean;     // only listings from verified companies
  posted: string;        // only listings this many days old or newer; "" means any
  undergrad: boolean;    // leave out listings only for graduate students
  forGrads: boolean;     // only listings for graduate students
  remote: boolean;
  sponsorship: boolean;  // hide listings that rule out visa sponsorship
  permanent: boolean;    // hide listings only for U.S. citizens
  fresh: boolean;        // only listings added since the last visit
  view: "all" | "saved" | "applied";
}

export const NO_FILTERS: Filters = {
  query: "", location: "", major: [], term: [], level: ["internship"], size: [], miles: "", grad: "", verified: false, posted: "", undergrad: false, forGrads: false, remote: false, sponsorship: false, permanent: false, fresh: false, view: "all",
};

export const LEVELS: { id: Level; label: string }[] = [
  { id: "internship", label: "Internships" },
  { id: "entry", label: "Entry Level Jobs" },
  { id: "mid", label: "Mid Level Jobs" },
  { id: "senior", label: "Senior Level Jobs" },
];

// Listings don't name majors, so each major is the listing categories it leads to, plus words in the job title.
const CIRCUITS = /electrical|embedded|firmware|fpga|asic|silicon|hardware|semiconductor|circuit|vlsi|signal processing/i;
export const MAJORS: { label: string; fields?: string[]; title?: RegExp }[] = [
  { label: "Computer Science", fields: ["Software", "AI & Data"], title: /computer science/i },
  { label: "EECS", fields: ["Software", "AI & Data"], title: CIRCUITS },
  { label: "Electrical Engineering", title: CIRCUITS },
  { label: "Computer Engineering", fields: ["Software"], title: /computer engineer|embedded|firmware|hardware|fpga|asic|silicon/i },
  { label: "Data Science", fields: ["AI & Data"], title: /data science/i },
  { label: "Artificial Intelligence (AI)", title: /artificial intelligence|machine learning|deep learning|computer vision|\b(ai|ml|nlp|llm)\b/i },
  { label: "Statistics", fields: ["AI & Data"], title: /statistic|actuar|biostat/i },
  { label: "Mathematics", fields: ["Quant"], title: /math|actuar|statistic/i },
  { label: "Mechanical Engineering", title: /mechanical|robotics|manufactur/i },
  { label: "Aerospace Engineering", title: /aerospace|avionics|propulsion|spacecraft|flight (test|software|control)/i },
  { label: "Civil Engineering", title: /\bcivil\b|structural|geotechnical|construction/i },
  { label: "Chemical Engineering", title: /chemical|process engineer|petroleum/i },
  { label: "Bioengineering", title: /biomedical|bioengineer|biotech/i },
  { label: "Industrial Engineering", title: /industrial engineer|supply chain|operations research|logistics/i },
  { label: "Materials Science", title: /\bmaterials\b|metallurg/i },
  { label: "Environmental Science", title: /environmental|sustainab/i },
  { label: "Business", fields: ["Business & Finance", "Product"] },
  { label: "Finance", fields: ["Quant"], title: /financ|invest|banking|treasury|\bcredit\b/i },
  { label: "Accounting", title: /accountant|accounting|\baudit|\btax\b|controller/i },
  { label: "Economics", title: /econom/i },
  { label: "Marketing", fields: ["Marketing & Comms"] },
  { label: "Communications", title: /communications|public relations|journalis|\bcontent\b/i },
  { label: "Design", fields: ["Design"] },
  { label: "Health Sciences", fields: ["Healthcare"] },
  { label: "Nursing", title: /nurse|nursing|\brn\b|\blpn\b/i },
  { label: "Public Health", title: /public health|epidemiolog|health policy/i },
  { label: "Biology", title: /biolog|genomic|life science/i },
  { label: "Chemistry", title: /chemist/i },
  { label: "Physics", title: /physic(s|ist)/i },
  { label: "Psychology", title: /psycholog|behavior|mental health/i },
  { label: "Political Science", title: /\bpolicy\b|government affairs|legislative|political/i },
  { label: "Pre-Law", title: /legal|paralegal|attorney|law clerk/i },
  { label: "Education", fields: ["Education"] },
  { label: "Human Resources", title: /recruit|talent acquisition|human resources|\bhr\b/i },
];

const MAJOR_RULES = new Map(MAJORS.map((major) => [major.label, major]));

// what the Planner's links ask for
const OLD_FIELD_LINKS: Record<string, string[]> = {
  Software: ["Computer Science"], "AI & Data": ["Data Science"], Hardware: ["Electrical Engineering"], Quant: ["Mathematics"], Design: ["Design"], "Business & Finance": ["Business"],
};

export function fitsMajor(item: Internship, major: string): boolean {
  const rule = MAJOR_RULES.get(major);
  return Boolean(rule && (rule.fields?.includes(item.field) || rule.title?.test(item.title)));
}

export const LEVEL_NAMES: Record<Level, string> = { internship: "Internship", entry: "Entry Level", mid: "Mid Level", senior: "Senior Level" };


/** Levels kept in their own files, loaded only when someone asks for them. */
export function extraLevels(levels: Level[]): ("mid" | "senior")[] {
  return (["mid", "senior"] as const).filter((level) => levels.length === 0 || levels.includes(level));
}

/** Whether a listing is one of the levels asked for. */
export function inLevel(item: Internship, levels: Level[]): boolean {
  return levels.length === 0 || levels.includes(item.type ?? "internship");
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
  if ((item.type ?? "internship") !== "internship") return true;
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
export function matches(item: Internship, f: Filters, since: number | null = null, anyLevel = false, within?: (place: string) => boolean, now = Date.now() / 1000): boolean {
  if (f.fresh && !isNew(item, since)) return false;
  const text = `${item.company} ${item.title}`;
  if (!f.query.trim().split(/\s+/).every((word) => has(text, word))) return false;
  // "LA" with "Remote" means jobs in LA or remote ones, since a remote job has no city to match
  if (f.location.trim() || f.remote) {
    const nearby = f.location.trim() !== "" && item.locations.some((l) => inPlace(l, f.location) || within?.(l));
    if (!nearby && !(f.remote && item.locations.some((l) => has(l, "remote")))) return false;
  }
  if (!anyLevel && !inLevel(item, f.level)) return false;
  if (f.size.length && !f.size.some((size) => inSize(item, Number(size)))) return false;
  if (f.verified && !isVerified(item)) return false;
  if (f.posted && (!item.posted || item.posted < now - Number(f.posted) * 86400)) return false;
  // with both on, undergrad and graduate listings are both wanted
  if (f.undergrad && !f.forGrads && item.gradOnly) return false;
  if (f.forGrads && !f.undergrad && !item.gradOnly) return false;
  if (f.grad && !fitsGraduation(item, f.grad)) return false;
  if (f.major.length && !f.major.some((major) => fitsMajor(item, major))) return false;
  if (f.term.length && !f.term.some((term) => item.terms.includes(term))) return false;
  if (f.sponsorship && item.sponsorship && item.sponsorship !== "offers") return false;
  if (f.permanent && item.sponsorship === "citizens") return false;
  return true;
}

/** The levels a link asks for: ?level=mid, ?kind=jobs, ?level=all. */
function kindAndLevel(kind: string | null, level: string | null): Partial<Filters> {
  const found = LEVELS.find((l) => l.id === level);
  if (found) return { level: [found.id] };
  if (level === "all") return { level: [] };
  if (kind === "jobs" || kind === "job") return { level: ["entry", "mid", "senior"] };
  return {};
}

/** A search passed in the address, as links do: ?q=security&major=EECS&location=LA. The Planner still sends field=Software. */
export function filtersFromUrl(search: string): Partial<Filters> {
  const params = new URLSearchParams(search);
  const major = [...new Set([
    ...params.getAll("major").filter((name) => MAJOR_RULES.has(name)),
    ...params.getAll("field").flatMap((name) => OLD_FIELD_LINKS[name] ?? []),
  ])];
  return {
    ...kindAndLevel(params.get("kind"), params.get("level")),
    ...(params.get("q") && { query: params.get("q")! }),
    ...(params.get("location") && { location: params.get("location")! }),
    ...(major.length > 0 && { major }),
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
  // these sites take one search, so several majors can't be asked for at once
  const keywords = f.query.trim() || (f.major.length === 1 ? f.major[0] : "");
  // LinkedIn's experience levels: 1 internship, 2 entry level, 3 associate, 4 mid-senior, 5 director
  const sites: Record<Level, { word: string; linkedin: string }> = {
    internship: { word: "internship", linkedin: "1" },
    entry: { word: "entry level", linkedin: "2" },
    mid: { word: "", linkedin: "3,4" },
    senior: { word: "senior", linkedin: "4,5" },
  };
  const picks = f.level.map((level) => sites[level]);
  const word = picks.length === 1 ? picks[0].word : "";
  const levels = [...new Set(picks.flatMap((p) => p.linkedin.split(",")))].sort().join(",");
  const miles = f.location.trim() ? Math.min(Number(f.miles) || 0, 100) : 0;  // neither site looks further than 100
  const words = `${keywords} ${word}`.trim();
  const place = f.location.trim() || "United States";
  const linkedin = new URLSearchParams({ keywords: words || "jobs", location: place });
  if (levels) linkedin.set("f_E", levels);
  if (miles) linkedin.set("distance", String(miles));
  const days = Number(f.posted) || 0;
  if (days) linkedin.set("f_TPR", `r${days * 86400}`);
  if (f.remote) linkedin.set("f_WT", "2");  // f_WT=2: remote
  return [
    { name: "Handshake", url: `https://app.joinhandshake.com/stu/postings?${new URLSearchParams({ query: words })}` },
    { name: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?${linkedin}` },
    { name: "Indeed", url: `https://www.indeed.com/jobs?${new URLSearchParams({ q: words, l: f.remote && !f.location.trim() ? "Remote" : place, ...(miles && { radius: String(miles) }), ...(days && { fromage: String(Math.min(days, 14)) }) })}` },
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
