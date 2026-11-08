import { describe, expect, it } from "vitest";
import { companySize, extraLevels, filtersFromUrl, inPlace, isNew, matches, NO_FILTERS, readTracked, searchElsewhere, SIZES, termsIn, type Internship } from "@/lib/internships";
import { dedupe, fieldOf, fromGreenhouse, fromMuse, fromNewGrad, fromSimplify, fromSmartRecruiters, fromVansh, fromWorkday, isEntryLevel, isInternship, shortId, isUSPlace, jobType, keep, parseBoardLink, parseCareerSite, termHasPassed, termsIn as termsInTitle, usOnly, withoutEndedTerms, withYear, BANDS, sizeBand } from "@/lib/normalize.mjs";
import { csvFields, matchScore } from "../scripts/company-bands.mjs";
import { simpleCompany } from "@/lib/normalize.mjs";

const NOV_2026 = new Date("2026-11-06");
const simplifyRow = {
  id: "a", company_name: "Acme", title: "Software Engineer Intern", url: "https://acme.com/1", locations: ["Austin, TX"],
  terms: ["Summer 2027"], category: "Software", degrees: ["Bachelor's"], sponsorship: "Offers Sponsorship", date_posted: 100,
};

describe("isInternship", () => {
  it.each(["Software Intern", "Summer Internship", "Co-op, Mechanical", "Marketing Interns"])("accepts %s", (title) => {
    expect(isInternship(title)).toBe(true);
  });
  it.each(["Internal Tools Engineer", "International Sales Lead", "High School Internship, Software Engineering"])("rejects %s", (title) => {
    expect(isInternship(title)).toBe(false);
  });
});

describe("fieldOf", () => {
  it.each([
    ["Quantitative Trading Intern", "Quant"],
    ["Machine Learning Engineer, Intern", "AI & Data"],
    ["Firmware Engineer Intern", "Hardware"],
    ["Cybersecurity Analyst Intern", "Software"],
    ["Software Engineer, Intern", "Software"],
    ["Product Design Intern", "Design"],
    ["Associate Product Manager Intern", "Product"],
    ["Accounting Intern", "Business & Finance"],
    ["Marketing Intern", "Marketing & Comms"],
    ["Recruiting Intern", "People & Legal"],
    ["Horticulture Intern", "Other"],
    ["Civil Engineer Intern", "Other Engineering"],
    ["Photonics Test Engineer Intern", "Other Engineering"],
    ["Sales Engineer Intern", "Business & Finance"],
    ["Field Engineer Intern", "Other Engineering"],
  ])("%s is %s", (title, field) => {
    expect(fieldOf(title)).toBe(field);
  });

  it("falls back to the list's category", () => {
    expect(fieldOf("Rates & Distribution Intern", "AI/ML/Data")).toBe("AI & Data");
  });
});

describe("terms", () => {
  it("reads terms from titles", () => {
    expect(termsInTitle("Intern (Summer 2027 or Autumn 2027)")).toEqual(["Summer 2027", "Fall 2027"]);
  });

  it("knows which terms have ended", () => {
    expect(termHasPassed("Summer 2026", NOV_2026)).toBe(true);
    expect(termHasPassed("Fall 2026", NOV_2026)).toBe(false);
    expect(termHasPassed("Winter 2026", NOV_2026)).toBe(false);
    expect(termHasPassed("Summer", NOV_2026)).toBe(false);
  });
});

