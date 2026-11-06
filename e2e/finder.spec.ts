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
    listing("d", "Umbrella", "Hardware Intern", { sponsorship: "citizens", field: "Hardware", locations: ["London"] }),
    ...Array.from({ length: 60 }, (_, i) => listing(`x${i}`, "Bulk Co", `Filler Intern ${i}`)),
  ],
};

async function open(page: Page) {
  await page.route("**/internships.json", (route) => route.fulfill({ json: DATA }));
  await page.goto("/");
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
}

const rows = (page: Page) => page.locator("[data-listing]");

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

  await page.getByLabel("Field").selectOption("Hardware");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("May sponsor visas").check();
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.getByLabel("Season").selectOption("Fall");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Season").selectOption("");
  await page.getByLabel("Location").fill("london");
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Location").fill("");
  await page.getByLabel("Remote").check();
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel("Remote").uncheck();

  await page.getByLabel("Open to undergrads").check();
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

test("damaged saved data doesn't break the page", async ({ page }) => {
  await open(page);
  await page.evaluate(() => localStorage.setItem("internship-finder:tracked", "null"));
  await page.reload();
  await expect(page.getByText("64 internships, newest first")).toBeVisible();
});

test("two letters search for a state", async ({ page }) => {
  await open(page);
  await page.getByLabel("Location").fill("TX");
  await expect(page.getByText("62 internships, newest first")).toBeVisible();
  await page.getByLabel("Location").fill("ON");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
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
  await page.getByLabel("Location").fill("Boston");
  await page.getByLabel("Remote").check();

  const linkedin = new URL((await page.getByRole("link", { name: /on LinkedIn/ }).getAttribute("href"))!);
  expect(linkedin.origin).toBe("https://www.linkedin.com");
  expect(Object.fromEntries(linkedin.searchParams)).toEqual({ keywords: "data analyst", f_E: "1", location: "Boston", f_WT: "2" });

  const simplify = new URL((await page.getByRole("link", { name: /on Simplify/ }).getAttribute("href"))!);
  expect(simplify.searchParams.get("query")).toBe("data analyst internship");
});

test("says so when the data can't load", async ({ page }) => {
  await page.route("**/internships.json", (route) => route.fulfill({ status: 500 }));
  await page.goto("/");
  await expect(page.getByText("Couldn't load the internships")).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`no serious accessibility problems in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });
}
