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
  source: string;
}

export interface Data {
  updated: number;  // seconds since 1970
  sources: { name: string; count: number; ok: boolean }[];
  items: Internship[];
}

export type Tracked = Record<string, "saved" | "applied">;

export interface Filters {
  query: string;
  location: string;
  field: string;     // "" means any
  season: string;    // "" means any
  undergrad: boolean;
  remote: boolean;
  sponsorship: boolean;  // hide listings that rule out visa sponsorship
  view: "all" | "saved" | "applied";
}

export const NO_FILTERS: Filters = {
  query: "", location: "", field: "", season: "", undergrad: false, remote: false, sponsorship: false, view: "all",
};

export const SEASONS = ["Summer", "Fall", "Winter", "Spring"];

const has = (text: string, part: string) => text.toLowerCase().includes(part.trim().toLowerCase());

export function matches(item: Internship, f: Filters, tracked: Tracked): boolean {
  if (f.view !== "all" && tracked[item.id] !== f.view) return false;
  if (f.query.trim() && !has(`${item.company} ${item.title}`, f.query)) return false;
  if (f.location.trim() && !item.locations.some((l) => has(l, f.location))) return false;
  if (f.field && item.field !== f.field) return false;
  if (f.season && !item.terms.some((t) => t.startsWith(f.season))) return false;
  if (f.undergrad && item.gradOnly) return false;
  if (f.remote && !item.locations.some((l) => has(l, "remote"))) return false;
  if (f.sponsorship && item.sponsorship && item.sponsorship !== "offers") return false;
  return true;
}

/** "today", "3d ago", "2mo ago": how long before the data's last update a listing was posted. */
export function age(posted: number | null, updated: number): string {
  if (!posted) return "";
  const days = Math.floor((updated - posted) / 86400);
  if (days < 1) return "today";
  return days < 60 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}
