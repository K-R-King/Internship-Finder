"use client";

import { useEffect, useMemo, useState } from "react";
import { age, matches, NO_FILTERS, SEASONS, type Data, type Filters, type Internship, type Tracked } from "@/lib/internships";

const PAGE = 50;
const STORAGE_KEY = "internship-finder:tracked";

const VIEWS: { id: Filters["view"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
];

const CHECKS: { id: "undergrad" | "remote" | "sponsorship"; label: string }[] = [
  { id: "undergrad", label: "Open to undergrads" },
  { id: "remote", label: "Remote" },
  { id: "sponsorship", label: "May sponsor visas" },
];

function loadTracked(): Tracked {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveTracked(tracked: Tracked) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracked));
  } catch {
    // private windows can block storage; tracking still works until the page closes
  }
}

const field = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

function Row({ item, status, updated, onTrack }: {
  item: Internship;
  status?: Tracked[string];
  updated: number;
  onTrack: (id: string, status: Tracked[string]) => void;
}) {
  const places = item.locations.slice(0, 3).join(" · ") + (item.locations.length > 3 ? ` +${item.locations.length - 3} more` : "");
  const toggle = (next: Tracked[string], label: string) => (
    <button
      type="button"
      aria-pressed={status === next}
      aria-label={`${label} ${item.title} at ${item.company}`}
      onClick={() => onTrack(item.id, next)}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
        status === next ? "bg-berkeley text-white dark:bg-gold dark:text-berkeley" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <li data-listing={item.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center dark:bg-slate-900 dark:ring-slate-700">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.company}</p>
        <h3 className="font-semibold text-berkeley dark:text-blue-200">{item.title}</h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {[places, item.terms.join(", "), age(item.posted, updated)].filter(Boolean).join("  •  ")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{item.field}</span>
          {item.gradOnly && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800 dark:bg-violet-950 dark:text-violet-200">Grad students</span>}
          {item.sponsorship === "offers" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Sponsors visas</span>}
          {item.sponsorship === "none" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">No sponsorship</span>}
          {item.sponsorship === "citizens" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">U.S. citizens only</span>}
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
          Apply ↗
        </a>
      </div>
    </li>
  );
}

export default function Finder() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [tracked, setTracked] = useState<Tracked>({});
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    Promise.resolve().then(() => setTracked(loadTracked()));
    fetch("/internships.json")
      .then((res) => {
        if (!res.ok) throw new Error(`internships.json: ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => {
        console.error(err);
        setFailed(true);
      });
  }, []);

  const results = useMemo(
    () => (data?.items ?? []).filter((item) => matches(item, filters, tracked)),
    [data, filters, tracked],
  );
  const fields = useMemo(() => [...new Set((data?.items ?? []).map((i) => i.field))].sort(), [data]);

  function change(next: Partial<Filters>) {
    setFilters({ ...filters, ...next });
    setShown(PAGE);
  }

  function track(id: string, status: Tracked[string]) {
    const next = { ...tracked };
    if (next[id] === status) delete next[id];
    else next[id] = status;
    setTracked(next);
    saveTracked(next);
  }

  if (failed) {
    return <p role="alert" className="rounded-2xl bg-red-50 p-6 text-center text-red-800 dark:bg-red-950 dark:text-red-200">Couldn&apos;t load the internships. Refresh the page to try again.</p>;
  }
  if (!data) return <p className="p-10 text-center text-slate-600 dark:text-slate-300">Loading internships…</p>;

  const count = (view: Filters["view"]) => (view === "all" ? data.items.length : Object.values(tracked).filter((s) => s === view).length);

  return (
    <div className="space-y-5">
      <section aria-label="Filters" className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input aria-label="Search by company or role" placeholder="Company or role" value={filters.query} onChange={(e) => change({ query: e.target.value })} className={field} />
          <input aria-label="Location" placeholder="Location, e.g. CA or London" value={filters.location} onChange={(e) => change({ location: e.target.value })} className={field} />
          <select aria-label="Field" value={filters.field} onChange={(e) => change({ field: e.target.value })} className={field}>
            <option value="">All fields</option>
            {fields.map((f) => <option key={f}>{f}</option>)}
          </select>
          <select aria-label="Season" value={filters.season} onChange={(e) => change({ season: e.target.value })} className={field}>
            <option value="">Any season</option>
            {SEASONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {CHECKS.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" checked={filters[c.id]} onChange={(e) => change({ [c.id]: e.target.checked })} className="accent-berkeley" />
              {c.label}
            </label>
          ))}
          <div className="ml-auto flex gap-1" role="group" aria-label="Show">
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
                {v.label} ({count(v.id).toLocaleString()})
              </button>
            ))}
          </div>
        </div>
      </section>

      <p aria-live="polite" className="text-sm text-slate-600 dark:text-slate-300">
        {results.length.toLocaleString()} internship{results.length === 1 ? "" : "s"}, newest first
      </p>

      <ul className="space-y-3">
        {results.slice(0, shown).map((item) => (
          <Row key={item.id} item={item} status={tracked[item.id]} updated={data.updated} onTrack={track} />
        ))}
      </ul>

      {results.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
          <p className="font-semibold">Nothing matches those filters</p>
          <button type="button" onClick={() => change(NO_FILTERS)} className="mt-3 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-berkeley">Clear filters</button>
        </div>
      )}

      {shown < results.length && (
        <button type="button" onClick={() => setShown(shown + PAGE)} className="mx-auto block rounded-xl bg-berkeley px-5 py-2.5 text-sm font-semibold text-white dark:bg-gold dark:text-berkeley">
          Show more ({(results.length - shown).toLocaleString()} left)
        </button>
      )}

      <footer className="pt-6 text-center text-xs text-slate-600 dark:text-slate-300">
        <p>Updated {new Date(data.updated * 1000).toLocaleDateString(undefined, { dateStyle: "medium" })} from {data.sources.filter((s) => s.ok || s.count).map((s) => s.name).join(", ")}.</p>
        <p className="mt-1">Not every internship is here: coverage is strongest for tech roles in the U.S. Always confirm details on the company&apos;s own page.</p>
      </footer>
    </div>
  );
}
