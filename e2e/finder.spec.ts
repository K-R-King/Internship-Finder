import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const listing = (id: string, company: string, title: string, extra = {}) => ({
  id, company, title, url: `https://example.com/${id}`, locations: ["Austin, TX"], terms: ["Summer 2027"],
  field: "Software", gradOnly: false, sponsorship: null, posted: 1000, source: "Simplify", ...extra,
});

const DATA = {
  updated: 90000,
  sources: [{ name: "SimplifyJobs list", count: 4, ok: true }],
  items: [
    listing("a", "Acme", "Software Intern"),
    listing("b", "Globex", "Accounting Intern", { field: "Business & Finance", terms: ["Fall 2027"], locations: ["Remote"] }),
    listing("c", "Initech", "PhD Research Intern", { gradOnly: true, field: "AI & Data" }),
    listing("d", "Umbrella", "Hardware Intern", { sponsorship: "citizens", field: "Hardware", locations: ["Boston, MA"] }),
    listing("e", "Hooli", "New Grad Engineer", { type: "entry", locations: ["Los Angeles, CA"], terms: [], employees: 1500 }),
    ...Array.from({ length: 60 }, (_, i) => listing(`x${i}`, "Bulk Co", `Filler Intern ${i}`)),
  ],
};

const MID = { items: [listing("m1", "Initrode", "Software Engineer", { type: "mid", terms: [] })] };
const SENIOR = { items: [listing("s1", "Vandelay", "Staff Engineer", { type: "senior", terms: [] })] };

async function open(page: Page) {
  await page.route("**/internships.json", (route) => route.fulfill({ json: DATA }));
  await page.route("**/jobs-mid.json", (route) => route.fulfill({ json: MID }));
  await page.route("**/jobs-senior.json", (route) => route.fulfill({ json: SENIOR }));
  await page.goto("/");
  await expect(page.getByText("65 jobs, newest first")).toBeVisible();
}

const rows = (page: Page) => page.locator("[data-listing]");

test("shows listings a page at a time", async ({ page }) => {
  await open(page);
  await expect(rows(page)).toHaveCount(50);
  await page.getByRole("button", { name: /Show more/ }).click();
  await expect(rows(page)).toHaveCount(65);
});

test("search and filters narrow the list", async ({ page }) => {
  await open(page);
  await page.getByLabel("Search by company or role").fill("globex");
  await expect(page.getByText("1 job, newest first")).toBeVisible();
  await page.getByLabel("Search by company or role").fill("");

  await page.getByLabel("Field", { exact: true }).selectOption("Hardware");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("May sponsor visas").check();
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.getByLabel("Term", { exact: true }).selectOption("Fall 2027");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Term", { exact: true }).selectOption("");
  await page.getByLabel("Location", { exact: true }).fill("boston");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Location", { exact: true }).fill("");
  await page.getByLabel("Remote", { exact: true }).check();
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Remote", { exact: true }).uncheck();

  await page.getByLabel("Open to undergrads").check();
  await expect(page.getByText("64 jobs, newest first")).toBeVisible();
});

