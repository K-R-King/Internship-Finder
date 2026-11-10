import Finder from "@/components/Finder";
import SuiteNav from "@/components/SuiteNav";

export default function Home() {
  return (
    <>
      <header className="relative overflow-hidden bg-berkeley bg-linear-to-br from-berkeley-dark via-berkeley to-[#0b4a7a] px-4 pt-6 pb-56 text-white sm:pt-8 sm:pb-36">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="blob blob-gold pointer-events-none absolute" />
        <div aria-hidden="true" className="blob blob-sky pointer-events-none absolute" />
        <div className="relative mx-auto max-w-5xl">
          <div className="mb-5 flex justify-end sm:mb-6">
            <SuiteNav current="internships" />
          </div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gold ring-1 ring-white/15">
            <span className="pulse-dot h-2 w-2 rounded-full bg-gold" />
            Updated every day
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            Internship <span className="gold-shine">Finder</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-blue-100 sm:text-lg">
            Your next role starts here. U.S. internships and jobs for university students, from thousands of company job boards, in one search.
          </p>
        </div>
      </header>
      <main className="relative mx-auto -mt-52 sm:-mt-32 w-full max-w-5xl flex-1 px-4 pb-12">
        <Finder />
      </main>
    </>
  );
}
