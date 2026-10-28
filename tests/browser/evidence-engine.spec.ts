import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import {
  evidenceProfile,
  engineCases,
  rewrittenAchievements,
} from "../cloudflare/evidence.fixture";
import { planTailoring } from "../../shared/evidence";
import { createWorker } from "../../worker/index";
import { env, identity, mockAI } from "../cloudflare/fixtures";
test("automatic evidence-ranked drafts change competencies, headlines and project focus before review", async ({
  page,
}) => {
  let calls = 0;
  const worker = createWorker({
    authenticate: identity,
    log: () => {},
    fetcher: async (_url, init) => {
      calls++;
      const input = JSON.parse(
        JSON.parse(init!.body as string).messages[1].content,
      );
      const sample = engineCases.find(
        (c) => c.job === input.target.jobDescription,
      )!;
      expect(sample).toBeDefined();
      const plan = planTailoring(evidenceProfile, sample.job);
      const detail = plan.projects
        .find((p) => p.projectId === "mixed")!
        .facts.find((f) => f.text.includes(sample.projectFragment))!;
      return mockAI({
        summary: sample.summary,
        summarySourceFactIds: plan.experience[0].facts.map((f) => f.id),
        experience: [
          {
            experienceId: "career",
            bullets: plan.experience[0].facts.map((f) => ({
              sourceAchievementIds: [f.id],
              text: rewrittenAchievements[f.id],
            })),
          },
        ],
        projects: [
          {
            projectId: "mixed",
            description: sample.project,
            sourceFactIds: [detail.id],
          },
        ],
      });
    },
  });
  await page.route("**/api/generate-resume", async (route) => {
    expect(route.request().postDataJSON().strategy).toBe("evidence");
    const response = await worker.fetch(
      new Request("https://api.test/api/generate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: route.request().postData(),
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Dream-Job-Engine")).toBe("evidence-v1");
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  await page.goto("/");
  await page.evaluate(async (profile) => {
    const { db } = await import("/src/lib/storage.ts");
    await db.approveProfile(profile, true);
  }, evidenceProfile);
  await page.reload();
  for (const sample of engineCases) {
    await page.getByRole("button", { name: "Job Match", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Job description", exact: true })
      .fill(sample.job);
    await page
      .getByRole("button", { name: "✦ Generate resume", exact: true })
      .click();
    const plan = planTailoring(evidenceProfile, sample.job);
    const preview = page.frameLocator('iframe[title="Resume preview"]');
    await expect(preview.locator(".role")).toHaveText(plan.headline.text);
    await expect(preview.locator(".role")).not.toContainText("Full Stack");
    await expect(preview.locator(".bullets li")).toHaveText(
      plan.experience[0].facts.map((f) => rewrittenAchievements[f.id]),
    );
    await expect(preview.locator(".project p")).toHaveText(sample.project);
    await expect(preview.locator(".job-title")).toHaveText(
      evidenceProfile.experience.map((e) => e.title),
    );
    await expect(
      page.getByRole("textbox", { name: "Tailored summary", exact: true }),
    ).toHaveValue(sample.summary);
    await expect(
      page.getByLabel(
        "I reviewed this tailored resume against the approved profile.",
      ),
    ).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "Export PDF ↓", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Resume version name").fill(sample.role);
    await page
      .getByRole("button", { name: "▣ Save new version", exact: true })
      .click();
  }
  expect(calls).toBe(3);
  const before = await page.evaluate(async () => {
    const { db } = await import("/src/lib/storage.ts");
    return {
      profile: await db.professionalProfiles.toArray(),
      resumes: await db.resumes.toArray(),
    };
  });
  expect(before.profile[0].headline).toBe(evidenceProfile.headline);
  expect(before.resumes).toHaveLength(3);
  expect(new Set(before.resumes.map((r) => r.content.headline.text)).size).toBe(
    3,
  );
  await page.getByRole("button", { name: "My Resumes", exact: true }).click();
  await page
    .locator(".resume-slot")
    .filter({
      has: page.getByRole("heading", { name: "Product Manager", exact: true }),
    })
    .getByRole("button", { name: "Open & edit", exact: true })
    .click();
  const headline = page.getByRole("textbox", {
    name: "Tailored headline",
    exact: true,
  });
  const original = await headline.inputValue();
  await headline.fill("WordPress Product Manager");
  await page
    .getByLabel("I reviewed this tailored resume against the approved profile.")
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "failed focused factuality checks",
  );
  await expect(
    page.getByRole("button", { name: "Export PDF ↓", exact: true }),
  ).toBeDisabled();
  await headline.fill(original);
  await page
    .getByLabel("I reviewed this tailored resume against the approved profile.")
    .check();
  await page.context().addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = "yes";
    };
  });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF ↓", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.locator("html")).toHaveAttribute("data-printed", "yes");
  await expect(popup.locator(".role")).toHaveText(original);
  const pdf = await PDFDocument.load(
    await popup.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
    }),
  );
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).node.Annots()?.size()).toBeGreaterThan(0);
  await popup.close();
});
