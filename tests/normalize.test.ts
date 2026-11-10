import { describe, expect, it } from "vitest";
import { companySize, extraLevels, filtersFromUrl, fitsMajor, fitsGraduation, graduationOptions, graduationYears, inPlace, isNew, isVerified, matches, NO_FILTERS, readTracked, searchElsewhere, SIZES, termsIn, type Internship, type Level } from "@/lib/internships";
import { indexPlaces, locate, milesBetween, withinMiles, type PlaceTable } from "@/lib/places";
import { dedupe, fieldOf, fromGreenhouse, fromMuse, fromNewGrad, fromSimplify, fromSmartRecruiters, fromVansh, fromWorkday, rowsFromTable, isEntryLevel, isInternship, shortId, isUSPlace, jobType, keep, parseBoardLink, parseCareerSite, termHasPassed, termsIn as termsInTitle, usOnly, withoutEndedTerms, withYear, BANDS, sizeBand } from "@/lib/normalize.mjs";
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
  it("drops a saved copy too damaged to show", () => {
    const url = "https://example.com/x";
    expect(readTracked({ [url]: { status: "saved", item: { url } } }, [])).toEqual({});
    expect(readTracked({ [url]: { status: "saved", item: { url, title: "A", company: "B", locations: "Austin", terms: [] } } }, [])).toEqual({});
  });

  const item = { id: "Simplify:a", url: "https://acme.com/1", title: "Intern", company: "Acme", locations: [], terms: [] } as unknown as Internship;

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
  it("reads a search from the address", () => {
    expect(filtersFromUrl("?q=security&location=LA&field=Software")).toEqual({ query: "security", location: "LA", major: ["Computer Science"] });
  });

  it("reads several fields, and which levels a link wants", () => {
    expect(filtersFromUrl("?field=Software&field=Hardware&field=Nope")).toEqual({ major: ["Computer Science", "Electrical Engineering"] });
    expect(filtersFromUrl("?major=EECS&major=Nope")).toEqual({ major: ["EECS"] });
    expect(filtersFromUrl("?kind=jobs")).toEqual({ level: ["entry", "mid", "senior"] });
    expect(filtersFromUrl("?level=mid")).toEqual({ level: ["mid"] });
    expect(filtersFromUrl("?level=nonsense")).toEqual({});
  });

  it("opens links that ask for every level", () => {
    expect(filtersFromUrl("?level=all")).toEqual({ level: [] });
    expect(filtersFromUrl("?level=internship")).toEqual({ level: ["internship"] });
  });

  it("ignores a field no listing has, and an empty address", () => {
    expect(filtersFromUrl("?field=Nope")).toEqual({});
    expect(filtersFromUrl("")).toEqual({});
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

  it("shows internships unless other levels are picked", () => {
    expect(matches(job(["Austin, TX"]), NO_FILTERS)).toBe(true);
    expect(matches(job(["Austin, TX"], { type: "entry" }), NO_FILTERS)).toBe(false);
    expect(matches(job(["Austin, TX"], { type: "mid" }), { ...NO_FILTERS, level: ["mid", "senior"] })).toBe(true);
    expect(matches(job(["Austin, TX"]), { ...NO_FILTERS, level: ["mid", "senior"] })).toBe(false);
    expect(matches(job(["Austin, TX"], { type: "senior" }), { ...NO_FILTERS, level: [] })).toBe(true);
  });

  it("lists everything marked on Saved and Applied, whatever its tab", () => {
    expect(matches(job(["Austin, TX"], { type: "senior" }), NO_FILTERS, null, true)).toBe(true);
  });

  it("matches any of the majors picked", () => {
    const software = job(["Austin, TX"], { field: "Software" });
    expect(matches(software, { ...NO_FILTERS, major: ["Physics", "Computer Science"] })).toBe(true);
    expect(matches(software, { ...NO_FILTERS, major: ["Physics"] })).toBe(false);
    expect(matches(software, NO_FILTERS)).toBe(true);
  });

  it.each([
    ["Backend Intern", "Software", "EECS", true],
    ["Backend Intern", "Software", "Computer Science", true],
    ["Electrical Engineer Intern", "Hardware", "EECS", true],
    ["Mechanical Engineer Intern", "Hardware", "EECS", false],
    ["Mechanical Engineer Intern", "Hardware", "Mechanical Engineering", true],
    ["Staff Accountant", "Business & Finance", "Accounting", true],
    ["Account Manager", "Business & Finance", "Accounting", false],
    ["Account Manager", "Business & Finance", "Business", true],
    ["Registered Nurse", "Healthcare", "Nursing", true],
    ["Biophysics Researcher", "Other", "Physics", true],
    ["Backend Intern", "Software", "Not a major", false],
    ["Machine Learning Intern", "AI & Data", "Artificial Intelligence (AI)", true],
    ["AI Engineer", "AI & Data", "Artificial Intelligence (AI)", true],
    ["Data Analyst Intern", "AI & Data", "Artificial Intelligence (AI)", false],
    ["Retail Associate", "Other", "Artificial Intelligence (AI)", false],
  ])("%s (%s) for %s: %s", (title, field, major, fits) => {
    expect(fitsMajor({ title, field } as unknown as Internship, major)).toBe(fits);
  });

  it("filters undergrad and grad listings separately", () => {
    const open = job(["Austin, TX"], { gradOnly: false });
    const grad = job(["Austin, TX"], { gradOnly: true });
    expect(matches(open, { ...NO_FILTERS, undergrad: true })).toBe(true);
    expect(matches(grad, { ...NO_FILTERS, undergrad: true })).toBe(false);
    expect(matches(grad, { ...NO_FILTERS, forGrads: true })).toBe(true);
    expect(matches(open, { ...NO_FILTERS, forGrads: true })).toBe(false);
    expect(matches(open, { ...NO_FILTERS, undergrad: true, forGrads: true })).toBe(true);
    expect(matches(grad, { ...NO_FILTERS, undergrad: true, forGrads: true })).toBe(true);
  });

  it("filters by date posted, counting from the given day", () => {
    const now = 100 * 86400;
    const posted = (daysAgo: number | null) => job(["Austin, TX"], { posted: daysAgo === null ? null : now - daysAgo * 86400 });
    const week = { ...NO_FILTERS, posted: "7" };
    expect(matches(posted(6), week, null, false, undefined, now)).toBe(true);
    expect(matches(posted(7), week, null, false, undefined, now)).toBe(true);
    expect(matches(posted(8), week, null, false, undefined, now)).toBe(false);
    expect(matches(posted(null), week, null, false, undefined, now)).toBe(false);
    expect(matches(posted(null), NO_FILTERS, null, false, undefined, now)).toBe(true);
  });


  it("filters by company size, leaving out companies of unknown size", () => {
    const filters = { ...NO_FILTERS, size: [String(SIZES.findIndex((s) => s.label.startsWith("1,001")))] };
    expect(matches(job(["Austin, TX"], { band: 5 }), filters)).toBe(true);
    expect(matches(job(["Austin, TX"], { band: 6 }), filters)).toBe(false);
    expect(matches(job(["Austin, TX"]), filters)).toBe(false);
  });

  it("shows an exact size when it's known, otherwise the band", () => {
    expect(companySize(job([], { employees: 1500, band: 5 }))).toBe("1,500 employees");
    expect(companySize(job([], { band: 1 }))).toBe("about 11\u201350 employees");
    expect(companySize(job([], { band: 7 }))).toBe("10,000+ employees");
    expect(companySize(job([]))).toBe("");
  });

  it("filters by level, treating older saved listings as internships", () => {
    expect(matches(job(["Austin, TX"], { type: "entry" }), { ...NO_FILTERS, level: ["entry"] })).toBe(true);
    expect(matches(job(["Austin, TX"], { type: "mid" }), { ...NO_FILTERS, level: ["entry"] })).toBe(false);
    expect(matches(job(["Austin, TX"], { type: undefined }), NO_FILTERS)).toBe(true);
  });

  it("filters by a term with its year", () => {
    expect(matches(job(["Austin, TX"], { terms: ["Summer 2027"] }), { ...NO_FILTERS, term: ["Summer 2027"] })).toBe(true);
    expect(matches(job(["Austin, TX"], { terms: ["Summer 2028"] }), { ...NO_FILTERS, term: ["Summer 2027"] })).toBe(false);
  });
});