describe("keep", () => {
  const item = { ...fromSimplify(simplifyRow), posted: NOV_2026.getTime() / 1000 - 86400 };

  it("keeps an open internship", () => expect(keep(item, NOV_2026)).toBe(true));
  it("keeps one with no term listed", () => expect(keep({ ...item, terms: [] }, NOV_2026)).toBe(true));
  it("drops one whose terms have all ended", () => expect(keep({ ...item, terms: ["Summer 2026"] }, NOV_2026)).toBe(false));
  it("keeps one with any term still ahead", () => expect(keep({ ...item, terms: ["Summer 2026", "Summer 2027"] }, NOV_2026)).toBe(true));
  const yearsAgo = (years: number) => NOV_2026.getTime() / 1000 - years * 365 * 86400 - 86400;
  it("drops a year-old listing that names no term", () => expect(keep({ ...item, terms: [], posted: yearsAgo(1) }, NOV_2026)).toBe(false));
  it("keeps a year-old listing for a term ahead", () => expect(keep({ ...item, posted: yearsAgo(1) }, NOV_2026)).toBe(true));
  it("drops anything over two years old", () => expect(keep({ ...item, posted: yearsAgo(2) }, NOV_2026)).toBe(false));
  it("drops a listing's terms that have ended", () => {
    expect(withoutEndedTerms({ ...item, terms: ["Summer 2026", "Fall 2026", "Summer 2027"] }, NOV_2026).terms).toEqual(["Fall 2026", "Summer 2027"]);
  });
  it("drops links that aren't web pages", () => expect(keep({ ...item, url: "javascript:alert(1)" }, NOV_2026)).toBe(false));
});

describe("fromSimplify", () => {
  it("ignores N/A terms and reads sponsorship", () => {
    const item = fromSimplify({ ...simplifyRow, terms: ["N/A"] });
    expect(item.terms).toEqual([]);
    expect(item.sponsorship).toBe("offers");
  });

  it("marks listings only for graduate degrees", () => {
    expect(fromSimplify({ ...simplifyRow, degrees: ["PhD"] }).gradOnly).toBe(true);
    expect(fromSimplify({ ...simplifyRow, degrees: ["Bachelor's", "PhD"] }).gradOnly).toBe(false);
    expect(fromSimplify({ ...simplifyRow, degrees: [], title: "PhD Research Intern" }).gradOnly).toBe(true);
  });
});

describe("dedupe", () => {
  const direct = fromGreenhouse(
    { id: 1, title: "Software Engineer Intern", absolute_url: "https://boards.greenhouse.io/acme/1", location: { name: "Remote" }, first_published: "1970-01-01T00:00:50Z" },
    "Acme, Inc.",
  );

  it("merges the same posting from two sources, keeping the first link", () => {
    const [only, ...rest] = dedupe([direct, fromSimplify({ ...simplifyRow, locations: ["Remote"] })]);
    expect(rest).toEqual([]);
    expect(only.url).toBe(direct.url);
    expect(only.terms).toEqual(["Summer 2027"]);
    expect(only.posted).toBe(100);
    expect(only.sponsorship).toBe("offers");
  });

  it("merges one page listed twice, combining its places", () => {
    const again = fromSimplify({ ...simplifyRow, url: `${simplifyRow.url}?source=list`, locations: ["Dallas, TX"] });
    const [only, ...rest] = dedupe([fromSimplify(simplifyRow), again]);
    expect(rest).toEqual([]);
    expect(only.locations).toEqual(["Austin, TX", "Dallas, TX"]);
  });

  it("keeps a role's postings for different places apart, each with its link", () => {
    const other = fromSimplify({ ...simplifyRow, url: "https://acme.com/2", locations: ["Boston, MA"] });
    expect(dedupe([fromSimplify(simplifyRow), other]).map((i) => i.url)).toEqual([simplifyRow.url, other.url]);
  });

  it("drops a short link when a direct link to the role exists", () => {
    const short = fromVansh({ id: "v", company_name: "Acme", title: "Software Engineer Intern", url: "https://go.vansh.nyc/1", locations: ["ATX"], season: "Summer", date_posted: 90 });
    const [only, ...rest] = dedupe([fromSimplify(simplifyRow), short]);
    expect(rest).toEqual([]);
    expect(only.url).toBe(simplifyRow.url);
    expect(only.locations).toEqual(["Austin, TX"]);
  });

  it("keeps postings for different seasons apart", () => {
    const fall = fromSimplify({ ...simplifyRow, url: "https://acme.com/2", terms: ["Fall 2027"] });
    expect(dedupe([fromSimplify(simplifyRow), fall])).toHaveLength(2);
  });

  it("treats a company's short and long names as one", () => {
    const longName = fromSimplify({ ...simplifyRow, company_name: "Acme Technologies" });
    expect(dedupe([fromSimplify(simplifyRow), longName])).toHaveLength(1);
  });

  it("drops a bare season when a dated one says the same", () => {
    const [only] = dedupe([fromSimplify(simplifyRow), { ...fromSimplify(simplifyRow), terms: ["Summer", "Winter"] }]);
    expect(only.terms).toEqual(["Summer 2027", "Winter"]);
  });

  it("keeps different roles apart", () => {
    expect(dedupe([direct, fromSimplify({ ...simplifyRow, title: "Hardware Intern" })])).toHaveLength(2);
  });
});

