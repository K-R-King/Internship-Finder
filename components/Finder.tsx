"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  age, companySize, extraLevels, filtersFromUrl, inSize, isNew, LEVEL_NAMES, LEVELS, matches, NO_FILTERS, readTracked, searchElsewhere, SIZES,
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

const card = "rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800";
const control = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600";
const chip = "rounded-full px-2 py-0.5";

const ICONS = {
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4.2-4.2",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  calendar: "M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  field: "M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6M4 6h16v13H4zM4 12h16",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  bookmark: "M6 4h12v17l-6-4-6 4z",
  check: "M5 12.5l4.5 4.5L19 7",
  sliders: "M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4",
  up: "M12 19V5M6 11l6-6 6 6",
  close: "M7 7l10 10M17 7L7 17",
  external: "M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4",
};

function Icon({ name, className = "h-3.5 w-3.5", filled = false }: { name: keyof typeof ICONS; className?: string; filled?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** A colored badge with the company's initials, the same color for the same company every time. */
function Initials({ name }: { name: string }) {
  let hue = 0;
  for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      style={{ "--hue": hue } as CSSProperties}
      className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-[hsl(var(--hue)_70%_93%)] text-sm font-bold text-[hsl(var(--hue)_55%_28%)] sm:grid dark:bg-[hsl(var(--hue)_35%_20%)] dark:text-[hsl(var(--hue)_70%_82%)]"
    >
      {letters}
    </span>
  );
}

function Detail({ icon, children }: { icon: keyof typeof ICONS; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon name={icon} className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
      {children}
    </span>
  );
}

function Row({ item, status, closed, fresh, updated, onTrack }: {
  item: Internship;
  status?: Status;
  closed: boolean;  // tracked, but no longer in the listings
  fresh: boolean;   // added since the last visit
  updated: number;
  onTrack: (item: Internship, status: Status) => void;
}) {
  const places = item.locations.slice(0, 2).join(" · ") + (item.locations.length > 2 ? ` +${item.locations.length - 2}` : "");
  const terms = item.terms.filter((t) => /\d/.test(t)).join(", ");
  const posted = age(item.posted, updated);
  const size = companySize(item);
  const toggle = (next: Status, label: string, on: string, icon: keyof typeof ICONS) => (
    <button
      type="button"
      aria-pressed={status === next}
      aria-label={`${label} ${item.title} at ${item.company}`}
      onClick={() => onTrack(item, next)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
        status === next
          ? "bg-berkeley text-white dark:bg-gold dark:text-berkeley"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
    >
      <Icon name={icon} filled={icon === "bookmark" && status === next} />
      {status === next ? on : label}
    </button>
  );

  return (
    <li
      data-listing={item.id}
      className={`${card} group flex gap-4 p-4 transition hover:shadow-md hover:ring-slate-300 sm:items-center sm:p-5 dark:hover:ring-slate-600 ${closed ? "opacity-75" : ""}`}
    >
      <Initials name={item.company} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-sm text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{item.company}</span>
            {size ? ` · ${size}` : ""}
          </p>
          <h3 className="text-base leading-snug font-semibold text-berkeley dark:text-blue-200">{item.title}</h3>
          <p className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {places && <Detail icon="pin">{places}</Detail>}
            {terms && <Detail icon="calendar">{terms}</Detail>}
            {item.field && <Detail icon="field">{item.field}</Detail>}
            {posted && <Detail icon="clock">{posted}</Detail>}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5 text-xs font-medium">
            <span className={`${chip} bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200`}>{LEVEL_NAMES[item.type ?? "internship"]}</span>
            {fresh && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>New</span>}
            {closed && <span className={`${chip} bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200`}>No longer listed</span>}
            {item.gradOnly && <span className={`${chip} bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200`}>Grad students</span>}
            {item.sponsorship === "offers" && <span className={`${chip} bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200`}>Sponsors visas</span>}
            {item.sponsorship === "none" && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>No sponsorship</span>}
            {item.sponsorship === "citizens" && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>U.S. citizens only</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0 dark:border-slate-800">
          {toggle("saved", "Save", "Saved", "bookmark")}
          {toggle("applied", "Applied", "Applied", "check")}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Apply to ${item.title} at ${item.company} (opens in a new tab)`}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-gold px-3.5 py-1.5 text-xs font-semibold text-berkeley shadow-sm transition hover:brightness-95 sm:ml-0"
          >
            Apply
            <Icon name="external" />
          </a>
        </div>
      </div>
    </li>
  );
}

function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <p className="sr-only">Loading jobs{"…"}</p>
      <div className={`${card} h-40 animate-pulse`} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`${card} flex animate-pulse gap-4 p-5`}>
          <div className="hidden h-11 w-11 rounded-xl bg-slate-200 sm:block dark:bg-slate-800" />
          <div className="flex-1 space-y-2.5">
            <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800/60" />
          </div>
        </div>
      ))}
    </div>
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
  const [moreOpen, setMoreOpen] = useState(false);  // the extra filters, folded away on phones
  const [scrolled, setScrolled] = useState(false);

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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 1200);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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
  const sizeCounts = useMemo(() => SIZES.map((_, size) => everything.filter((i) => inSize(i, size)).length), [everything]);

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
  if (!data || !applied) return <Loading />;

  const count = (view: Filters["view"]) => (view === "all" ? everything.length : Object.values(tracked).filter((t) => t.status === view).length);
  const emptyList = applied.view !== "all" && count(applied.view) === 0;

  // the filters in use, each removable on its own
  const active: { label: string; clear: Partial<Filters> }[] = [
    ...(filters.query.trim() ? [{ label: `“${filters.query.trim()}”`, clear: { query: "" } }] : []),
    ...(filters.location.trim() ? [{ label: `Near ${filters.location.trim()}`, clear: { location: "" } }] : []),
    ...(filters.level ? [{ label: LEVELS.find((l) => l.id === filters.level)?.label ?? filters.level, clear: { level: "" as const } }] : []),
    ...(filters.field ? [{ label: filters.field, clear: { field: "" } }] : []),
    ...(filters.term ? [{ label: filters.term, clear: { term: "" } }] : []),
    ...(filters.size && SIZES[Number(filters.size)] ? [{ label: SIZES[Number(filters.size)].label, clear: { size: "" } }] : []),
    ...CHECKS.filter((c) => filters[c.id]).map((c) => ({ label: c.label, clear: { [c.id]: false } })),
    ...(filters.fresh ? [{ label: "New since last visit", clear: { fresh: false } }] : []),
  ];
  const folded = [filters.level, filters.field, filters.term, filters.size].filter(Boolean).length
    + CHECKS.filter((c) => filters[c.id]).length + (filters.fresh ? 1 : 0);
  const clearAll = () => {
    const cleared = { ...NO_FILTERS, view: filters.view };
    setFilters(cleared);
    update(cleared, 0);
  };

  return (
    <div className="space-y-5">
      <form
        aria-label="Filters"
        onSubmit={(e) => {
          e.preventDefault();
          update(filters, 150);
        }}
        className={`${card} space-y-4 p-4 shadow-lg shadow-slate-900/5 sm:p-5`}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search by company or role" placeholder="Company or role" value={filters.query} onChange={(e) => change({ query: e.target.value })} className={`${control} pl-9`} />
          </div>
          <div className="relative">
            <Icon name="pin" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input aria-label="Location" placeholder="U.S. city or state, e.g. LA or CA" value={filters.location} onChange={(e) => change({ location: e.target.value })} className={`${control} pl-9`} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-filters"
              onClick={() => setMoreOpen(!moreOpen)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 sm:hidden dark:border-slate-700 dark:text-slate-200"
            >
              <Icon name="sliders" className="h-4 w-4" />
              Filters{folded ? ` (${folded})` : ""}
            </button>
            <button type="submit" className="flex-1 rounded-xl bg-gold px-6 py-2.5 text-sm font-semibold text-berkeley shadow-sm transition hover:brightness-95">Search</button>
          </div>
        </div>
        <div id="more-filters" className={`${moreOpen ? "" : "hidden"} space-y-4 sm:block`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <select aria-label="Level" value={filters.level} onChange={(e) => change({ level: e.target.value as Filters["level"] })} className={`${control} col-span-2 sm:col-span-1`}>
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
            <select aria-label="Company size" value={filters.size} onChange={(e) => change({ size: e.target.value })} className={`${control} col-span-2 sm:col-span-1`}>
              <option value="">Any company size</option>
              {SIZES.map((s, i) => <option key={s.label} value={String(i)}>{s.label} ({sizeCounts[i].toLocaleString()})</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-slate-700 dark:text-slate-200">
            {[...CHECKS, ...(newCount > 0 ? [{ id: "fresh" as const, label: `New since last visit (${newCount.toLocaleString()})` }] : [])].map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 ring-1 ring-slate-200 transition select-none hover:bg-slate-50 has-checked:bg-berkeley/5 has-checked:font-medium has-checked:text-berkeley has-checked:ring-berkeley/60 dark:ring-slate-700 dark:hover:bg-slate-800 dark:has-checked:bg-gold/10 dark:has-checked:text-gold dark:has-checked:ring-gold/60"
              >
                <input type="checkbox" checked={filters[c.id]} onChange={(e) => change({ [c.id]: e.target.checked })} className="h-4 w-4 accent-berkeley dark:accent-gold" />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
            {active.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => change(a.clear)}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-2 pl-3 font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span className="sr-only">Remove </span>
                {a.label}
                <Icon name="close" className="h-3 w-3 text-slate-500 dark:text-slate-400" />
              </button>
            ))}
            <button type="button" onClick={clearAll} className="px-1 font-semibold text-berkeley underline-offset-2 hover:underline dark:text-gold">
              Clear all
            </button>
          </div>
        )}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800" role="group" aria-label="Show">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={filters.view === v.id}
              onClick={() => change({ view: v.id })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
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

      <ul className={`space-y-3 transition-opacity ${updating ? "opacity-50" : ""}`}>
        {results.slice(0, shown).map((item) => (
          <Row key={item.id} item={item} status={tracked[item.url]?.status} closed={loaded(item) && !open.has(item.url)} fresh={isNew(item, since)} updated={data.updated} onTrack={track} />
        ))}
      </ul>

      {results.length === 0 && !updating && (
        <div className={`${card} p-10 text-center`}>
          <Icon name={emptyList ? "bookmark" : "search"} className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="font-semibold">
            {emptyList ? `Nothing ${applied.view === "saved" ? "saved" : "marked as applied"} yet` : "Nothing matches those filters"}
          </p>
          {applied.size !== "" && !emptyList && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Company sizes are known for most companies, but not all.</p>
          )}
          <button type="button" onClick={() => { setFilters(NO_FILTERS); update(NO_FILTERS, 0); }} className="mt-4 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-berkeley">
            {emptyList ? "See all jobs" : "Clear filters"}
          </button>
        </div>
      )}

      {shown < results.length && (
        <button type="button" onClick={() => setShown(shown + PAGE)} className="mx-auto block rounded-xl bg-berkeley px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 dark:bg-gold dark:text-berkeley dark:hover:brightness-95">
          Show more ({(results.length - shown).toLocaleString()} left)
        </button>
      )}

      <section aria-label="Search other sites" className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-slate-100">Not finding it?</span> Run this search on other sites.
        </p>
        <div className="flex flex-wrap gap-2">
          {/* exactly what's in the boxes, not the search from a moment ago */}
          {searchElsewhere(filters).map((site) => (
            <a
              key={site.name}
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Search this on ${site.name} (opens in a new tab)`}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {site.name}
              <Icon name="external" className="h-3 w-3" />
            </a>
          ))}
        </div>
      </section>

      <footer className="pt-4 text-center text-xs text-slate-600 dark:text-slate-300">
        <p>Updated {new Date(data.updated * 1000).toLocaleDateString(undefined, { dateStyle: "medium" })} from {data.sources.filter((s) => s.ok || s.count).map((s) => s.name).join(", ")}.</p>
        <p className="mx-auto mt-1 max-w-3xl">
          Not every job is here, so try the other sites too. Company sizes come from Wikidata and BigPicture&apos;s free company dataset (ODC-BY, late 2023), are approximate and not known for every company, and few
          listings state work authorization, so check each one. Always confirm details on the company&apos;s own page.
        </p>
      </footer>

      {scrolled && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="fixed right-4 bottom-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-berkeley text-white shadow-lg transition hover:brightness-110 dark:bg-gold dark:text-berkeley"
        >
          <Icon name="up" className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
