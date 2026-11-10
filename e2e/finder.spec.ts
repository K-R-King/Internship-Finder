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
    listing("e", "Hooli", "New Grad Engineer", { type: "entry", locations: ["Los Angeles, CA"], terms: [], employees: 1500, band: 5, url: "https://boards.greenhouse.io/hooli/jobs/1" }),
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
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
}

const rows = (page: Page) => page.locator("[data-listing]");

const LEVELS = "Internships and Job Levels";

async function openJobs(page: Page) {
  await menu(page, LEVELS).click();
  const list = page.getByRole("group", { name: LEVELS, exact: true });
  for (const name of ["Entry Level Jobs", "Mid Level Jobs", "Senior Level Jobs"]) await list.getByRole("checkbox", { name, exact: true }).check();
  await list.getByRole("checkbox", { name: "Internships", exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByText("3 jobs, newest first")).toBeVisible();
}

const menu = (page: Page, caption: string) => page.getByRole("button", { name: new RegExp(`^${caption}:`) });

async function pick(page: Page, caption: string, name: string | RegExp) {
  await menu(page, caption).click();
  await page.getByRole("group", { name: caption, exact: true }).getByRole("checkbox", { name, exact: typeof name === "string" }).check();
  await page.keyboard.press("Escape");
}

async function pickOne(page: Page, caption: string, name: string) {
  await menu(page, caption).click();
  await page.getByRole("group", { name: caption, exact: true }).getByRole("radio", { name, exact: true }).click();
}

const pickMajor = (page: Page, name: string) => pick(page, "Major", name);

test("shows listings a page at a time", async ({ page }) => {
  await open(page);
  await expect(rows(page)).toHaveCount(50);
  await page.getByRole("button", { name: /Show more/ }).click();
  await expect(rows(page)).toHaveCount(64);
});

test("search and filters narrow the list", async ({ page }) => {
  await open(page);
  await page.getByLabel("Search by company or role").fill("globex");
  await expect(page.getByText("1 internship, newest first")).toBeVisible();
  await page.getByLabel("Search by company or role").fill("");

  await pickMajor(page, "Electrical Engineering");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("May sponsor visas").check();
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  await pick(page, "Applying for term", "Fall 2027");
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Remove Fall 2027" }).click();
  await page.getByLabel("Location", { exact: true }).fill("boston");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Location", { exact: true }).fill("");
  await page.getByLabel("Remote", { exact: true }).check();
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Remote", { exact: true }).uncheck();

  await pick(page, "Degree", "Undergrad Students");
  await expect(page.getByText("63 internships, newest first")).toBeVisible();
});

test("saved and applied listings survive a refresh", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Save Software Intern at Acme" }).click();
  await page.getByRole("button", { name: "Applied Accounting Intern at Globex" }).click();
  await page.reload();
  await expect(page.getByText("64 internships, newest first")).toBeVisible();

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
  await page.getByRole("button", { name: "See all listings" }).click();
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
});

test("damaged saved data doesn't break the page", async ({ page }) => {
  await open(page);
  await page.evaluate(() => localStorage.setItem("internship-finder:tracked", "null"));
  await page.reload();
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
});

test("each filter in use can be removed on its own", async ({ page }) => {
  await open(page);
  await page.getByLabel("Remote", { exact: true }).check();
  await pickMajor(page, "Electrical Engineering");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await page.getByRole("button", { name: "Remove Electrical Engineering" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Globex");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
});

test("on a phone, the extra filters fold away until asked for", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  await expect(menu(page, "Major")).toBeHidden();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await pickMajor(page, "Electrical Engineering");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
});

test("two letters search for a state", async ({ page }) => {
  await open(page);
  await page.getByLabel("Location", { exact: true }).fill("TX");
  await expect(page.getByText("62 internships, newest first")).toBeVisible();
  await page.getByLabel("Location", { exact: true }).fill("ON");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
});

test("marks listings added since the last visit, and a refresh keeps them marked", async ({ page }) => {
  await page.route("**/internships.json", (route) => route.fulfill({
    json: { ...DATA, items: DATA.items.map((item) => ({ ...item, added: item.id === "a" ? 2000 : 100 })) },
  }));
  await page.goto("/");
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
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
  await expect(page.getByText("1 internship, newest first")).toBeVisible();
  await expect(page.getByLabel("Search by company or role")).toHaveValue("accounting");
  await expect(menu(page, "Major")).toContainText("Business");
});

test("changing a filter says results are updating, and Search runs it right away", async ({ page }) => {
  await open(page);
  await page.getByLabel("Search by company or role").fill("globex");
  await expect(page.getByText("Updating results\u2026")).toBeVisible();
  await expect(page.getByText("1 internship, newest first")).toBeVisible();

  await page.getByLabel("Search by company or role").fill("acme");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Updating results\u2026")).toBeVisible();
  await expect(rows(page)).toContainText("Acme");

  await page.getByLabel("Search by company or role").fill("initech");
  await page.getByLabel("Search by company or role").press("Enter");
  await expect(rows(page)).toContainText("Initech");
});

test("one menu picks internships and job levels, shown on each listing", async ({ page }) => {
  await open(page);
  const levels = page.getByRole("group", { name: LEVELS, exact: true }).locator("label");
  await menu(page, LEVELS).click();
  await expect(levels).toHaveText(["Internships", "Entry Level Jobs", "Mid Level Jobs", "Senior Level Jobs"]);
  await page.keyboard.press("Escape");
  await expect(menu(page, LEVELS)).toContainText("Internships");
  await expect(rows(page).first()).toContainText("Internship");

  await pick(page, "Degree", "Graduate Students");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Initech");
  await page.getByRole("button", { name: "Remove Graduate Students" }).click();

  await openJobs(page);
  await expect(menu(page, "Applying for term")).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Mid Level Jobs" }).click();
  await page.getByRole("button", { name: "Remove Senior Level Jobs" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Entry Level");
  await pick(page, LEVELS, "Senior Level Jobs");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: `${LEVELS}: 2 selected` })).toBeVisible();
});

