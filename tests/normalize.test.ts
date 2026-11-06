import { describe, expect, it } from "vitest";
import { dedupe, fieldOf, fromGreenhouse, fromSimplify, isInternship, keep, termHasPassed, termsIn } from "@/lib/normalize.mjs";

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
  const item = fromSimplify(simplifyRow);

  it("keeps an open internship", () => expect(keep(item, NOV_2026)).toBe(true));
  it("keeps one with no term listed", () => expect(keep({ ...item, terms: [] }, NOV_2026)).toBe(true));
  it("drops one whose terms have all ended", () => expect(keep({ ...item, terms: ["Summer 2026"] }, NOV_2026)).toBe(false));
  it("keeps one with any term still ahead", () => expect(keep({ ...item, terms: ["Summer 2026", "Summer 2027"] }, NOV_2026)).toBe(true));
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

  it("merges the same role from two sources, keeping the first link", () => {
    const [only, ...rest] = dedupe([direct, fromSimplify(simplifyRow)]);
    expect(rest).toEqual([]);
    expect(only.url).toBe(direct.url);
    expect(only.locations).toEqual(["Remote", "Austin, TX"]);
    expect(only.terms).toEqual(["Summer 2027"]);
    expect(only.posted).toBe(100);
    expect(only.sponsorship).toBe("offers");
  });

  it("drops a bare season when a dated one says the same", () => {
    const [only] = dedupe([fromSimplify(simplifyRow), { ...fromSimplify(simplifyRow), terms: ["Summer", "Winter"] }]);
    expect(only.terms).toEqual(["Summer 2027", "Winter"]);
  });

  it("keeps different roles apart", () => {
    expect(dedupe([direct, fromSimplify({ ...simplifyRow, title: "Hardware Intern" })])).toHaveLength(2);
  });
});
