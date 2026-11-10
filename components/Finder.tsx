"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  age, companySize, extraLevels, filtersFromUrl, graduationOptions, inLevel, isNew, isVerified, LEVEL_NAMES, LEVELS, MAJORS, matches, NO_FILTERS, readTracked, searchElsewhere, SIZES,
  termsIn, type Data, type Filters, type Internship, type Level, type Status, type Tracked,
} from "@/lib/internships";
import { indexPlaces, locate, withinMiles, type Places } from "@/lib/places";

const PAGE = 50;
const UPDATE_DELAY = 400;  // long enough to finish typing, and to see that results are updating
const STORAGE_KEY = "internship-finder:tracked";
const LAST_VISIT_KEY = "internship-finder:last-visit";

const LISTS: { id: "saved" | "applied"; label: string; icon: keyof typeof ICONS }[] = [
  { id: "saved", label: "Saved", icon: "bookmark" },
  { id: "applied", label: "Applied", icon: "check" },
];

const CHECKS: { id: "remote" | "verified" | "permanent" | "sponsorship"; label: string }[] = [
  { id: "remote", label: "Remote" },
  { id: "verified", label: "Verified companies" },
  { id: "permanent", label: "Open to permanent residents" },
  { id: "sponsorship", label: "May sponsor visas" },
];

const DISTANCES = [
  { value: "", label: "Only this place" },
  ...["25", "50", "100", "200"].map((miles) => ({ value: miles, label: `Within ${miles} miles` })),
];

const DEGREES = [
  { value: "undergrad", label: "Undergrad Students" },
  { value: "grad", label: "Graduate Students" },
];

const POSTED = [
  { value: "", label: "Any time" },
  { value: "1", label: "1 day" },
  { value: "7", label: "1 Week" },
  { value: "30", label: "1 Month" },
];


const VERIFIED_NOTE = "Posted on the employer's own hiring system, by a company found in public company records.";

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

async function loadPlaces(): Promise<Places> {
  const res = await fetch("/us-places.json");
  if (!res.ok) throw new Error(`us-places.json: ${res.status}`);
  return indexPlaces(await res.json());
}

const card = "rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800";
const control = "w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pr-3 pl-10 text-sm transition placeholder:text-slate-500 hover:border-slate-300 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:placeholder:text-slate-400 dark:hover:border-slate-600 dark:focus:bg-slate-900";
const chip = "rounded-full px-2 py-0.5";
const pill = "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition";
const pillOff = "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800";
const pillOn = "border-berkeley bg-berkeley/10 text-berkeley dark:border-gold dark:bg-gold/15 dark:text-gold";

const ICONS = {
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4.2-4.2",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  calendar: "M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  field: "M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6M4 6h16v13H4zM4 12h16",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  bookmark: "M6 4h12v17l-6-4-6 4z",
  check: "M5 12.5l4.5 4.5L19 7",
  verified: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12.2l2.4 2.4 4.6-4.9",
  sliders: "M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M6 9l6 6 6-6",
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
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join("").toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      style={{ "--hue": hue } as CSSProperties}
      className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl bg-[hsl(var(--hue)_70%_93%)] text-sm font-bold text-[hsl(var(--hue)_55%_28%)] sm:grid dark:bg-[hsl(var(--hue)_35%_20%)] dark:text-[hsl(var(--hue)_70%_82%)]"
    >
      {letters}
    </span>
  );
}

function Detail({ icon, children }: { icon: keyof typeof ICONS; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon name={icon} className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
      {children}
    </span>
  );
}

