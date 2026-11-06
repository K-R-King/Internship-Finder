export interface Internship {
  id: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  terms: string[];         // e.g. "Summer 2027"; empty when the listing doesn't say
  field: string;
  gradOnly: boolean;       // for graduate students
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

export type Status = "saved" | "applied";

/** Keyed by listing page, with a copy of the listing so it stays here after it closes. */
export type Tracked = Record<string, { status: Status; item: Internship }>;

export interface Filters {
  query: string;
  location: string;
  field: string;     // "" means any
  season: string;    // "" means any
  undergrad: boolean;
  remote: boolean;
  sponsorship: boolean;  // hide listings that rule out visa sponsorship
  fresh: boolean;        // only listings added since the last visit
  view: "all" | "saved" | "applied";
}

export const NO_FILTERS: Filters = {
  query: "", location: "", field: "", season: "", undergrad: false, remote: false, sponsorship: false, fresh: false, view: "all",
};

export const SEASONS = ["Summer", "Fall", "Winter", "Spring"];

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
  if (f.location.trim() && !item.locations.some((l) => inPlace(l, f.location))) return false;
  if (f.field && item.field !== f.field) return false;
  if (f.season && !item.terms.some((t) => t.startsWith(f.season))) return false;
  if (f.undergrad && item.gradOnly) return false;
  if (f.remote && !item.locations.some((l) => has(l, "remote"))) return false;
  if (f.sponsorship && item.sponsorship && item.sponsorship !== "offers") return false;
  return true;
}

/** A search passed in the address, as links from the Planner do: ?q=security&field=Software&location=LA */
export function filtersFromUrl(search: string, items: Internship[]): Partial<Filters> {
  const params = new URLSearchParams(search);
  const field = params.get("field");
  return {
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
      tracked[key] = value;
    }
  }
  return tracked;
}

/**
 * The student's current search on sites whose listings can't be gathered here. LinkedIn forbids automated
 * access, so these are plain links that the student opens themselves.
 */
export function searchElsewhere(f: Filters): { name: string; url: string }[] {
  const keywords = f.query.trim() || f.field;
  const linkedin = new URLSearchParams({ keywords: keywords || "internship", f_E: "1" });  // f_E=1: internships
  if (f.location.trim()) linkedin.set("location", f.location.trim());
  if (f.remote) linkedin.set("f_WT", "2");  // f_WT=2: remote
  const simplify = new URLSearchParams({ query: `${keywords} internship`.trim() });
  return [
    { name: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?${linkedin}` },
    { name: "Simplify", url: `https://simplify.jobs/jobs?${simplify}` },
  ];
}

/** "today", "3d ago", "2mo ago": how long before the data's last update a listing was posted. */
export function age(posted: number | null, updated: number): string {
  if (!posted) return "";
  const days = Math.floor((updated - posted) / 86400);
  if (days < 1) return "today";
  return days < 60 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}
