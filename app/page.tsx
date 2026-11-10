import Finder from "@/components/Finder";
import SuiteNav from "@/components/SuiteNav";

export default function Home() {
  return (
    <>
      <header className="relative overflow-hidden bg-berkeley bg-linear-to-br from-berkeley-dark via-berkeley to-[#0b4a7a] px-4 pt-8 pb-14 text-white sm:pt-12 sm:pb-16">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-5xl">
          <div className="mb-5 flex justify-end sm:mb-6">
            <SuiteNav current="internships" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Internship <span className="text-gold">Finder</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-blue-100 sm:text-base">
            U.S. internships and entry-level jobs for university students, gathered from company job boards and public job lists into one search.
          </p>
        </div>
      </header>
      <main className="relative mx-auto -mt-8 w-full max-w-5xl flex-1 px-4 pb-12">
        <Finder />
      </main>
    </>
  );
}
