// Puts the many ways listings write a place ("Austin, TX", "NYC", "IL-Rosemont", "Findlay Ohio") on the map, so a
// search can reach "within 50 miles". The map is public/us-places.json, loaded the first time someone picks a distance.

export const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export type Point = [number, number];  // latitude, longitude
export type PlaceTable = Record<string, [name: string, latitude: number, longitude: number, population: number][]>;
export interface Places {
  exact: Map<string, Point>;                            // "austin|TX"
  byName: Map<string, { at: Point; people: number }>;   // "austin": the largest place of that name
}

const norm = (text: string) => text.toLowerCase().replace(/[.']/g, "")
  .replace(/\bst\b/g, "saint").replace(/\bft\b/g, "fort").replace(/\bmt\b/g, "mount")
  .replace(/\s+/g, " ").trim();

const STATE_CODES = new Map(Object.entries(STATES).flatMap(([code, name]) => [[norm(name), code], [code.toLowerCase(), code]] as [string, string][]));
const stateOf = (text: string) => STATE_CODES.get(norm(text));

const ALIASES: Record<string, string> = {
  nyc: "new york|NY", "new york": "new york|NY", "new york city": "new york|NY", manhattan: "new york|NY",
  sf: "san francisco|CA", "bay area": "san francisco|CA", "sf bay area": "san francisco|CA", "south sf": "south san francisco|CA",
  la: "los angeles|CA", dc: "washington|DC", "washington dc": "washington|DC", "district of columbia": "washington|DC",
};

export function indexPlaces(table: PlaceTable): Places {
  const exact = new Map<string, Point>();
  const byName = new Map<string, { at: Point; people: number }>();
  for (const [state, cities] of Object.entries(table)) {
    for (const [name, latitude, longitude, people] of cities) {
      const key = norm(name);
      const at: Point = [latitude, longitude];
      if (!exact.has(`${key}|${state}`)) exact.set(`${key}|${state}`, at);
      if (people > (byName.get(key)?.people ?? -1)) byName.set(key, { at, people });
    }
  }
  return { exact, byName };
}

// words around a city that aren't part of its name: "Chicago Office", "Greater Boston Area"
const cityName = (text: string) => norm(text).replace(/^greater /, "").replace(/[ -](office|hq|headquarters|campus|metro area|metro|metropolitan area|bay area|area)$/, "");

/** Where a place is on the map, or null for something that isn't one city: "Remote", "United States", "California". */
export function locate(places: Places, text: string): Point | null {
  const cleaned = text.replace(/\([^)]*\)/g, " ").replace(/\b\d{5}(-\d{4})?\b/g, " ")
    .replace(/\b(United States of America|United States|U\.S\.A\.?|USA)\b/gi, " ");
  const alias = (name: string) => (ALIASES[cityName(name)] ? places.exact.get(ALIASES[cityName(name)]) ?? null : null);
  const whole = alias(cleaned.replace(/^[\s,\-–]+|[\s,\-–]+$/g, ""));
  if (whole) return whole;

  const inState = (city: string, state: string) => places.exact.get(`${cityName(city)}|${state}`) ?? null;
  const coded = cleaned.trim().match(/^(?:US\s*-\s*)?([A-Z]{2})\s*-\s*(.+)$/);  // "IL-Rosemont", "US-CA-Menlo Park"
  if (coded && STATES[coded[1]]) {
    const hit = inState(coded[2], coded[1]);
    if (hit) return hit;
  }

  const parts = cleaned.split(/[,;|]|\s[-–]\s/).map((p) => p.replace(/^[\s\-–]+|[\s\-–]+$/g, "")).filter((p) => p && !/^us$/i.test(p) && !/^remote\b/i.test(p));
  for (let i = parts.length - 1; i >= 0; i--) {
    const state = stateOf(parts[i]);
    if (state) {
      const hit = (i > 0 && inState(parts[i - 1], state)) || (i + 1 < parts.length && inState(parts[i + 1], state));  // "Florida - Deerfield Beach"
      if (hit) return hit;
      continue;
    }
    // "Kansas City MO", "Findlay Ohio", "Charleston West Virginia"
    const words = parts[i].split(/\s+/);
    for (const n of [3, 2, 1]) {
      if (words.length <= n) continue;
      const tail = stateOf(words.slice(-n).join(" "));
      const hit = tail && inState(words.slice(0, -n).join(" "), tail);
      if (hit) return hit;
    }
  }
  for (const part of parts) {
    const named = alias(part);
    if (named) return named;
    if (stateOf(part)) continue;
    const hit = places.byName.get(cityName(part))?.at;
    if (hit) return hit;
  }
  return null;
}

export function milesBetween([lat1, lng1]: Point, [lat2, lng2]: Point): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(a));
}

/** A check for whether a listing's place is within so many miles, remembering each place it has worked out. */
export function withinMiles(places: Places, center: Point, miles: number): (place: string) => boolean {
  const seen = new Map<string, boolean>();
  return (place) => {
    let near = seen.get(place);
    if (near === undefined) {
      const at = locate(places, place);
      near = at !== null && milesBetween(center, at) <= miles;
      seen.set(place, near);
    }
    return near;
  };
}