describe("inPlace", () => {
  it.each([
    ["Austin, CA", "CA", true],
    ["San Diego, California", "ca", true],
    ["Chicago, IL", "CA", false],
    ["Toronto, Canada", "CA", false],
    ["Cambridge, MA", "CA", false],
    ["Remote in USA", "IN", false],
    ["Indianapolis, IN", "in", true],
    ["New York, NY", "NY", true],
    ["NYC", "NY", true],
    ["Los Angeles, CA", "LA", true],
    ["LA", "la", true],
    ["Santa Monica, CA", "LA", true],
    ["Playa Vista, LA", "LA", true],
    ["Baton Rouge, LA", "LA", true],
    ["Atlanta, GA", "LA", false],
    ["Dallas, TX", "LA", false],
    ["LA", "Los Angeles", true],
    ["SF", "San Francisco", true],
    ["South SF", "SF", true],
    ["San Francisco, CA", "SF", true],
    ["NYC", "New York", true],
    ["New York, NY", "NYC", true],
    ["Washington, D.C.", "DC", true],
    ["Washington, DC", "Washington DC", true],
    ["Seattle, Washington", "DC", false],
    ["Palo Alto, CA", "Bay Area", true],
    ["SF", "bay area", true],
    ["Los Angeles, CA", "Bay Area", false],
    ["SF", "CA", true],
    ["South SF", "CA", true],
    ["LA", "CA", true],
    ["Baton Rouge, LA", "CA", false],
    ["London, UK", "UK", true],
    ["San Francisco, CA", "francisco", true],
    ["Toronto, Canada", "canada", true],
  ])("%s for %s is %s", (location, query, expected) => {
    expect(inPlace(location, query)).toBe(expected);
  });
});

describe("matches", () => {
  const item = { company: "Google", title: "Software Intern", locations: [], terms: [], field: "Software" } as unknown as Internship;

  it("finds search words in any order", () => {
    expect(matches(item, { ...NO_FILTERS, query: "software google" })).toBe(true);
    expect(matches(item, { ...NO_FILTERS, query: "google hardware" })).toBe(false);
  });
});

describe("readTracked", () => {
  const item = { id: "Simplify:a", url: "https://acme.com/1" } as Internship;

  it.each([[null], [[]], [5], ["text"]])("ignores damaged data: %j", (saved) => {
    expect(readTracked(saved, [item])).toEqual({});
  });

  it("keeps a listing that has closed", () => {
    const saved = { [item.url]: { status: "applied", item } };
    expect(readTracked(saved, [])).toEqual(saved);
  });

  it("follows a listing whose link changed", () => {
    const moved = { ...item, url: "https://acme.com/direct" };
    const saved = { [item.url]: { status: "applied", item } };
    expect(readTracked(saved, [moved])).toEqual({ [moved.url]: { status: "applied", item: moved } });
  });

  it("upgrades entries saved before listings were copied", () => {
    expect(readTracked({ "Simplify:a": "saved", "Simplify:gone": "applied" }, [item])).toEqual({ [item.url]: { status: "saved", item } });
  });

  it("drops entries with the wrong shape", () => {
    expect(readTracked({ a: { status: "nope", item }, b: { status: "saved" } }, [item])).toEqual({});
  });
});