test("no major is offered as a shortcut, and quick buttons set remote or this week's listings", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: "Computer Science", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "EECS", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Work from anywhere" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByLabel("Remote", { exact: true })).toBeChecked();
});

test("the term menu is called Applying for term", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: /^Term:/ })).toHaveCount(0);
  await expect(menu(page, "Applying for term")).toContainText("Applying for term");
});

test("a distance reaches nearby cities, and says so when it can't place the search", async ({ page }) => {
  await page.route("**/us-places.json", (route) => route.fulfill({ json: { TX: [["Austin", 30.27, -97.74, 900000], ["San Marcos", 29.88, -97.94, 60000]], MA: [["Boston", 42.36, -71.06, 600000]] } }));
  await open(page);
  await expect(menu(page, "Distance")).toBeDisabled();
  await page.getByLabel("Location", { exact: true }).fill("San Marcos, TX");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await pickOne(page, "Distance", "Within 50 miles");
  await expect(page.getByText("62 internships, newest first")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Within 50 miles" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Within 50 miles" }).click();
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();

  await pickOne(page, "Distance", "Within 50 miles");
  await page.getByLabel("Location", { exact: true }).fill("TX");
  await expect(page.getByText(/Distance needs one city/)).toBeVisible();
  await expect(page.getByText("62 internships, newest first")).toBeVisible();

  await page.getByLabel("Location", { exact: true }).fill("");
  await expect(menu(page, "Distance")).toBeDisabled();
  await expect(page.getByRole("button", { name: /Within 50 miles/ })).toHaveCount(0);
});

test("date posted narrows to recent listings", async ({ page }) => {
  await open(page);  // the sample listings were posted just over a day before the refresh
  await menu(page, "Date posted").click();
  await expect(page.getByRole("group", { name: "Date posted", exact: true }).locator("label")).toHaveText(["Any time", "1 day", "1 Week", "1 Month"]);
  await page.getByRole("radio", { name: "1 day", exact: true }).click();
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await pickOne(page, "Date posted", "1 Week");
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Posted within 1 Week" })).toBeVisible();
  await pickOne(page, "Date posted", "Any time");
  await expect(menu(page, "Date posted")).toHaveAccessibleName("Date posted: any");
});

test("a graduation date removes internships that start after it", async ({ page }) => {
  await page.route("**/internships.json", (route) => route.fulfill({ json: { ...DATA, updated: Date.UTC(2026, 10, 9) / 1000 } }));
  await page.goto("/");
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
  await pickOne(page, "Graduation date", "May 2027");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await pickOne(page, "Graduation date", "December 2027");
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
  await pickOne(page, "Graduation date", "Any graduation date");
  await expect(menu(page, "Graduation date")).toHaveAccessibleName("Graduation date: any");
});

test("verified companies are marked, and can be the only ones shown", async ({ page }) => {
  await open(page);
  await openJobs(page);
  const hooli = rows(page).filter({ hasText: "Hooli" });
  await expect(hooli.getByText("Verified", { exact: true })).toBeVisible();
  await expect(rows(page).filter({ hasText: "Initrode" }).getByText("Verified", { exact: true })).toHaveCount(0);
  await page.getByLabel("Verified companies").check();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Hooli");
});

test("a menu closes when you click away, and picks stay when it reopens", async ({ page }) => {
  await open(page);
  await menu(page, "Major").click();
  await page.getByRole("checkbox", { name: "Electrical Engineering", exact: true }).check();
  await expect(page.getByRole("group", { name: "Major", exact: true })).toBeVisible();
  await page.getByRole("heading", { name: /Internship/ }).first().click();
  await expect(page.getByRole("group", { name: "Major", exact: true })).toHaveCount(0);
  await menu(page, "Major").click();
  await expect(page.getByRole("checkbox", { name: "Electrical Engineering", exact: true })).toBeChecked();
});

test("clearing filters on Saved stays on Saved", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Save Software Intern at Acme" }).click();
  await page.getByRole("button", { name: "Saved (1)" }).click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Search by company or role").fill("nothing like this");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Saved (1)" })).toHaveAttribute("aria-pressed", "true");
});

