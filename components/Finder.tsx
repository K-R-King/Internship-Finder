"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  age, extraLevels, filtersFromUrl, inSize, isNew, LEVEL_NAMES, LEVELS, matches, NO_FILTERS, readTracked, searchElsewhere, SIZES,
  termsIn, type Data, type Filters, type Internship, type Status, type Tracked,
} from "@/lib/internships";

const PAGE = 50;
const UPDATE_DELAY = 400;  // long enough to finish typing, and to see that results are updating
const STORAGE_KEY = "internship-finder:tracked";
const LAST_VISIT_KEY = "internship-finder:last-visit";

const VIEWS: { id: Filters["view"]; label: string }[] = [
  { id: "all", label: "All jobs" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
];

const CHECKS: { id: "undergrad" | "remote" | "permanent" | "sponsorship"; label: string }[] = [
  { id: "remote", label: "Remote" },
  { id: "undergrad", label: "Open to undergrads" },
  { id: "permanent", label: "Open to permanent residents" },
  { id: "sponsorship", label: "May sponsor visas" },
];

function loadTracked(items: Internship[]): Tracked {
  try {
    return readTracked(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"), items);
  } catch {
    return {};
  }
}

/**
 * When this browser last came by, or null on a first visit. The answer holds for the whole visit, so a refresh
 * doesn't clear what's marked as new.
 */
function lastVisit(): number | null {
  try {
    const known = sessionStorage.getItem(LAST_VISIT_KEY);
    if (known !== null) return Number(known) || null;
    const last = localStorage.getItem(LAST_VISIT_KEY) ?? "";
    sessionStorage.setItem(LAST_VISIT_KEY, last);
    localStorage.setItem(LAST_VISIT_KEY, String(Math.round(Date.now() / 1000)));
    return Number(last) || null;
  } catch {
    return null;
  }
}

function saveTracked(tracked: Tracked) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracked));
  } catch {
    // private windows can block storage; tracking still works until the page closes
  }
}

// The listings live on the repo's "data" branch, replaced by the daily refresh, so they don't pile up in its
// history or need a new deploy. Locally they come from public/ (npm run sync writes them there).
const DATA = process.env.NEXT_PUBLIC_DATA_URL
  ?? (process.env.NODE_ENV === "development" ? "" : "https://raw.githubusercontent.com/K-R-King/Internship-Finder/data");

async function loadLevel(level: "mid" | "senior"): Promise<Internship[]> {
  const res = await fetch(`${DATA}/jobs-${level}.json`);
  if (!res.ok) throw new Error(`jobs-${level}.json: ${res.status}`);
  return (await res.json()).items;
}

const control = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900";
const chip = "rounded-full px-2 py-0.5";