describe("parseBoardLink", () => {
  const uuid = "12345678-1234-1234-1234-123456789ABC";

  it.each([
    ["https://boards.greenhouse.io/Stripe/jobs/123", { kind: "greenhouse", token: "stripe", id: "123" }],
    ["https://job-boards.greenhouse.io/figma/jobs/456?gh_src=x", { kind: "greenhouse", token: "figma", id: "456" }],
    [`https://jobs.lever.co/palantir/${uuid}`, { kind: "lever", token: "palantir", id: uuid.toLowerCase() }],
    [`https://jobs.ashbyhq.com/ramp/${uuid}/application`, { kind: "ashby", token: "ramp", id: uuid.toLowerCase() }],
  ])("reads %s", (url, board) => {
    expect(parseBoardLink(url)).toEqual(board);
  });

  it.each(["https://acme.wd1.myworkdayjobs.com/jobs/1", "https://example.com/stripe"])("leaves %s alone", (url) => {
    expect(parseBoardLink(url)).toBeNull();
  });
});

describe("what's new", () => {
  const item = { company: "Acme", title: "Intern", locations: [], terms: [], added: 200 } as unknown as Internship;

  it("marks listings added since the last visit", () => {
    expect(isNew(item, 100)).toBe(true);
    expect(isNew(item, 300)).toBe(false);
    expect(isNew({ ...item, added: undefined }, 100)).toBe(false);
  });

  it("marks nothing on a first visit", () => expect(isNew(item, null)).toBe(false));

  it("filters to new listings", () => {
    expect(matches(item, { ...NO_FILTERS, fresh: true }, 100)).toBe(true);
    expect(matches(item, { ...NO_FILTERS, fresh: true }, 300)).toBe(false);
  });
});

describe("filtersFromUrl", () => {
  const items = [{ field: "Software" }] as Internship[];

  it("reads a search from the address", () => {
    expect(filtersFromUrl("?q=security&location=LA&field=Software", items)).toEqual({ query: "security", location: "LA", field: "Software" });
  });

  it("ignores a field no listing has, and an empty address", () => {
    expect(filtersFromUrl("?field=Nope", items)).toEqual({});
    expect(filtersFromUrl("", items)).toEqual({});
  });
});

describe("job level", () => {
  it.each([
    ["New Grad Software Engineer", "entry"],
    ["Software Engineer I", "entry"],
    ["Junior Data Analyst", "entry"],
    ["Early Career Program", "entry"],
    ["Software Engineer Intern", "internship"],
    ["Summer Student - Marketing", "internship"],
    ["Summer Analyst", "internship"],
    ["Student Worker, Library", "internship"],
    ["Student Health Coordinator", "mid"],
    ["Senior Software Engineer", "senior"],
    ["Staff Engineer", "senior"],
    ["Director of Sales", "senior"],
    ["Software Engineer III", "senior"],
    ["Junior Engineering Manager", "senior"],
    ["Software Engineer II", "mid"],
    ["Software Engineer", "mid"],
    ["Product Manager", "mid"],
    ["High School Internship", null],
  ])("%s is %s", (title, type) => {
    expect(jobType(title)).toBe(type);
  });

  it("doesn't call a plain title entry level", () => expect(isEntryLevel("Software Engineer")).toBe(false));
});

describe("terms", () => {
  it.each([
    ["Summer", "2026-11-07", "Summer 2027"],
    ["Fall", "2026-11-07", "Fall 2027"],
    ["Winter", "2026-11-07", "Winter 2026"],
    ["Spring", "2026-11-07", "Spring 2027"],
    ["Summer", "2027-02-01", "Summer 2027"],
    ["Summer 2028", "2026-11-07", "Summer 2028"],
  ])("%s in %s is %s", (term, date, expected) => {
    expect(withYear(term, new Date(date))).toBe(expected);
  });

  it("lists terms in date order, leaving out anything without a year", () => {
    const items = [{ terms: ["Fall 2027", "Summer 2027"] }, { terms: ["Spring 2027", "Summer", "Summer 2028"] }] as Internship[];
    expect(termsIn(items)).toEqual(["Spring 2027", "Summer 2027", "Fall 2027", "Summer 2028"]);
  });
});