test("a term picked on Saved doesn't quietly filter a list of only jobs", async ({ page }) => {
  await open(page);
  await openJobs(page);
  await page.getByRole("button", { name: "Saved (0)" }).click();
  await pick(page, "Applying for term", "Fall 2027");
  await page.getByRole("button", { name: "All listings" }).click();
  await expect(page.getByText("3 jobs, newest first")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Fall 2027" })).toHaveCount(0);
});

test("company size shows no counts, and Degree offers both groups", async ({ page }) => {
  await open(page);
  await menu(page, "Company size").click();
  await expect(page.getByRole("group", { name: "Company size", exact: true })).not.toContainText("(");
  await page.keyboard.press("Escape");
  await menu(page, "Degree").click();
  await expect(page.getByRole("group", { name: "Degree", exact: true }).locator("label")).toHaveText(["Undergrad Students", "Graduate Students"]);
  await page.getByRole("checkbox", { name: "Undergrad Students" }).check();
  await page.getByRole("checkbox", { name: "Graduate Students" }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
});

test("a term picked for internships doesn't quietly filter jobs", async ({ page }) => {
  await open(page);
  await pick(page, "Applying for term", "Fall 2027");
  await expect(rows(page)).toHaveCount(1);
  await openJobs(page);
  await expect(page.getByRole("button", { name: "Remove Fall 2027" })).toHaveCount(0);
});

test("searching while jobs load doesn't download them again", async ({ page }) => {
  const asked: string[] = [];
  await open(page);
  await page.unroute("**/jobs-mid.json");
  await page.route("**/jobs-mid.json", async (route) => {
    asked.push(route.request().url());
    await new Promise((done) => setTimeout(done, 1500));
    await route.fulfill({ json: MID });
  });
  await pick(page, LEVELS, "Mid Level Jobs");
  await page.waitForTimeout(500);
  await page.getByLabel("Search by company or role").fill("engineer");
  await expect(page.getByText(/\d+ listings?, newest first/)).toBeVisible({ timeout: 8000 });
  expect(asked).toHaveLength(1);
});

test("several fields can be picked at once", async ({ page }) => {
  await open(page);
  await pickMajor(page, "Electrical Engineering");
  await pickMajor(page, "Business");
  await expect(page.getByRole("button", { name: "Major: 2 selected" })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Remove Electrical Engineering" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Globex");
});

test("LA with Remote finds jobs in LA and remote ones", async ({ page }) => {
  await open(page);
  await page.getByLabel("Location", { exact: true }).fill("LA");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await pick(page, LEVELS, "Entry Level Jobs");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Hooli");
  await page.getByLabel("Remote", { exact: true }).check();
  await expect(rows(page)).toHaveCount(2);
});

test("permanent residents can hide citizens-only jobs", async ({ page }) => {
  await open(page);
  await page.getByLabel("Open to permanent residents").check();
  await expect(page.getByText("63 internships, newest first")).toBeVisible();
  await expect(rows(page).filter({ hasText: "Umbrella" })).toHaveCount(0);
});

test("mid and senior jobs load when asked for", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => { if (/jobs-(mid|senior)\.json/.test(r.url())) asked.push(r.url()); });
  await open(page);
  expect(asked).toEqual([]);  // not loaded until someone wants them

  await openJobs(page);
  await expect(rows(page).filter({ hasText: "Initrode" })).toContainText("Mid Level");
  expect(asked).toHaveLength(2);  // each file once
});

test("a level in the address opens it", async ({ page }) => {
  await page.route("**/internships.json", (route) => route.fulfill({ json: DATA }));
  await page.route("**/jobs-senior.json", (route) => route.fulfill({ json: SENIOR }));
  await page.goto("/?level=senior");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Vandelay");
  await expect(menu(page, LEVELS)).toContainText("Senior Level Jobs");
});

test("filters by company size, and shows the size", async ({ page }) => {
  await open(page);
  await openJobs(page);
  await pick(page, "Company size", /^1,001\u20135,000 employees$/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Hooli \u00b7 1,500 employees");
  await pick(page, "Company size", /^1\u201310 employees/);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Remove 1,001\u20135,000 employees" }).click();
  await expect(page.getByText("Company sizes are known for most companies, but not all.")).toBeVisible();
});

test("saved senior jobs stay listed, and aren't called closed", async ({ page }) => {
  await open(page);
  await openJobs(page);
  await menu(page, LEVELS).click();
  await page.getByRole("checkbox", { name: "Entry Level Jobs", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Mid Level Jobs", exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await expect(rows(page)).toHaveCount(1);
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
  expect(Object.fromEntries(linkedin.searchParams)).toEqual({ keywords: "data analyst internship", f_E: "1", location: "Boston", f_WT: "2" });

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
    await page.getByLabel("Remote", { exact: true }).check();  // a pill that's on, and a menu that's open, get checked too
    await expect(rows(page)).toHaveCount(1);
    await menu(page, "Major").click();
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });
}
