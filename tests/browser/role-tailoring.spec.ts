import { test, expect } from "@playwright/test";
import {
  tailoringProfile,
  roleTailoringCases,
} from "../cloudflare/role-tailoring.fixture";
test("different jobs replace current wording and save distinct drafts; refinement retains the draft's original job", async ({
  page,
}) => {
  const requests: { path: string; body: any }[] = [];
  await page.route("**/api/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    requests.push({ path, body });
    expect(["/api/generate-resume", "/api/refine-resume"]).toContain(path);
    expect(body.formatVersion).toBe(2);
    const sample = roleTailoringCases.find(
      (s) => s.jobDescription === body.jobDescription,
    );
    expect(sample).toBeDefined();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        formatVersion: 2,
        content: sample!.content,
        warnings: [],
      }),
    });
  });
  await page.goto("/");
  await page.evaluate(async (profile) => {
    const { db } = await import("/src/lib/storage.ts");
    await db.approveProfile(profile, true);
  }, tailoringProfile);
  await page.reload();
  const before = await page.evaluate(async () => {
    const { db } = await import("/src/lib/storage.ts");
    return {
      profiles: await db.professionalProfiles.toArray(),
      versions: await db.profileVersions.toArray(),
    };
  });
  for (const sample of roleTailoringCases) {
    await page.getByRole("button", { name: "Job Match", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Job description", exact: true })
      .fill(sample.jobDescription);
    await page
      .getByRole("button", { name: "✦ Generate resume", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Tailored summary", exact: true }),
    ).toHaveValue(sample.content.summary);
    const preview = page.frameLocator('iframe[title="Resume preview"]');
    await expect(preview.locator(".bullets li")).toHaveText(
      sample.content.experience[0].bullets.map((b) => b.text),
    );
    await expect(preview.locator(".project p")).toHaveText(
      sample.content.projects[0].description,
    );
    await expect(preview.locator(".job-title")).toHaveText(
      tailoringProfile.experience[0].title,
    );
    await expect(preview.locator(".paper")).not.toContainText(
      sample.unsupported,
    );
    await expect(
      page.getByLabel(
        "I reviewed this tailored resume against the approved profile.",
      ),
    ).not.toBeChecked();
    await page.getByLabel("Resume version name").fill(sample.role);
    await page
      .getByRole("button", { name: "▣ Save new version", exact: true })
      .click();
  }
  // Reopen an older role after generating others: never reuse the last bullets.
  await page.getByRole("button", { name: "My Resumes", exact: true }).click();
  const card = page.locator(".resume-slot").filter({
    has: page.getByRole("heading", {
      name: "Learning Experience Designer",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Open & edit", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Tailored summary", exact: true }),
  ).toHaveValue(roleTailoringCases[1].content.summary);
  // An unsent job in Match must not replace the saved resume's targeting context.
  await page.getByRole("button", { name: "Job Match", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Job description", exact: true })
    .fill(roleTailoringCases[0].jobDescription);
  await page.getByRole("button", { name: "CV Builder", exact: true }).click();
  await page
    .getByLabel("Requested resume edits", { exact: true })
    .fill("Make this more concise while preserving its focus.");
  await page
    .getByRole("button", { name: "Refine with AI", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Refined draft ready");
  expect(requests.map((r) => r.path)).toEqual([
    "/api/generate-resume",
    "/api/generate-resume",
    "/api/generate-resume",
    "/api/refine-resume",
  ]);
  expect(requests[3].body.jobDescription).toBe(
    roleTailoringCases[1].jobDescription,
  );
  const after = await page.evaluate(async () => {
    const { db } = await import("/src/lib/storage.ts");
    return {
      profiles: await db.professionalProfiles.toArray(),
      versions: await db.profileVersions.toArray(),
      resumes: await db.resumes.toArray(),
    };
  });
  expect({ profiles: after.profiles, versions: after.versions }).toEqual(
    before,
  );
  expect(after.resumes).toHaveLength(3);
  for (const sample of roleTailoringCases) {
    const saved = after.resumes.find((r) => r.title === sample.role);
    expect(saved.content).toEqual(sample.content);
    expect(saved.review).toBeNull();
  }
});