describe("U.S. only", () => {
  it.each([
    "Austin, TX", "Los Angeles, CA", "San Diego, California", "New York, NY", "NYC", "SF", "Seattle", "Remote", "Remote in USA",
    "Remote - US", "United States", "New London, CT", "Washington, DC", "Cambridge, MA", "Birmingham, AL", "Hybrid - Boston, MA",
    "Wilmington, DE", "Flexible", "Ontario, CA", "CA - San Jose", "Canada / US",
    "London, KY", "Vancouver, WA", "Chicago, London", "New York or London",
    "Canton, OH", "1177 Avenue of the Americas New York NY",
  ])("keeps %s", (place) => expect(isUSPlace(place)).toBe(true));

  it.each([
    "Toronto, ON, Canada", "Toronto", "Vancouver, BC, CA", "Waterloo, ON", "London, UK", "London", "Bangalore, India", "Berlin, Germany",
    "Remote - Canada", "Remote, EMEA", "Singapore", "Multiple Locations", "Berlin, DE", "Munich, DE", "Hybrid", "London, ON",
    "CA-Ontario-Toronto", "CA Toronto", "CA ON Toronto Office", "CA.ON.Toronto.191 The West Mall", "CAD - Toronto, Ontario - Remote",
    "DE-Munich-MSO", "DEU - Remote - Munich", "Fins Only-DE-Munich-MSO", "DE-Berlin-Trion Building",
    "North America/MEX/Apodaca- Nidec Mexico Shared Services", "London, CA",
    "MEX - Santa Clara - ST01", "MEX-Remote", "MEX - KROMA Tultitlan DC", "CAN - Toronto",
  ])("drops %s", (place) => expect(isUSPlace(place)).toBe(false));

  it("keeps only a listing's U.S. places, and splits combined ones", () => {
    const item = fromSimplify({ ...simplifyRow, locations: ["Austin, TX; London, UK", "Toronto"] });
    expect(usOnly(item)?.locations).toEqual(["Austin, TX"]);
  });

  it("drops a listing with no U.S. places", () => {
    expect(usOnly(fromSimplify({ ...simplifyRow, locations: ["London, UK"] }))).toBeNull();
  });
});

describe("work authorization", () => {
  const job = (title: string, sponsorship: string) => fromSimplify({ ...simplifyRow, title, sponsorship });

  it("treats clearance and citizenship titles as citizens only", () => {
    expect(job("Security Clearance Required Intern", "Other").sponsorship).toBe("citizens");
    expect(job("Software Intern (U.S. Citizens Only)", "Other").sponsorship).toBe("citizens");
    expect(job("Software Intern", "Other").sponsorship).toBeNull();
  });

  it("permanent residents see all but citizens-only jobs", () => {
    const filters = { ...NO_FILTERS, permanent: true };
    expect(matches({ ...job("Intern", "Other"), sponsorship: "citizens" }, filters)).toBe(false);
    expect(matches(job("Intern", "Does Not Offer Sponsorship"), filters)).toBe(true);
    expect(matches(job("Intern", "Other"), filters)).toBe(true);
  });
});

