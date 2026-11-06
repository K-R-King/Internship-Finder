import Finder from "@/components/Finder";

export default function Home() {
  return (
    <>
      <header className="relative overflow-hidden bg-berkeley bg-linear-to-br from-berkeley-dark via-berkeley to-[#0b4a7a] px-4 pt-12 pb-16 text-white">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-5xl">
          <a href="https://eecs-hub.vercel.app" className="mb-4 inline-block text-sm font-medium text-blue-100 underline-offset-4 hover:text-gold hover:underline">
            ← EECS Hub
          </a>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Internship <span className="text-gold">Finder</span>
          </h1>
          <p className="mt-3 max-w-xl text-blue-100">
            Open internships for university students, gathered from company job boards and student-run lists into one search.
          </p>
        </div>
      </header>
      <main className="relative mx-auto -mt-8 w-full max-w-5xl flex-1 px-4 pb-12">
        <Finder />
      </main>
    </>
  );
}
