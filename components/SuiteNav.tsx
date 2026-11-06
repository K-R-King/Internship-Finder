import { HOME_URL, SUITE, type SiteId } from "@/lib/suite";

const pill = "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs";
const active = `${pill} bg-gold font-semibold text-berkeley shadow-md shadow-gold/30`;
const idle = `${pill} font-medium text-blue-100 transition hover:bg-white/10 hover:text-gold`;

// switches between the EECS Hub and its tools; the same component lives in each EECS site
export default function SuiteNav({ current }: { current: SiteId | "home" }) {
  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/15 bg-white/5 p-1 backdrop-blur sm:rounded-full" aria-label="EECS student tools">
      {current === "home" ? (
        <span aria-current="page" aria-label="EECS Hub" className={`${active} px-2.5`}>🏠</span>
      ) : (
        <a href={HOME_URL} aria-label="EECS Hub home" title="EECS Hub" className={`${idle} px-2.5`}>🏠</a>
      )}
      {SUITE.map((s) =>
        s.id === current ? (
          <span key={s.id} aria-current="page" className={active}>
            <span aria-hidden className="hidden sm:inline">{s.icon}</span>
            {s.label}
          </span>
        ) : (
          <a key={s.id} href={s.url} className={idle}>
            <span aria-hidden className="hidden sm:inline">{s.icon}</span>
            {s.label}
          </a>
        ),
      )}
    </div>
  );
}