describe("filters", () => {
  const job = (locations: string[], extra = {}) => ({ ...fromSimplify(simplifyRow), locations, ...extra });

  it("a place with Remote means jobs there or remote ones", () => {
    const filters = { ...NO_FILTERS, location: "LA", remote: true };
    expect(matches(job(["Los Angeles, CA"]), filters)).toBe(true);
    expect(matches(job(["Remote"]), filters)).toBe(true);
    expect(matches(job(["Seattle, WA"]), filters)).toBe(false);
  });

  it("Remote alone means remote jobs", () => {
    expect(matches(job(["Remote in USA"]), { ...NO_FILTERS, remote: true })).toBe(true);
    expect(matches(job(["Austin, TX"]), { ...NO_FILTERS, remote: true })).toBe(false);
  });

  it("shows internships and entry level unless asked for more", () => {
    expect(matches(job(["Austin, TX"], { type: "senior" }), NO_FILTERS)).toBe(false);
    expect(matches(job(["Austin, TX"], { type: "senior" }), { ...NO_FILTERS, level: "senior" })).toBe(true);
    expect(matches(job(["Austin, TX"], { type: "mid" }), { ...NO_FILTERS, level: "all" })).toBe(true);
    expect(matches(job(["Austin, TX"], { type: "entry" }), NO_FILTERS)).toBe(true);
  });

  it("filters by company size, leaving out companies of unknown size", () => {
    const filters = { ...NO_FILTERS, size: String(SIZES.findIndex((s) => s.label.startsWith("1,001"))) };
    expect(matches(job(["Austin, TX"], { band: 5 }), filters)).toBe(true);
    expect(matches(job(["Austin, TX"], { band: 6 }), filters)).toBe(false);
    expect(matches(job(["Austin, TX"]), filters)).toBe(false);
  });

  it("shows an exact size when it's known, otherwise the band", () => {
    expect(companySize(job([], { employees: 1500, band: 5 }))).toBe("1,500 employees");
    expect(companySize(job([], { band: 1 }))).toBe("about 11\u201350 employees");
    expect(companySize(job([]))).toBe("");
  });

  it("filters by level, treating older saved listings as internships", () => {
    expect(matches(job(["Austin, TX"], { type: "entry" }), { ...NO_FILTERS, level: "entry" })).toBe(true);
    expect(matches(job(["Austin, TX"], { type: "entry" }), { ...NO_FILTERS, level: "internship" })).toBe(false);
    expect(matches(job(["Austin, TX"], { type: undefined }), { ...NO_FILTERS, level: "internship" })).toBe(true);
  });

  it("filters by a term with its year", () => {
    expect(matches(job(["Austin, TX"], { terms: ["Summer 2027"] }), { ...NO_FILTERS, term: "Summer 2027" })).toBe(true);
    expect(matches(job(["Austin, TX"], { terms: ["Summer 2028"] }), { ...NO_FILTERS, term: "Summer 2027" })).toBe(false);
  });
});

describe("other job sites", () => {
  it("links to Handshake, LinkedIn and Simplify with the level", () => {
    const [handshake, linkedin, indeed, simplify] = searchElsewhere({ ...NO_FILTERS, query: "data", level: "entry" });
    expect(handshake.url).toContain("joinhandshake.com/stu/postings?query=data+entry+level");
    expect(Object.fromEntries(new URL(indeed.url).searchParams)).toEqual({ q: "data entry level", l: "United States" });
    expect(new URL(linkedin.url).searchParams.get("f_E")).toBe("2");
    expect(new URL(linkedin.url).searchParams.get("location")).toBe("United States");
    expect(new URL(simplify.url).searchParams.get("q")).toBe("data entry level");
  });
});