function Row({ item, index, status, closed, fresh, updated, onTrack }: {
  item: Internship;
  index: number;
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
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
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
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={`${card} rise group relative flex gap-4 overflow-hidden p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-berkeley/10 hover:ring-gold/70 sm:p-5 dark:hover:ring-gold/50 ${closed ? "opacity-75" : ""}`}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-gold to-amber-500 opacity-0 transition group-hover:opacity-100" />
      <Initials name={item.company} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-base leading-snug font-semibold text-berkeley dark:text-blue-200">{item.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-600 dark:text-slate-300">
            <span>
              <span className="font-medium text-slate-900 dark:text-slate-100">{item.company}</span>
              {size ? ` · ${size}` : ""}
            </span>
            {isVerified(item) && (
              <span title={VERIFIED_NOTE} className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Icon name="verified" />
                Verified
              </span>
            )}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {places && <Detail icon="pin">{places}</Detail>}
            {terms && <Detail icon="calendar">{terms}</Detail>}
            {item.field && <Detail icon="field">{item.field}</Detail>}
            {posted && <Detail icon="clock">{posted}</Detail>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
            <span className={`${chip} bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200`}>{LEVEL_NAMES[item.type ?? "internship"]}</span>
            {posted === "today" && <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200`}>🔥 Just posted</span>}
            {fresh && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>New</span>}
            {closed && <span className={`${chip} bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200`}>No longer listed</span>}
            {item.gradOnly && <span className={`${chip} bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200`}>Grad students</span>}
            {item.sponsorship === "offers" && <span className={`${chip} bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200`}>Sponsors visas</span>}
            {item.sponsorship === "none" && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>No sponsorship</span>}
            {item.sponsorship === "citizens" && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>U.S. citizens only</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3 md:border-0 md:pt-0 dark:border-slate-800">
          {toggle("saved", "Save", "Saved", "bookmark")}
          {toggle("applied", "Applied", "Applied", "check")}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Apply to ${item.title} at ${item.company} (opens in a new tab)`}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-linear-to-r from-gold to-amber-300 px-4 py-2 text-xs font-bold text-berkeley shadow-sm transition hover:shadow-md hover:shadow-gold/40 hover:brightness-105 md:ml-0"
          >
            Apply
            <Icon name="external" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </li>
  );
}

/** A pill that opens a list of choices: checkboxes for any number of them, or radio buttons with `single`. */
function Menu({ caption, all, options, picked, onChange, single = false, disabled = false, hint }: {
  caption: string;
  all: string;  // the heading while nothing is picked
  options: { value: string; label: string }[];
  picked: string[];
  onChange: (next: string[]) => void;
  single?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);  // opens leftward when there's no room on the right
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const nameOf = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  const summary = picked.length === 0 ? all : picked.length === 1 ? nameOf(picked[0]) : `${caption} (${picked.length})`;

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function toggle() {
    const left = button.current?.getBoundingClientRect().left ?? 0;
    setFlip(left + 272 > window.innerWidth - 16);
    setOpen(!open);
  }

  return (
    // on phones the list spans the filter bar; from sm up it hangs under its own pill
    <div
      ref={box}
      className="sm:relative"
      onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    >
      <button
        ref={button}
        type="button"
        disabled={disabled}
        title={disabled ? hint : undefined}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${caption}: ${picked.length === 0 ? "any" : picked.length === 1 ? nameOf(picked[0]) : `${picked.length} selected`}`}
        onClick={toggle}
        className={`${pill} ${picked.length ? pillOn : pillOff} max-w-[calc(100vw-5.5rem)] disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className="truncate">{summary}</span>
        <Icon name="down" className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          id={id}
          role="group"
          aria-label={caption}
          className={`absolute top-full right-0 left-0 z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200 sm:right-auto sm:w-68 dark:bg-slate-900 dark:ring-slate-700 ${flip ? "sm:right-0 sm:left-auto" : ""}`}
        >
          {options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm select-none hover:bg-slate-100 dark:hover:bg-slate-800">
              <input
                type={single ? "radio" : "checkbox"}
                name={single ? id : undefined}
                checked={single ? (picked[0] ?? "") === option.value : picked.includes(option.value)}
                onChange={(e) => {
                  if (single) {
                    onChange(option.value ? [option.value] : []);
                    setOpen(false);
                    button.current?.focus();
                  } else {
                    onChange(e.target.checked ? [...picked, option.value] : picked.filter((p) => p !== option.value));
                  }
                }}
                className="h-4.5 w-4.5 shrink-0 accent-berkeley dark:accent-gold"
              />
              <span className="min-w-0 flex-1">{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** A number that counts up when it first appears. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const done = duration ? Math.min((now - start) / duration, 1) : 1;
      setShown(Math.round(value * (1 - (1 - done) ** 3)));
      if (done < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

function Stat({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-white/15">
      <p className="text-2xl leading-tight font-extrabold text-white tabular-nums"><CountUp value={value} /></p>
      <p className="mt-0.5 text-xs font-medium text-blue-100"><span aria-hidden="true">{emoji} </span>{label}</p>
    </div>
  );
}

function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <p className="sr-only">Loading jobs{"…"}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-white/10 ring-1 ring-white/15" />)}
      </div>
      <div className={`${card} h-52 animate-pulse`} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`${card} flex animate-pulse gap-4 p-5`}>
          <div className="hidden h-12 w-12 rounded-xl bg-slate-200 sm:block dark:bg-slate-800" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-800" />
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
  const [places, setPlaces] = useState<Places | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);  // what the form shows
  const [applied, setApplied] = useState<Filters | null>(null);  // what the results show; null until known
  const [updating, setUpdating] = useState(false);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestUpdate = useRef(0);
  const extraRef = useRef(extra);
  const placesRef = useRef(places);
  const downloads = useRef(new Map<string, Promise<unknown>>());
  const [tracked, setTracked] = useState<Tracked>({});
  const [shown, setShown] = useState(PAGE);
  const [since, setSince] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);  // the filter pills, folded away on phones
  const [scrolled, setScrolled] = useState(false);

  /** Starts a big download once, however many searches are waiting for it; a failed one can be tried again. */
  function once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let download = downloads.current.get(key) as Promise<T> | undefined;
    if (!download) {
      download = load().catch((err) => {
        downloads.current.delete(key);
        throw err;
      });
      downloads.current.set(key, download);
    }
    return download;
  }

  /** Runs the search again, saying so while it does, and loads anything it needs first. */
  function update(next: Filters, delay = UPDATE_DELAY) {
    const id = ++latestUpdate.current;
    setUpdating(true);
    clearTimeout(updateTimer.current);
    updateTimer.current = setTimeout(async () => {
      const missing = extraLevels(next.level).filter((level) => !extraRef.current[level]);
      const needsMap = Boolean(next.miles && next.location.trim()) && !placesRef.current;
      let problem: string | null = null;
      try {
        const [levels, map] = await Promise.all([
          Promise.all(missing.map(async (level) => [level, await once(level, () => loadLevel(level))] as const)),
          needsMap ? once("places", loadPlaces) : null,
        ]);
        if (levels.length) {
          extraRef.current = { ...extraRef.current, ...Object.fromEntries(levels) };
          setExtra(extraRef.current);
        }
        if (map) {
          placesRef.current = map;
          setPlaces(map);
        }
      } catch (err) {
        console.error(err);
        problem = "Couldn't load everything just now. Search again to retry.";
      }
      if (id !== latestUpdate.current) return;
      setNotice(problem);
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
        const fromAddress = { ...NO_FILTERS, ...filtersFromUrl(window.location.search) };
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
  const appliedPlace = applied?.miles ? applied.location.trim() : "";
  const center = useMemo(() => (places && appliedPlace ? locate(places, appliedPlace) : null), [places, appliedPlace]);
  const appliedMiles = Number(applied?.miles) || 0;
  const within = useMemo(() => (places && center && appliedMiles ? withinMiles(places, center, appliedMiles) : undefined), [places, center, appliedMiles]);
  const updated = data?.updated;  // ages count from the last refresh, as the cards do
  const results = useMemo(() => {
    if (!applied) return [];
    const pool = applied.view === "all"
      ? everything
      : Object.values(tracked).filter((t) => t.status === applied.view).map((t) => t.item);
    return pool.filter((item) => matches(item, applied, since, applied.view !== "all", within, updated));
  }, [everything, applied, tracked, since, within, updated]);
  const loaded = (item: Internship) => item.type !== "mid" && item.type !== "senior" ? true : Boolean(extra[item.type]);
  const open = useMemo(() => new Set(everything.map((i) => i.url)), [everything]);
  // the menus describe the tab that's open
  const browsing = filters.view === "all";
  const listed = useMemo(() => (browsing ? everything.filter((i) => inLevel(i, filters.level)) : everything), [everything, browsing, filters.level]);
  const newCount = useMemo(() => listed.filter((item) => isNew(item, since)).length, [listed, since]);
  const terms = useMemo(() => termsIn(listed), [listed]);
  const stats = useMemo(() => {
    const items = data?.items ?? [];
    const weekAgo = (data?.updated ?? 0) - 7 * 86400;
    return {
      internships: items.filter((i) => (i.type ?? "internship") === "internship").length,
      entry: items.filter((i) => i.type === "entry").length,
      companies: new Set(items.map((i) => i.company)).size,
      week: items.filter((i) => i.posted && i.posted >= weekAgo).length,
    };
  }, [data]);

  function change(next: Partial<Filters>) {
    const changed = { ...filters, ...next };
    setFilters(changed);
    update(changed);
  }

  /** Changes the levels shown. Jobs almost never name a term, so a term only applies while internships are included. */
  function pickLevels(level: Level[]) {
    change({ level, ...(level.length && !level.includes("internship") && { term: [] }) });
  }

  /** Back to browsing from Saved or Applied. A term picked there can't carry over to a list of only jobs. */
  function browse() {
    const jobsOnly = filters.level.length > 0 && !filters.level.includes("internship");
    change({ view: "all", ...(jobsOnly && { term: [] }) });
  }

  function reset(view: Filters["view"]) {
    const cleared = { ...NO_FILTERS, view };
    setFilters(cleared);
    update(cleared, 0);
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

  const count = (view: Status) => Object.values(tracked).filter((t) => t.status === view).length;
  const emptyList = applied.view !== "all" && count(applied.view) === 0;
  const onlyInternships = applied.level.length === 1 && applied.level[0] === "internship";
  const anyInternships = applied.level.length === 0 || applied.level.includes("internship");
  const noun = applied.view !== "all" ? "job" : onlyInternships ? "internship" : anyInternships ? "listing" : "job";
  const showTerm = !browsing || filters.level.length === 0 || filters.level.includes("internship");  // jobs almost never name a term
  const usualLevels = filters.level.length === 1 && filters.level[0] === "internship";
  const hasPlace = filters.location.trim() !== "";
  const grads = graduationOptions(data.updated);
  const levelName = (id: Level) => LEVELS.find((l) => l.id === id)?.label ?? id;
  const tab = (on: boolean) => `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold whitespace-nowrap transition sm:px-4 sm:text-sm ${
    on ? "bg-berkeley text-white shadow-sm dark:bg-gold dark:text-berkeley" : "text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-700"
  }`;

  // the filters in use, each removable on its own
  const without = (list: string[], value: string) => list.filter((v) => v !== value);
  const active: { label: string; clear: Partial<Filters> }[] = [
    ...(filters.query.trim() ? [{ label: `“${filters.query.trim()}”`, clear: { query: "" } }] : []),
    ...(hasPlace ? [{ label: `Near ${filters.location.trim()}`, clear: { location: "", miles: "" } }] : []),
    ...(hasPlace && filters.miles ? [{ label: `Within ${filters.miles} miles`, clear: { miles: "" } }] : []),
    ...(browsing && !usualLevels ? filters.level.map((id) => ({ label: levelName(id), clear: { level: filters.level.filter((l) => l !== id) } })) : []),
    ...filters.major.map((name) => ({ label: name, clear: { major: without(filters.major, name) } })),
    ...filters.term.map((term) => ({ label: term, clear: { term: without(filters.term, term) } })),
    ...(filters.posted ? [{ label: `Posted within ${POSTED.find((p) => p.value === filters.posted)?.label}`, clear: { posted: "" } }] : []),
    ...(filters.grad ? [{ label: `Graduating ${grads.find((g) => g.value === filters.grad)?.label ?? filters.grad}`, clear: { grad: "" } }] : []),
    ...filters.size.map((size) => ({ label: SIZES[Number(size)]?.label ?? size, clear: { size: without(filters.size, size) } })),
    ...(filters.undergrad ? [{ label: "Undergrad Students", clear: { undergrad: false } }] : []),
    ...(filters.forGrads ? [{ label: "Graduate Students", clear: { forGrads: false } }] : []),
    ...CHECKS.filter((c) => filters[c.id]).map((c) => ({ label: c.label, clear: { [c.id]: false } })),
    ...(filters.fresh ? [{ label: "New since last visit", clear: { fresh: false } }] : []),
  ];
  const folded = (browsing && !usualLevels ? filters.level.length : 0) + filters.major.length + filters.term.length + filters.size.length
    + (filters.grad ? 1 : 0) + (filters.posted ? 1 : 0) + (filters.undergrad ? 1 : 0) + (filters.forGrads ? 1 : 0) + (hasPlace && filters.miles ? 1 : 0) + CHECKS.filter((c) => filters[c.id]).length + (filters.fresh ? 1 : 0);
  const unplaced = appliedPlace !== "" && places !== null && center === null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat emoji="🎓" value={stats.internships} label="Internships" />
        <Stat emoji="🚀" value={stats.entry} label="Entry level jobs" />
        <Stat emoji="🏢" value={stats.companies} label="Companies hiring" />
        <Stat emoji="🔥" value={stats.week} label="Posted this week" />
      </div>

      <form
        aria-label="Filters"
        onSubmit={(e) => {
          e.preventDefault();
          update(filters, 150);
        }}
        className={`${card} relative space-y-4 p-4 shadow-xl shadow-berkeley/10 sm:p-5`}
      >
        <div role="group" aria-label="Show" className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button type="button" aria-pressed={browsing} onClick={browse} className={tab(browsing)}>
              <Icon name="search" />
              All listings
            </button>
            {LISTS.map((l) => (
              <button key={l.id} type="button" aria-pressed={filters.view === l.id} onClick={() => change({ view: l.id })} className={tab(filters.view === l.id)}>
                <Icon name={l.icon} />
                {l.label} ({count(l.id).toLocaleString()})
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input aria-label="Search by company or role" placeholder="Company or role" value={filters.query} onChange={(e) => change({ query: e.target.value })} className={control} />
          </div>
          <div className="relative">
            <Icon name="pin" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input aria-label="Location" placeholder="U.S. city or state, e.g. LA or CA" value={filters.location} onChange={(e) => change({ location: e.target.value, ...(e.target.value.trim() ? {} : { miles: "" }) })} className={control} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-filters"
              onClick={() => setMoreOpen(!moreOpen)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 sm:hidden dark:border-slate-700 dark:text-slate-200"
            >
              <Icon name="sliders" className="h-4 w-4" />
              Filters{folded ? ` (${folded})` : ""}
            </button>
            <button type="submit" className="flex-1 rounded-xl bg-linear-to-r from-gold to-amber-300 px-7 py-3 text-sm font-bold text-berkeley shadow-md shadow-gold/30 transition hover:-translate-y-px hover:shadow-lg hover:shadow-gold/40">Search</button>
          </div>
        </div>

        <div id="more-filters" className={`${moreOpen ? "flex" : "hidden"} relative flex-wrap items-center gap-2 sm:flex`}>
          {browsing && (
            <Menu caption="Internships and Job Levels" all="All Internships and Job Levels" options={LEVELS.map((l) => ({ value: l.id, label: l.label }))} picked={filters.level} onChange={(level) => pickLevels(level as Level[])} />
          )}
          <Menu caption="Major" all="All Majors" options={MAJORS.map((m) => ({ value: m.label, label: m.label }))} picked={filters.major} onChange={(major) => change({ major })} />
          {showTerm && (
            <Menu caption="Applying for term" all="Applying for All Terms" options={[...new Set([...terms, ...filters.term])].map((t) => ({ value: t, label: t }))} picked={filters.term} onChange={(term) => change({ term })} />
          )}
          <Menu
            caption="Degree" all="All Degrees"
            options={DEGREES}
            picked={[...(filters.undergrad ? ["undergrad"] : []), ...(filters.forGrads ? ["grad"] : [])]}
            onChange={(picked) => change({ undergrad: picked.includes("undergrad"), forGrads: picked.includes("grad") })}
          />
          <Menu caption="Date posted" all="All Dates Posted" single options={POSTED} picked={filters.posted ? [filters.posted] : []} onChange={([posted = ""]) => change({ posted })} />
          <Menu caption="Graduation date" all="All Graduation Dates" single options={[{ value: "", label: "Any graduation date" }, ...grads]} picked={filters.grad ? [filters.grad] : []} onChange={([grad = ""]) => change({ grad })} />
          <Menu caption="Company size" all="All Company Sizes" options={SIZES.map((s, i) => ({ value: String(i), label: s.label }))} picked={filters.size} onChange={(size) => change({ size })} />
          <Menu caption="Distance" all="All Distances" single disabled={!hasPlace} hint="Type a city first" options={DISTANCES} picked={hasPlace && filters.miles ? [filters.miles] : []} onChange={([miles = ""]) => change({ miles })} />
          {[...CHECKS, ...(newCount > 0 || filters.fresh ? [{ id: "fresh" as const, label: `New since last visit (${newCount.toLocaleString()})` }] : [])].map((c) => (
            <label key={c.id} className={`${pill} ${filters[c.id] ? pillOn : pillOff} cursor-pointer select-none`}>
              <input type="checkbox" checked={filters[c.id]} onChange={(e) => change({ [c.id]: e.target.checked })} className="h-4 w-4 accent-berkeley dark:accent-gold" />
              {c.label}
            </label>
          ))}
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
            <button type="button" onClick={() => reset(filters.view)} className="px-1 font-semibold text-berkeley underline-offset-2 hover:underline dark:text-gold">
              Clear all
            </button>
          </div>
        )}
      </form>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <p aria-live="polite" className={`text-sm ${updating ? "font-semibold text-berkeley dark:text-gold" : "font-medium text-slate-700 dark:text-slate-200"}`}>
          {updating ? "Updating results…" : `${results.length.toLocaleString()} ${noun}${results.length === 1 ? "" : "s"}, newest first`}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300">Updated {new Date(data.updated * 1000).toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
      </div>

      {notice && <p role="status" className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{notice}</p>}
      {unplaced && !updating && (
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Distance needs one city, like Austin, TX. Couldn&apos;t place &ldquo;{appliedPlace}&rdquo; on the map, so this shows that exact place only.
        </p>
      )}

      <ul className={`space-y-3 transition-opacity ${updating ? "opacity-50" : ""}`}>
        {results.slice(0, shown).map((item, index) => (
          <Row key={item.id} item={item} index={index} status={tracked[item.url]?.status} closed={loaded(item) && !open.has(item.url)} fresh={isNew(item, since)} updated={data.updated} onTrack={track} />
        ))}
      </ul>

      {results.length === 0 && !updating && (
        <div className={`${card} p-10 text-center`}>
          <Icon name={emptyList ? "bookmark" : "search"} className="mx-auto mb-3 h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="font-semibold">
            {emptyList ? `Nothing ${applied.view === "saved" ? "saved" : "marked as applied"} yet` : "Nothing matches those filters"}
          </p>
          {applied.size.length > 0 && !emptyList && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Company sizes are known for most companies, but not all.</p>
          )}
          <button type="button" onClick={() => reset(emptyList ? "all" : applied.view)} className="mt-4 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-berkeley">
            {emptyList ? "See all listings" : "Clear filters"}
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
        <p>From {data.sources.filter((s) => s.ok || s.count).map((s) => s.name).join(", ")}.</p>
        <p className="mx-auto mt-1 max-w-3xl">
          Not every job is here, so try the other sites too. &ldquo;Verified&rdquo; means posted on the employer&apos;s own hiring system by a company found in public company records; it isn&apos;t a guarantee, so still check each listing.
          Company sizes come from Wikidata and BigPicture&apos;s free company dataset (ODC-BY, late 2023), are approximate and not known for every company. Distances use GeoNames (CC BY 4.0). Few listings state work authorization or a graduation date,
          so the graduation filter only removes listings that rule you out. Always confirm details on the company&apos;s own page.
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
