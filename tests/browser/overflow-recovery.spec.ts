import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { profile } from "../cloudflare/fixtures";
import { baseResume, toJournal } from "../../src/lib/adapter";
const longProfile = {
  ...profile,
  projects: Array.from({ length: 6 }, (_, i) => ({
    id: `project-${i}`,
    name: `Project ${i + 1}`,
    description: "Built accessible applications with reusable interfaces. "
      .repeat(50)
      .trim(),
    achievements: [],
    links: [],
    provenance: null,
  })),
};
test("an overflowing historical resume recovers after edits and clears its stale export error", async ({
  page,
}) => {
  await page.goto("/");
  const record = {
    id: crypto.randomUUID(),
    title: "Overflow recovery",
    folder: "",
    profile: longProfile,
    resume: baseResume(longProfile),
    manualProfile: toJournal(longProfile),
    jobDescription: "",
    analysis: null,
    twoPages: true,
    createdAt: new Date().toISOString(),
  };
  await page.evaluate(async (record) => {
    const { db } = await import("/src/lib/storage.ts");
    await db.approveProfile(record.profile, true);
    await db.saveResume(record);
  }, record);
  await page.reload();
  await page.getByRole("button", { name: "My Resumes", exact: true }).click();
  await page.getByRole("button", { name: "Open & edit", exact: true }).click();
  await expect(page.locator(".overflow-note")).toBeVisible();
  await page.getByRole("button", { name: "Export PDF ↓", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Content exceeds the selected A4 page limit",
  );
  await page.getByRole("button", { name: "Edit resume", exact: true }).click();
  for (let i = 1; i <= 6; i++)
    await page
      .getByRole("textbox", { name: `Project ${i}`, exact: true })
      .fill("Built accessible interfaces.");
  await page.getByLabel("Allow two pages").uncheck();
  await expect(page.locator(".fit-label")).toContainText("A4 fit");
  await expect(page.locator(".overflow-note")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export PDF ↓", exact: true }),
  ).toBeEnabled();
  await page.context().addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = "yes";
    };
  });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF ↓", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.locator("html")).toHaveAttribute("data-printed", "yes");
  await expect(popup.locator(".project p")).toHaveText(
    Array(6).fill("Built accessible interfaces."),
  );
  const pdf = await PDFDocument.load(
    await popup.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    }),
  );
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).node.Annots()?.size()).toBeGreaterThan(0);
  await popup.close();
  await expect(page.getByRole("alert")).toHaveCount(0);
  // Expanding again must restore the current warning and block actual printing.
  await page
    .getByRole("textbox", { name: "Project 1", exact: true })
    .fill(longProfile.projects[0].description);
  await expect(page.locator(".overflow-note")).toBeVisible();
  await page.getByRole("button", { name: "Export PDF ↓", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Content exceeds the selected A4 page limit",
  );
  await page.route("**/api/refine-resume", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "AUTH_REQUIRED",
          message: "Sign in to Cloudflare Access.",
        },
      }),
    }),
  );
  await page
    .getByLabel("Requested resume edits", { exact: true })
    .fill("Make this concise.");
  await page
    .getByRole("button", { name: "Refine with AI", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Sign in to Cloudflare Access.",
  );
  await page
    .getByRole("textbox", { name: "Project 1", exact: true })
    .fill("Built accessible interfaces.");
  await expect(page.locator(".fit-label")).toContainText("A4 fit");
  await expect(page.getByRole("alert")).toContainText(
    "Sign in to Cloudflare Access.",
  );
});

test("tailored content removal revalidates layout but still requires fresh user review", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async (profile) => {
    const { db } = await import("/src/lib/storage.ts");
    const { baseContent, contentDigest } = await import("/shared/tailoring.ts");
    await db.approveProfile(profile, true);
    const content = baseContent(profile);
    await db.saveResume({
      formatVersion: 2,
      id: crypto.randomUUID(),
      title: "Tailored overflow",
      folder: "",
      profile,
      content,
      warnings: [],
      jobDescription: "",
      twoPages: false,
      createdAt: new Date().toISOString(),
      review: {
        reviewedAt: new Date().toISOString(),
        digest: await contentDigest(profile, content),
      },
    });
  }, longProfile);
  await page.reload();
  await page.getByRole("button", { name: "My Resumes", exact: true }).click();
  await page.getByRole("button", { name: "Open & edit", exact: true }).click();
  await expect(page.locator(".overflow-note")).toBeVisible();
  // A cached preview may warn, but must not prevent a fresh export validation.
  await page.getByRole("button", { name: "Export PDF ↓", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Content exceeds the selected A4 page limit",
  );
  for (const project of longProfile.projects)
    await page
      .getByLabel(`Include project ${project.name}`, { exact: true })
      .uncheck();
  await expect(page.locator(".fit-label")).toContainText("A4 fit");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export PDF ↓", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("I reviewed this tailored resume against the approved profile.")
    .check();
  await expect(
    page.getByRole("button", { name: "Export PDF ↓", exact: true }),
  ).toBeEnabled();
  await page.context().addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = "yes";
    };
  });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF ↓", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.locator("html")).toHaveAttribute("data-printed", "yes");
  await expect(popup.locator(".project")).toHaveCount(0);
  await popup.close();
  const stored = await page.evaluate(async () => {
    const { db } = await import("/src/lib/storage.ts");
    return {
      master: await db.professionalProfiles.toArray(),
      resumes: await db.resumes.toArray(),
    };
  });
  expect(stored.master[0].projects).toEqual(longProfile.projects);
  expect(stored.resumes[0].content.projects).toHaveLength(6);
});
