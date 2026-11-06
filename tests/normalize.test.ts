import { describe, expect, it } from "vitest";
import { inPlace, matches, NO_FILTERS, readTracked, type Internship } from "@/lib/internships";
import { dedupe, fieldOf, fromGreenhouse, fromSimplify, fromVansh, isInternship, keep, termHasPassed, termsIn } from "@/lib/normalize.mjs";

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
    expect(termsIn("Intern (Summer 2027 or Autumn 2027)")).toEqual(["Summer 2027", "Fall 2027"]);
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

  it("upgrades entries saved before listings were copied", () => {
    expect(readTracked({ "Simplify:a": "saved", "Simplify:gone": "applied" }, [item])).toEqual({ [item.url]: { status: "saved", item } });
  });

  it("drops entries with the wrong shape", () => {
    expect(readTracked({ a: { status: "nope", item }, b: { status: "saved" } }, [item])).toEqual({});
  });
});