describe("other job sites", () => {
  it("links to Handshake, LinkedIn and Simplify with the level", () => {
    const [handshake, linkedin, indeed, simplify] = searchElsewhere({ ...NO_FILTERS, query: "data", level: ["entry"] });
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
  it.each<[Level[], string[]]>([
    [[], ["mid", "senior"]], [["internship"], []], [["entry"], []], [["mid"], ["mid"]], [["senior"], ["senior"]], [["internship", "senior"], ["senior"]], [["mid", "senior"], ["mid", "senior"]],
  ])("levels %j need %j", (levels, files) => {
    expect(extraLevels(levels)).toEqual(files);
  });

  it("asks other sites for the right level", () => {
    const linkedin = (level: Level[]) => new URL(searchElsewhere({ ...NO_FILTERS, level })[1].url).searchParams;
    expect(linkedin(["mid"]).get("f_E")).toBe("3,4");
    expect(linkedin(["senior"]).get("f_E")).toBe("4,5");
    expect(linkedin(["internship"]).get("f_E")).toBe("1");
    expect(linkedin([]).get("f_E")).toBeNull();
    expect(linkedin([]).get("keywords")).toBe("jobs");
    expect(linkedin(["internship", "entry"]).get("f_E")).toBe("1,2");
  });

  it("passes a distance along, up to the 100 miles those sites allow", () => {
    const [, linkedin, indeed] = searchElsewhere({ ...NO_FILTERS, location: "Austin, TX", miles: "200" });
    expect(new URL(linkedin.url).searchParams.get("distance")).toBe("100");
    expect(new URL(indeed.url).searchParams.get("radius")).toBe("100");
    const [, none] = searchElsewhere({ ...NO_FILTERS, miles: "50" });
    expect(new URL(none.url).searchParams.get("distance")).toBeNull();
  });

  it("passes the date posted along, up to the 14 days Indeed allows", () => {
    const [, linkedin, indeed] = searchElsewhere({ ...NO_FILTERS, posted: "30" });
    expect(new URL(linkedin.url).searchParams.get("f_TPR")).toBe("r2592000");
    expect(new URL(indeed.url).searchParams.get("fromage")).toBe("14");
    expect(new URL(searchElsewhere(NO_FILTERS)[1].url).searchParams.get("f_TPR")).toBeNull();
  });

  it("links to Built In with the search", () => {
    const builtIn = (filters: object) => searchElsewhere({ ...NO_FILTERS, ...filters }).find((site) => site.name === "Built In")!.url;
    expect(builtIn({ query: "data analyst" })).toBe("https://builtin.com/jobs?search=data+analyst+internship");
    expect(builtIn({ level: [] })).toBe("https://builtin.com/jobs");
  });

  it("names a field on other sites only when one is picked", () => {
    const words = (major: string[]) => new URL(searchElsewhere({ ...NO_FILTERS, major })[1].url).searchParams.get("keywords");
    expect(words(["EECS"])).toBe("EECS internship");
    expect(words(["EECS", "Physics"])).toBe("internship");
  });
});

describe("one place sent in two pieces", () => {
  it("joins a state back onto its city", () => {
    expect(usOnly({ locations: ["Kansas City", "MO"] } as never)?.locations).toEqual(["Kansas City, MO"]);
    expect(usOnly({ locations: ["Austin, TX", "Remote"] } as never)?.locations).toEqual(["Austin, TX", "Remote"]);
    expect(usOnly({ locations: ["Austin, TX", "CA"] } as never)?.locations).toEqual(["Austin, TX", "CA"]);
  });
});

describe("verified companies", () => {
  const known = { band: 3, source: "Simplify", company: "Acme" };
  const listing = (extra: object) => ({ title: "Intern", url: "https://example.com/1", ...known, ...extra }) as unknown as Internship;

  it("needs a company on record, and the employer's own posting", () => {
    expect(isVerified(listing({ url: "https://boards.greenhouse.io/acme/jobs/1" }))).toBe(true);
    expect(isVerified(listing({ url: "https://acme.wd5.myworkdayjobs.com/job/1" }))).toBe(true);
    expect(isVerified(listing({ url: "https://careers.acme.com/1" }))).toBe(true);
    expect(isVerified(listing({ source: "Greenhouse", url: "https://stripe.com/jobs/1" }))).toBe(true);
    expect(isVerified(listing({}))).toBe(false);
    expect(isVerified(listing({ url: "not a link" }))).toBe(false);
    expect(isVerified(listing({ band: undefined, url: "https://boards.greenhouse.io/acme/jobs/1" }))).toBe(false);
  });

  it("doesn't match a company by a very short name", () => {
    expect(isVerified(listing({ company: "GE", url: "https://pages.example.com/1" }))).toBe(false);
  });

  it("can be the only companies shown", () => {
    expect(matches(listing({ locations: [], terms: [], url: "https://jobs.lever.co/acme/1" }), { ...NO_FILTERS, verified: true })).toBe(true);
    expect(matches(listing({ locations: [], terms: [] }), { ...NO_FILTERS, verified: true })).toBe(false);
  });
});

describe("graduation dates", () => {
  it.each([
    ["Analyst (Class of 2028)", [2028]],
    ["2027 University Graduate - Data Engineer", [2027]],
    ["Engineer (2026 New College Graduate)", [2026]],
    ["Technical Sales (May 2027 Grad)", [2027]],
    ["(2027 PhD/ABD graduates) Senior Associate", [2027]],
    ["New Grad January 2027 - Advisor", [2027]],
    ["Summer 2027 Graduate Internship", []],
    ["Tax Graduate Intern, Spring 2027", []],
    ["Intern (Undergraduate Summer 2027)", []],
    ["Software Engineer", []],
  ])("reads %s", (title, years) => expect(graduationYears(title)).toEqual(years));

  const intern = (terms: string[], title = "Intern") => ({ title, terms, type: "internship" }) as unknown as Internship;

  it("drops an internship that only starts after graduating", () => {
    expect(fitsGraduation(intern(["Summer 2027"]), "2027-05")).toBe(false);
    expect(fitsGraduation(intern(["Spring 2027"]), "2027-05")).toBe(true);
    expect(fitsGraduation(intern(["Summer 2027"]), "2027-12")).toBe(true);
    expect(fitsGraduation(intern(["Winter 2027"]), "2027-12")).toBe(false);
    expect(fitsGraduation(intern(["Summer 2027", "Spring 2027"]), "2027-05")).toBe(true);
  });

  it("keeps what doesn't say", () => {
    expect(fitsGraduation(intern([]), "2027-05")).toBe(true);
    expect(fitsGraduation(intern(["Summer"]), "2027-05")).toBe(true);
    expect(fitsGraduation({ title: "Software Engineer", terms: ["Summer 2028"], type: "entry" } as unknown as Internship, "2027-05")).toBe(true);
  });

  it("goes by the class named in a title first", () => {
    expect(fitsGraduation(intern(["Summer 2027"], "Analyst (Class of 2028)"), "2028-05")).toBe(true);
    expect(fitsGraduation(intern([], "Analyst (Class of 2028)"), "2027-05")).toBe(false);
  });

  it("offers the next eight dates", () => {
    const options = graduationOptions(Date.UTC(2026, 10, 9) / 1000);
    expect(options).toHaveLength(8);
    expect(options[0]).toEqual({ value: "2026-12", label: "December 2026" });
    expect(options[1]).toEqual({ value: "2027-05", label: "May 2027" });
    expect(options[7]).toEqual({ value: "2030-05", label: "May 2030" });
    expect(graduationOptions(Date.UTC(2027, 4, 20) / 1000)[0].value).toBe("2027-05");
    expect(graduationOptions(Date.UTC(2027, 5, 1) / 1000)[0].value).toBe("2027-12");
  });

  it("is a filter", () => {
    expect(matches({ ...intern(["Summer 2027"]), locations: [] }, { ...NO_FILTERS, grad: "2027-05" })).toBe(false);
  });
});

describe("distance", () => {
  const table: PlaceTable = {
    CA: [["Los Angeles", 34.05, -118.24, 3900000], ["San Francisco", 37.77, -122.42, 870000], ["San Diego", 32.72, -117.16, 1400000], ["Santa Monica", 34.02, -118.49, 90000]],
    NY: [["New York", 40.71, -74.01, 8800000]],
    DC: [["Washington", 38.9, -77.04, 700000]],
    MO: [["Kansas City", 39.1, -94.58, 500000], ["Saint Louis", 38.63, -90.2, 300000]],
    KS: [["Kansas City", 39.11, -94.63, 150000]],
    IL: [["Rosemont", 42, -87.88, 4000]],
    FL: [["Deerfield Beach", 26.32, -80.1, 80000]],
    TX: [["Frisco", 33.15, -96.82, 200000]],
    LA: [["Baton Rouge", 30.44, -91.19, 220000]],
  };
  const places = indexPlaces(table);

  it.each([
    ["LA", [34.05, -118.24]], ["SF", [37.77, -122.42]], ["NYC", [40.71, -74.01]], ["New York, NEW YORK", [40.71, -74.01]],
    ["New York, United States", [40.71, -74.01]], ["New York City Office", [40.71, -74.01]], ["Hub - New York", [40.71, -74.01]],
    ["Washington, D.C.", [38.9, -77.04]], ["St. Louis, MO", [38.63, -90.2]], ["Kansas City MO", [39.1, -94.58]], ["Kansas City, KS", [39.11, -94.63]],
    ["Kansas City Metro Area", [39.1, -94.58]], ["IL-Rosemont", [42, -87.88]], ["US-IL-Rosemont", [42, -87.88]], ["Florida - Deerfield Beach", [26.32, -80.1]],
    ["2595 Dallas Pkwy., Suite 101, Frisco, Texas 75034", [33.15, -96.82]], ["Baton Rouge, LA", [30.44, -91.19]], ["San Diego, CA (On-site)", [32.72, -117.16]],
  ])("finds %s", (text, at) => expect(locate(places, text)).toEqual(at));

  it.each(["CA", "California", "Remote", "United States", "Remote in USA", "Nowhere, TX", ""])("doesn't place %j", (text) => expect(locate(places, text)).toBeNull());

  it("measures miles", () => expect(Math.round(milesBetween([34.05, -118.24], [32.72, -117.16]))).toBe(111));

  it("reaches nearby cities, with the listing's own place still matched by name", () => {
    const near = withinMiles(places, [34.05, -118.24], 50);
    expect(near("Santa Monica, CA")).toBe(true);
    expect(near("San Diego, CA")).toBe(false);
    expect(near("Remote")).toBe(false);
    const job = { company: "A", title: "B", locations: ["Santa Monica, CA"], terms: [] } as unknown as Internship;
    expect(matches(job, { ...NO_FILTERS, location: "Pasadena" })).toBe(false);
    expect(matches(job, { ...NO_FILTERS, location: "Pasadena", miles: "50" }, null, false, near)).toBe(true);
  });
});

describe("rowsFromTable", () => {
  it("pairs each link with the row's company", () => {
    const text = [
      "| Company | Position | Apply |",
      "|---|---|---|",
      '| <a href="https://www.figma.com"><strong>Figma</strong></a> | Intern | <a href="https://boards.greenhouse.io/figma/jobs/1?gh_jid=1"><img src="x" alt="Apply"/></a> |',
      "| **[Acme](https://acme.com)** | Intern | [Apply](https://jobs.lever.co/acme/1) |",
      "not a table https://jobs.lever.co/other",
    ].join("\n");
    const rows = rowsFromTable(text);
    expect(rows.filter((r: { url: string }) => /greenhouse|lever/.test(r.url))).toEqual([
      { url: "https://boards.greenhouse.io/figma/jobs/1?gh_jid=1", company_name: "Figma" },
      { url: "https://jobs.lever.co/acme/1", company_name: "Acme" },
    ]);
  });

  it("skips rows with no company", () => {
    expect(rowsFromTable("|  | Intern | https://jobs.lever.co/a |\n| \u21b3 | Intern | https://jobs.lever.co/b |")).toEqual([]);
  });

  it("finds the boards the rows link to", () => {
    const [row] = rowsFromTable("| Figma | https://boards.greenhouse.io/figma/jobs/1 |");
    expect(parseBoardLink(row.url)).toMatchObject({ kind: "greenhouse", token: "figma" });
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