function Row({ item, status, closed, fresh, updated, onTrack }: {
  item: Internship;
  status?: Status;
  closed: boolean;  // tracked, but no longer in the listings
  fresh: boolean;   // added since the last visit
  updated: number;
  onTrack: (item: Internship, status: Status) => void;
}) {
  const places = item.locations.slice(0, 2).join(" · ") + (item.locations.length > 2 ? ` +${item.locations.length - 2}` : "");
  const toggle = (next: Status, label: string) => (
    <button
      type="button"
      aria-pressed={status === next}
      aria-label={`${label} ${item.title} at ${item.company}`}
      onClick={() => onTrack(item, next)}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
        status === next ? "bg-berkeley text-white dark:bg-gold dark:text-berkeley" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
    >
      {status === next ? `${label} ✓` : label}
    </button>
  );

  return (
    <li data-listing={item.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center dark:bg-slate-900 dark:ring-slate-700">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{item.company}</span>
          {item.employees ? ` · ${item.employees.toLocaleString()} employees` : ""}
        </p>
        <h3 className="font-semibold text-berkeley dark:text-blue-200">{item.title}</h3>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {[places, item.terms.filter((t) => /\d/.test(t)).join(", "), item.field, age(item.posted, updated)].filter(Boolean).join("  •  ")}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1 text-xs font-medium">
          <span className={`${chip} bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200`}>{LEVEL_NAMES[item.type ?? "internship"]}</span>
          {fresh && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>New</span>}
          {closed && <span className={`${chip} bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200`}>No longer listed</span>}
          {item.gradOnly && <span className={`${chip} bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200`}>Grad students</span>}
          {item.sponsorship === "offers" && <span className={`${chip} bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200`}>Sponsors visas</span>}
          {item.sponsorship === "none" && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>No sponsorship</span>}
          {item.sponsorship === "citizens" && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>U.S. citizens only</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {toggle("saved", "Save")}
        {toggle("applied", "Applied")}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Apply to ${item.title} at ${item.company} (opens in a new tab)`}
          className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-berkeley transition hover:brightness-95"
        >
          Apply {"↗"}
        </a>
      </div>
    </li>
  );
}

export default function Finder() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [extra, setExtra] = useState<{ mid?: Internship[]; senior?: Internship[] }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);  // what the form shows
  const [applied, setApplied] = useState<Filters | null>(null);  // what the results show; null until known
  const [updating, setUpdating] = useState(false);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestUpdate = useRef(0);
  const extraRef = useRef(extra);
  const [tracked, setTracked] = useState<Tracked>({});
  const [shown, setShown] = useState(PAGE);
  const [since, setSince] = useState<number | null>(null);

  /** Runs the search again, saying so while it does, and loads any level it needs first. */
  function update(next: Filters, delay = UPDATE_DELAY) {
    const id = ++latestUpdate.current;
    setUpdating(true);
    clearTimeout(updateTimer.current);
    updateTimer.current = setTimeout(async () => {
      const missing = extraLevels(next.level).filter((level) => !extraRef.current[level]);
      try {
        const loaded = await Promise.all(missing.map(async (level) => [level, await loadLevel(level)] as const));
        extraRef.current = { ...extraRef.current, ...Object.fromEntries(loaded) };
        setExtra(extraRef.current);
        setNotice(null);
      } catch (err) {
        console.error(err);
        setNotice("Couldn't load every level just now. Search again to retry.");
      }
      if (id !== latestUpdate.current) return;
      setApplied(next);
      setShown(PAGE);
      setUpdating(false);
    }, delay);
  }

  useEffect(() => {
    fetch(`${DATA}/internships.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`internships.json: ${res.status}`);
        return res.json();
      })
      .then((loaded: Data) => {
        setData(loaded);
        setTracked(loadTracked(loaded.items));
        setSince(lastVisit());
        const fromAddress = { ...NO_FILTERS, ...filtersFromUrl(window.location.search, loaded.items) };
        setFilters(fromAddress);
        if (extraLevels(fromAddress.level).length) update(fromAddress, 0);
        else setApplied(fromAddress);
      })
      .catch((err) => {
        console.error(err);
        setFailed(true);
      });
    return () => clearTimeout(updateTimer.current);
  }, []);

  const everything = useMemo(() => [...(data?.items ?? []), ...(extra.mid ?? []), ...(extra.senior ?? [])], [data, extra]);
  const results = useMemo(() => {
    if (!applied) return [];
    const pool = applied.view === "all"
      ? everything
      : Object.values(tracked).filter((t) => t.status === applied.view).map((t) => t.item);
    // a saved list shows every level unless one is picked
    const filters = applied.view === "all" || applied.level ? applied : { ...applied, level: "all" as const };
    return pool.filter((item) => matches(item, filters, since));
  }, [everything, applied, tracked, since]);
  const loaded = (item: Internship) => item.type !== "mid" && item.type !== "senior" ? true : Boolean(extra[item.type]);
  const newCount = useMemo(() => (data?.items ?? []).filter((item) => isNew(item, since)).length, [data, since]);
  const open = useMemo(() => new Set(everything.map((i) => i.url)), [everything]);
  const fields = useMemo(() => [...new Set(everything.map((i) => i.field))].sort(), [everything]);
  const terms = useMemo(() => termsIn(everything), [everything]);
  const sizeCounts = useMemo(() => SIZES.map((size) => everything.filter((i) => inSize(i.employees, size)).length), [everything]);

  function change(next: Partial<Filters>) {
    const changed = { ...filters, ...next };
    setFilters(changed);
    update(changed);
  }

  function track(item: Internship, status: Status) {
    const next = { ...tracked };
    if (next[item.url]?.status === status) delete next[item.url];
    else next[item.url] = { status, item };
    setTracked(next);
    saveTracked(next);
  }

  if (failed) {
    return <p role="alert" className="rounded-2xl bg-red-50 p-6 text-center text-red-800 dark:bg-red-950 dark:text-red-200">Couldn&apos;t load the jobs. Refresh the page to try again.</p>;
  }
  // while a link's level loads, show nothing rather than the wrong jobs
  if (!data || !applied) return <p className="p-10 text-center text-slate-600 dark:text-slate-300">Loading jobs{"…"}</p>;

  const count = (view: Filters["view"]) => (view === "all" ? everything.length : Object.values(tracked).filter((t) => t.status === view).length);
  const emptyList = applied.view !== "all" && count(applied.view) === 0;

  return (
    <div className="space-y-5">
      <form
        aria-label="Filters"
        onSubmit={(e) => {
          e.preventDefault();
          update(filters, 150);
        }}
        className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5 dark:bg-slate-900 dark:ring-slate-700"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input aria-label="Search by company or role" placeholder="Company or role" value={filters.query} onChange={(e) => change({ query: e.target.value })} className={control} />
          <input aria-label="Location" placeholder="U.S. city or state, e.g. LA or CA" value={filters.location} onChange={(e) => change({ location: e.target.value })} className={control} />
          <button type="submit" className="rounded-xl bg-gold px-6 py-2.5 text-sm font-semibold text-berkeley shadow-sm transition hover:brightness-95">Search</button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <select aria-label="Level" value={filters.level} onChange={(e) => change({ level: e.target.value as Filters["level"] })} className={control}>
            {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <select aria-label="Field" value={filters.field} onChange={(e) => change({ field: e.target.value })} className={control}>
            <option value="">All fields</option>
            {fields.map((f) => <option key={f}>{f}</option>)}
          </select>
          <select aria-label="Term" value={filters.term} onChange={(e) => change({ term: e.target.value })} className={control}>
            <option value="">Any term</option>
            {terms.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select aria-label="Company size" value={filters.size} onChange={(e) => change({ size: e.target.value })} className={control}>
            <option value="">Any company size</option>
            {SIZES.map((s, i) => <option key={s.label} value={String(i)}>{s.label} ({sizeCounts[i].toLocaleString()})</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-700 dark:text-slate-200">
          {CHECKS.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" checked={filters[c.id]} onChange={(e) => change({ [c.id]: e.target.checked })} className="h-4 w-4 accent-berkeley" />
              {c.label}
            </label>
          ))}
          {newCount > 0 && (
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={filters.fresh} onChange={(e) => change({ fresh: e.target.checked })} className="h-4 w-4 accent-berkeley" />
              New since last visit ({newCount.toLocaleString()})
            </label>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700" role="group" aria-label="Show">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={filters.view === v.id}
              onClick={() => change({ view: v.id })}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filters.view === v.id ? "bg-berkeley text-white dark:bg-gold dark:text-berkeley" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {v.id === "all" ? v.label : `${v.label} (${count(v.id).toLocaleString()})`}
            </button>
          ))}
        </div>
        <p aria-live="polite" className={`text-sm ${updating ? "font-semibold text-berkeley dark:text-gold" : "text-slate-600 dark:text-slate-300"}`}>
          {updating ? "Updating results…" : `${results.length.toLocaleString()} job${results.length === 1 ? "" : "s"}, newest first`}
        </p>
      </div>

      {notice && <p role="status" className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{notice}</p>}

      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        Also search
        {/* exactly what's in the boxes, not the search from a moment ago */}
        {searchElsewhere(filters).map((site) => (
          <a
            key={site.name}
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Search this on ${site.name} (opens in a new tab)`}
            className="rounded-lg bg-slate-200 px-2.5 py-1 font-semibold text-slate-800 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {site.name} {"↗"}
          </a>
        ))}
      </p>

      <ul className={`space-y-3 transition-opacity ${updating ? "opacity-50" : ""}`}>
        {results.slice(0, shown).map((item) => (
          <Row key={item.id} item={item} status={tracked[item.url]?.status} closed={loaded(item) && !open.has(item.url)} fresh={isNew(item, since)} updated={data.updated} onTrack={track} />
        ))}
      </ul>

      {results.length === 0 && !updating && (
        <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
          <p className="font-semibold">
            {emptyList ? `Nothing ${applied.view === "saved" ? "saved" : "marked as applied"} yet` : "Nothing matches those filters"}
          </p>
          {applied.size !== "" && !emptyList && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Company sizes are only known for some, mostly large, companies.</p>
          )}
          <button type="button" onClick={() => { setFilters(NO_FILTERS); update(NO_FILTERS, 0); }} className="mt-3 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-berkeley">
            {emptyList ? "See all jobs" : "Clear filters"}
          </button>
        </div>
      )}

      {shown < results.length && (
        <button type="button" onClick={() => setShown(shown + PAGE)} className="mx-auto block rounded-xl bg-berkeley px-5 py-2.5 text-sm font-semibold text-white dark:bg-gold dark:text-berkeley">
          Show more ({(results.length - shown).toLocaleString()} left)
        </button>
      )}

      <footer className="pt-6 text-center text-xs text-slate-600 dark:text-slate-300">
        <p>Updated {new Date(data.updated * 1000).toLocaleDateString(undefined, { dateStyle: "medium" })} from {data.sources.filter((s) => s.ok || s.count).map((s) => s.name).join(", ")}.</p>
        <p className="mt-1">
          Not every job is here, so try the other sites too. Company sizes come from Wikidata and are known only for some companies, and few
          listings state work authorization, so check each one. Always confirm details on the company&apos;s own page.
        </p>
      </footer>
    </div>
  );
}