test("saved and applied listings survive a refresh", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Save Software Intern at Acme" }).click();
  await page.getByRole("button", { name: "Applied Accounting Intern at Globex" }).click();
  await page.reload();
  await expect(page.getByText("65 jobs, newest first")).toBeVisible();

  await page.getByRole("button", { name: "Saved (1)" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Acme");
  await page.getByRole("button", { name: "Applied (1)" }).click();
  await expect(rows(page)).toContainText("Globex");
});

test("an applied listing stays after it closes", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Applied Accounting Intern at Globex" }).click();

  await page.unroute("**/internships.json");
  await page.route("**/internships.json", (route) => route.fulfill({ json: { ...DATA, items: DATA.items.filter((i) => i.id !== "b") } }));
  await page.reload();
  await page.getByRole("button", { name: "Applied (1)" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("No longer listed");
});

test("an empty Saved list says so", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Saved (0)" }).click();
  await expect(page.getByText("Nothing saved yet")).toBeVisible();
  await page.getByRole("button", { name: "See all jobs" }).click();
  await expect(page.getByText("65 jobs, newest first")).toBeVisible();
});

test("damaged saved data doesn't break the page", async ({ page }) => {
  await open(page);
  await page.evaluate(() => localStorage.setItem("internship-finder:tracked", "null"));
  await page.reload();
  await expect(page.getByText("65 jobs, newest first")).toBeVisible();
});

test("two letters search for a state", async ({ page }) => {
  await open(page);
  await page.getByLabel("Location", { exact: true }).fill("TX");
  await expect(page.getByText("62 jobs, newest first")).toBeVisible();
  await page.getByLabel("Location", { exact: true }).fill("ON");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
});

test("marks listings added since the last visit, and a refresh keeps them marked", async ({ page }) => {
  await page.route("**/internships.json", (route) => route.fulfill({
    json: { ...DATA, items: DATA.items.map((item) => ({ ...item, added: item.id === "a" ? 2000 : 100 })) },
  }));
  await page.goto("/");
  await expect(page.getByText("65 jobs, newest first")).toBeVisible();
  await expect(page.getByText(/New since last visit/)).toHaveCount(0);  // a first visit marks nothing

  await page.evaluate(() => {
    localStorage.setItem("internship-finder:last-visit", "1500");
    sessionStorage.clear();
  });
  await page.reload();
  await page.getByLabel("New since last visit (1)").check();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Acme");
  await expect(rows(page).getByText("New", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("New since last visit (1)")).toBeVisible();
});

test("a search in the address opens that search", async ({ page }) => {
  await page.route("**/internships.json", (route) => route.fulfill({ json: DATA }));
  await page.goto("/?q=accounting&field=Business%20%26%20Finance");
  await expect(page.getByText("1 job, newest first")).toBeVisible();
  await expect(page.getByLabel("Search by company or role")).toHaveValue("accounting");
  await expect(page.getByLabel("Field", { exact: true })).toHaveValue("Business & Finance");
});

test("changing a filter says results are updating, and Search runs it right away", async ({ page }) => {
  await open(page);
  await page.getByLabel("Search by company or role").fill("globex");
  await expect(page.getByText("Updating results\u2026")).toBeVisible();
  await expect(page.getByText("1 job, newest first")).toBeVisible();

  await page.getByLabel("Search by company or role").fill("acme");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Updating results\u2026")).toBeVisible();
  await expect(rows(page)).toContainText("Acme");

  await page.getByLabel("Search by company or role").fill("initech");
  await page.getByLabel("Search by company or role").press("Enter");
  await expect(rows(page)).toContainText("Initech");
});

test("filters by level and shows it on each job", async ({ page }) => {
  await open(page);
  await page.getByLabel("Level", { exact: true }).selectOption("entry");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Entry level");
  await page.getByLabel("Level", { exact: true }).selectOption("internship");
  await expect(rows(page).first()).toContainText("Internship");
});

test("LA with Remote finds jobs in LA and remote ones", async ({ page }) => {
  await open(page);
  await page.getByLabel("Location", { exact: true }).fill("LA");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Remote", { exact: true }).check();
  await expect(rows(page)).toHaveCount(2);
});

test("permanent residents can hide citizens-only jobs", async ({ page }) => {
  await open(page);
  await page.getByLabel("Open to permanent residents").check();
  await expect(page.getByText("64 jobs, newest first")).toBeVisible();
  await expect(rows(page).filter({ hasText: "Umbrella" })).toHaveCount(0);
});

test("mid and senior jobs load when asked for", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => { if (/jobs-(mid|senior)\.json/.test(r.url())) asked.push(r.url()); });
  await open(page);
  expect(asked).toEqual([]);  // not loaded until someone wants them

  await page.getByLabel("Level", { exact: true }).selectOption("mid");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Initrode");
  await expect(rows(page)).toContainText("Mid level");

  await page.getByLabel("Level", { exact: true }).selectOption("all");
  await expect(page.getByText("67 jobs, newest first")).toBeVisible();
  expect(asked).toHaveLength(2);  // each file once
});

test("a level in the address opens it", async ({ page }) => {
  await page.route("**/internships.json", (route) => route.fulfill({ json: DATA }));
  await page.route("**/jobs-senior.json", (route) => route.fulfill({ json: SENIOR }));
  await page.goto("/?level=senior");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Vandelay");
  await expect(page.getByLabel("Level", { exact: true })).toHaveValue("senior");
});

test("filters by company size, and shows the size", async ({ page }) => {
  await open(page);
  await page.getByLabel("Company size", { exact: true }).selectOption({ label: "1,000\u20132,000 employees (1)" });
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Hooli \u00b7 1,500 employees");
  await page.getByLabel("Company size", { exact: true }).selectOption({ index: 1 });
  await expect(page.getByText("Company sizes are only known for some")).toBeVisible();
});

test("saved senior jobs stay listed, and aren't called closed", async ({ page }) => {
  await open(page);
  await page.getByLabel("Level", { exact: true }).selectOption("senior");
  await page.getByRole("button", { name: "Save Staff Engineer at Vandelay" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Saved (1)" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Vandelay");
  await expect(rows(page)).not.toContainText("No longer listed");
});

test("apply links go to the listing, in a new tab", async ({ page }) => {
  await open(page);
  const link = page.getByRole("link", { name: /Apply to Software Intern at Acme/ });
  await expect(link).toHaveAttribute("href", "https://example.com/a");
  await expect(link).toHaveAttribute("target", "_blank");
});

test("LinkedIn and Simplify links carry the current search", async ({ page }) => {
  await open(page);
  await page.getByLabel("Search by company or role").fill("data analyst");
  await page.getByLabel("Location", { exact: true }).fill("Boston");
  await page.getByLabel("Remote", { exact: true }).check();

  const linkedin = new URL((await page.getByRole("link", { name: /on LinkedIn/ }).getAttribute("href"))!);
  expect(linkedin.origin).toBe("https://www.linkedin.com");
  expect(Object.fromEntries(linkedin.searchParams)).toEqual({ keywords: "data analyst internship", f_E: "1,2", location: "Boston", f_WT: "2" });

  const simplify = new URL((await page.getByRole("link", { name: /on Simplify/ }).getAttribute("href"))!);
  expect(simplify.searchParams.get("q")).toBe("data analyst internship");
});

test("says so when the data can't load", async ({ page }) => {
  await page.route("**/internships.json", (route) => route.fulfill({ status: 500 }));
  await page.goto("/");
  await expect(page.getByText("Couldn't load the jobs")).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`no serious accessibility problems in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });
}