describe("new sources", () => {
  it("reads The Muse", () => {
    const job = fromMuse({ id: 1, name: "Marketing Intern", publication_date: "2026-11-03T18:37:34Z", locations: [{ name: "Flexible / Remote" }], categories: [{ name: "Marketing and PR" }], levels: [{ name: "Internship" }], refs: { landing_page: "https://www.themuse.com/jobs/x/y" }, company: { name: "Acme" } });
    expect(job).toMatchObject({ company: "Acme", type: "internship", locations: ["Remote"], url: "https://www.themuse.com/jobs/x/y", field: "Marketing & Comms" });
    expect(keep(job, NOV_2026)).toBe(true);
  });

  it("keeps a Muse internship with no 'intern' in its title", () => {
    const job = fromMuse({ id: 2, name: "Summer Analyst", publication_date: "2026-11-03T18:37:34Z", locations: [{ name: "Boston, MA" }], levels: [{ name: "Internship" }], refs: { landing_page: "https://www.themuse.com/jobs/x/z" }, company: { name: "Acme" } });
    expect(keep(job, NOV_2026)).toBe(true);
  });

  it("reads The Muse's other levels", () => {
    const job = (level: string) => fromMuse({ id: 4, name: "Analyst", locations: [], levels: [{ name: level }], company: { name: "Acme" } });
    expect(job("Mid Level").type).toBe("mid");
    expect(job("Senior Level").type).toBe("senior");
    expect(job("management").type).toBe("senior");
  });

  it("keeps mid and senior jobs", () => {
    const job = { ...fromSimplify(simplifyRow), title: "Senior Engineer", type: "senior", posted: NOV_2026.getTime() / 1000 };
    expect(keep(job, NOV_2026)).toBe(true);
  });

  it("marks The Muse's entry-level jobs", () => {
    expect(fromMuse({ id: 3, name: "Registered Nurse", locations: [], categories: [{ name: "Healthcare" }], levels: [{ name: "Entry Level" }], company: { name: "Acme" } })).toMatchObject({ type: "entry", field: "Healthcare" });
  });

  it("trusts the internship lists, even when a title doesn't say intern", () => {
    const job = { ...fromSimplify({ ...simplifyRow, title: "Software Engineer (Summer 2027)" }), posted: NOV_2026.getTime() / 1000 };
    expect(job.type).toBe("internship");
    expect(keep(job, NOV_2026)).toBe(true);
    expect(fromVansh({ ...simplifyRow, title: "Software Engineer", season: "Summer" }).type).toBe("internship");
  });

  it("needs a job board's internship to say so", () => {
    const job = { ...fromGreenhouse({ id: 1, title: "Software Engineer", absolute_url: "https://boards.greenhouse.io/a/jobs/1", location: { name: "Austin, TX" } }, "A"), type: "internship" };
    expect(keep(job, NOV_2026)).toBe(false);
  });

  it("reads the new grad list as entry level", () => {
    expect(fromNewGrad({ ...simplifyRow, title: "Software Engineer" }).type).toBe("entry");
  });

  it("reads SmartRecruiters", () => {
    const job = fromSmartRecruiters({ id: "9", name: "Data Intern", company: { name: "Visa" }, location: { city: "Austin", region: "TX" }, releasedDate: "2026-11-01T00:00:00Z", experienceLevel: { id: "internship" } }, "Visa");
    expect(job).toMatchObject({ company: "Visa", locations: ["Austin, TX"], url: "https://jobs.smartrecruiters.com/Visa/9", type: "internship" });
  });

  it("reads Workday", () => {
    const site = { host: "acme.wd5.myworkdayjobs.com", site: "Careers", company: "Acme" };
    const job = fromWorkday({ title: "Software Intern", externalPath: "/job/Austin-TX/Software-Intern_R1", locationsText: "US, TX, Austin", postedOn: "Posted 3 Days Ago" }, site, NOV_2026);
    expect(job.url).toBe("https://acme.wd5.myworkdayjobs.com/Careers/job/Austin-TX/Software-Intern_R1");
    expect(job.locations).toEqual(["Austin, TX"]);
    expect(job.posted).toBe(NOV_2026.getTime() / 1000 - 3 * 86400);
  });

  it("uses the link's place when Workday only gives a count", () => {
    const site = { host: "a.wd1.myworkdayjobs.com", site: "C", company: "A" };
    expect(fromWorkday({ title: "Intern", externalPath: "/job/Austin-TX/I_1", locationsText: "2 Locations" }, site).locations).toEqual(["Austin TX"]);
  });

  it("finds career sites in links", () => {
    expect(parseCareerSite("https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/x")).toMatchObject({ kind: "workday", token: "acme", site: "Careers", host: "acme.wd5.myworkdayjobs.com" });
    expect(parseCareerSite("https://jobs.smartrecruiters.com/Visa/123")).toMatchObject({ kind: "smartrecruiters", token: "Visa" });
    expect(parseCareerSite("https://example.com/jobs")).toBeNull();
  });

  it("treats a page with and without a language as the same page", () => {
    const a = fromSimplify({ ...simplifyRow, url: "https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/1", locations: ["Austin, TX"] });
    const b = fromSimplify({ ...simplifyRow, url: "https://acme.wd5.myworkdayjobs.com/Careers/job/1", locations: ["Dallas, TX"] });
    expect(dedupe([a, b])).toHaveLength(1);
  });
});

describe("levels kept in their own files", () => {
  it.each([["", []], ["entry", []], ["mid", ["mid"]], ["senior", ["senior"]], ["all", ["mid", "senior"]]] as const)("%s needs %j", (level, files) => {
    expect(extraLevels(level)).toEqual(files);
  });

  it("asks other sites for the right level", () => {
    const linkedin = (level: "" | "mid" | "senior" | "all") => new URL(searchElsewhere({ ...NO_FILTERS, level })[1].url).searchParams;
    expect(linkedin("mid").get("f_E")).toBe("3,4");
    expect(linkedin("senior").get("f_E")).toBe("4,5");
    expect(linkedin("all").get("f_E")).toBeNull();
    expect(linkedin("all").get("keywords")).toBe("jobs");
  });
});

describe("shortId", () => {
  it("is short, steady and different for different listings", () => {
    const id = shortId("Workday:acme.wd5.myworkdayjobs.com/job/Austin-TX/Software-Intern_R1");
    expect(id).toBe(shortId("Workday:acme.wd5.myworkdayjobs.com/job/Austin-TX/Software-Intern_R1"));
    expect(id.length).toBeLessThanOrEqual(14);
    const ids = new Set(Array.from({ length: 100000 }, (_, i) => shortId(`Greenhouse:${i}`)));
    expect(ids.size).toBe(100000);
  });
});

describe("company size", () => {
  it("an exact count picks its band", () => {
    expect(BANDS[sizeBand(8000, "1-10", 500)!].id).toBe("5K-10K");
    expect(BANDS[sizeBand(10, undefined, 0)!].id).toBe("1-10");
    expect(BANDS[sizeBand(50000, undefined, 0)!].id).toBe("10K+");
  });

  it("uses the dataset's band when nothing better is known", () => {
    expect(BANDS[sizeBand(undefined, "51-200", 12)!].id).toBe("51-200");
  });

  it("drops a band too small for the company's openings, since that's another company with the same name", () => {
    expect(sizeBand(undefined, "1-10", 40)).toBeNull();
    expect(sizeBand(undefined, "11-50", 26)).toBeNull();
    expect(sizeBand(undefined, "11-50", 25)).toBe(1);
    expect(sizeBand(undefined, "10K+", 5000)).toBe(7);
  });

  it("knows nothing without a count or a band", () => {
    expect(sizeBand(undefined, null, 3)).toBeNull();
    expect(sizeBand(undefined, "nonsense", 3)).toBeNull();
  });

  it("matches the filter's labels one to one", () => {
    expect(BANDS).toHaveLength(SIZES.length);
  });

  it("reads quoted CSV fields", () => {
    expect(csvFields('company/acme,"Acme, Inc.",acme.com,"He said ""hi""",11-50')).toEqual(["company/acme", "Acme, Inc.", "acme.com", 'He said "hi"', "11-50"]);
  });

  it("prefers the largest U.S. company of that name, then the largest anywhere", () => {
    const score = (size: string, country: string) => matchScore({ size, country_code: country });
    expect(score("10K+", "us")).toBeGreaterThan(score("1-10", "us"));
    expect(score("1-10", "US")).toBeGreaterThan(score("10K+", "gb"));
    expect(score("nonsense", "us")).toBe(-1);
  });

  it("treats Corning and Corning Incorporated as one company", () => {
    expect(simpleCompany("Corning Incorporated")).toBe(simpleCompany("Corning"));
    expect(simpleCompany("Acme Limited")).toBe(simpleCompany("Acme"));
  });
});
