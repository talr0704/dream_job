import { test, expect } from "@playwright/test";
import { baseContent } from "../../shared/tailoring";
import { profile, analysis, resume } from "../cloudflare/fixtures";
import { resumeDocument, fitPaper } from "../../shared/render.js";
import { toJournal } from "../../src/lib/adapter";
import { PDFDocument } from "pdf-lib";
import { zipSync, strToU8 } from "fflate";
const draft = { ...profile, verified: false };
async function mockAPI(page: any) {
  await page.route("**/api/*", async (route: any) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("extract-profile")
      ? { profile: draft, warnings: ["Review all facts."] }
      : path.endsWith("analyze-job")
        ? analysis
        : route.request().postDataJSON()?.formatVersion === 2
          ? { formatVersion: 2, content: baseContent(profile), warnings: [] }
          : resume;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}
async function approve(page: any) {
  await page.goto("/#profile");
  await page
    .getByLabel("Professional information or updates", { exact: true })
    .fill(
      "Alex Example is a software developer. Builds accessible applications at Acme with TypeScript.",
    );
  await page
    .getByRole("button", { name: "Propose profile updates", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Apply proposed profile", exact: true })
    .click();
  await page
    .getByLabel("I reviewed and confirm the profile facts and links.")
    .check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("✓ Confirmed profile", { exact: true }),
  ).toBeVisible();
}
test("review, approval, reload, match, immutable snapshots, duplicate, delete, backup and print", async ({
  page,
}) => {
  await mockAPI(page);
  await approve(page);
  await page.reload();
  await expect(page.getByText("Alex Example", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Job Match", exact: true }).click();
  await page
    .getByLabel("Job description", { exact: true })
    .fill(
      "Looking for a TypeScript developer with accessible application experience.",
    );
  await page
    .getByRole("button", { name: "✦ Generate resume", exact: true })
    .click();
  await expect(
    page
      .frameLocator('iframe[title="Resume preview"]')
      .getByText("Alex Example", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Resume version name").fill("Application one");
  await page
    .getByRole("button", { name: "▣ Save new version", exact: true })
    .click();
  await page.getByRole("button", { name: "My Resumes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Application one", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Application one (copy)", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Delete this version", exact: true })
    .click();
  await expect(page.locator(".resume-slot")).toHaveCount(1);
  await page.getByRole("button", { name: "Open & edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Tailored summary", exact: true })
    .fill("Manually edited resume summary.");
  await page.getByLabel("Resume version name").fill("Manual version");
  await page
    .getByRole("button", { name: "▣ Save new version", exact: true })
    .click();
  await page.getByRole("button", { name: "My Profile", exact: true }).click();
  await expect(
    page.getByText("Builds accessible applications.", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export local backup" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("dream-job-backup-v2.json");
  await page.getByRole("button", { name: "My Resumes", exact: true }).click();
  await page
    .getByRole("button", { name: "Open & edit", exact: true })
    .first()
    .click();
  await expect(page.getByText("Manual version", { exact: true })).toHaveCount(
    0,
  );
  // Exercise the actual export popup, while stubbing only the OS print dialog.
  await page.context().addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = "yes";
    };
  });
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByLabel("I reviewed this tailored resume against the approved profile.")
    .check();
  await page.getByRole("button", { name: "Export PDF ↓", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.locator("html")).toHaveAttribute("data-printed", "yes");
  expect(await popup.locator(".paper").count()).toBe(1);
  expect(await popup.locator(".name").textContent()).toBe("Alex Example");
  await popup.close();
});
test("failed Access request preserves input and leaves profile unsaved", async ({
  page,
}) => {
  await page.route("**/api/extract-profile", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "AUTH_REQUIRED",
          message: "Sign in with Cloudflare Access.",
        },
      }),
    }),
  );
  await page.goto("/#profile");
  const text =
    "My professional information must remain here after a failed authentication request.";
  await page
    .getByLabel("Professional information or updates", { exact: true })
    .fill(text);
  await page
    .getByRole("button", { name: "Propose profile updates", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Cloudflare Access");
  await expect(
    page.getByLabel("Professional information or updates", { exact: true }),
  ).toHaveValue(text);
  await page.reload();
  await expect(page.getByText("Your Name", { exact: true })).toBeVisible();
});
test("browser document extraction accepts DOCX and PDF and rejects archive expansion", async ({
  page,
}) => {
  await page.goto("/");
  const docx = zipSync({
    "word/document.xml": strToU8(
      '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>Alex Example builds accessible applications.</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  const text = await page.evaluate(async (bytes) => {
    const { extractDocumentText } = await import("/src/lib/documents.ts");
    return extractDocumentText(
      new File([new Uint8Array(bytes)], "resume.docx"),
    );
  }, Array.from(docx));
  expect(text).toContain("accessible applications");
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Alex Example builds accessible applications.");
  const pdfBytes = await pdf.save();
  const pdfText = await page.evaluate(async (bytes) => {
    const { extractDocumentText } = await import("/src/lib/documents.ts");
    return extractDocumentText(new File([new Uint8Array(bytes)], "resume.pdf"));
  }, Array.from(pdfBytes));
  expect(pdfText).toContain("accessible applications");
  const bomb = zipSync(
    { "word/document.xml": new Uint8Array(17 * 1024 * 1024) },
    { level: 9 },
  );
  const error = await page.evaluate(async (bytes) => {
    const { extractDocumentText } = await import("/src/lib/documents.ts");
    try {
      await extractDocumentText(
        new File([new Uint8Array(bytes)], "resume.docx"),
      );
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }, Array.from(bomb));
  expect(error).toContain("too large");
});
test("approved world remains responsive, and local PDF has A4 searchable text, links and overflow checks", async ({
  page,
}) => {
  await page.goto("/");
  await page.screenshot({
    path: "artifacts/world-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: "artifacts/world-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const p = toJournal(profile);
  await page.setContent(
    resumeDocument({
      ...p,
      links: [{ label: "Portfolio", url: "https://portfolio.test/alex" }],
    }),
  );
  const layout = await page.evaluate(fitPaper);
  expect(layout.overflow).toBe(false);
  await page.emulateMedia({ media: "print" });
  const bytes = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    path: "artifacts/cloudflare-resume.pdf",
  });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 0);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89, 0);
  expect(pdf.getPage(0).node.Annots()?.size()).toBeGreaterThan(0);
  await page.setContent(
    resumeDocument({ ...p, summary: profile.summary.repeat(400) }),
  );
  expect((await page.evaluate(fitPaper)).overflow).toBe(true);
});
test("invalid extraction responses preserve an already approved profile and its versions", async ({
  page,
}) => {
  await mockAPI(page);
  await approve(page);
  const before = await page.evaluate(async () => {
    const { db } = await import("/src/lib/storage.ts");
    return {
      profiles: await db.professionalProfiles.toArray(),
      versions: await db.profileVersions.toArray(),
      resumes: await db.resumes.toArray(),
    };
  });
  await page
    .locator(".import-panel")
    .evaluate((el) => el.setAttribute("open", ""));
  const input =
    "New information must survive the failed extraction without changing my approved profile.";
  const requestId = "12345678-1234-4123-8123-123456789abc";
  for (const invalid of [false, true]) {
    await page.route("**/api/extract-profile", (route) =>
      route.fulfill({
        status: invalid ? 200 : 502,
        contentType: "application/json",
        body: JSON.stringify(
          invalid
            ? { profile: {}, warnings: [] }
            : {
                error: {
                  code: "INVALID_AI_RESPONSE",
                  message:
                    "AI output failed validation. No changes were saved.",
                  requestId,
                },
              },
        ),
      }),
    );
    await page
      .getByLabel("Professional information or updates", { exact: true })
      .fill(input);
    await page
      .getByRole("button", { name: "Propose profile updates", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      invalid ? "response did not match" : "Reference: " + requestId,
    );
    await expect(
      page.getByLabel("Professional information or updates", { exact: true }),
    ).toHaveValue(input);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const after = await page.evaluate(async () => {
      const { db } = await import("/src/lib/storage.ts");
      return {
        profiles: await db.professionalProfiles.toArray(),
        versions: await db.profileVersions.toArray(),
        resumes: await db.resumes.toArray(),
      };
    });
    expect(after).toEqual(before);
  }
  await page.reload();
  await expect(
    page.getByText("✓ Confirmed profile", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alex Example", { exact: true })).toBeVisible();
});
test("rejected job factuality audit preserves job input and saved data without generating a resume", async ({
  page,
}) => {
  await mockAPI(page);
  await approve(page);
  const snapshot = () =>
    page.evaluate(async () => {
      const { db } = await import("/src/lib/storage.ts");
      return {
        profiles: await db.professionalProfiles.toArray(),
        versions: await db.profileVersions.toArray(),
        analyses: await db.jobAnalyses.toArray(),
        resumes: await db.resumes.toArray(),
      };
    });
  const before = await snapshot();
  let generated = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generate-resume")) generated++;
  });
  const requestId = "12345678-1234-4123-8123-123456789abc";
  await page.route("**/api/analyze-job", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "UNSUPPORTED_CLAIM",
          message:
            "Factuality review rejected the job analysis. Review the source information and retry. No changes were saved.",
          requestId,
        },
      }),
    }),
  );
  await page.getByRole("button", { name: "Job Match", exact: true }).click();
  const job =
    "Looking for a TypeScript developer. AWS certification is preferred; compare only verified profile evidence.";
  await page
    .getByRole("textbox", { name: "Job description", exact: true })
    .fill(job);
  await page
    .getByRole("button", { name: "Analyze fit (optional)", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Reference: " + requestId,
  );
  await expect(
    page.getByRole("textbox", { name: "Job description", exact: true }),
  ).toHaveValue(job);
  await expect(
    page.getByRole("button", { name: "Analyze fit (optional)", exact: true }),
  ).toBeEnabled();
  expect(await snapshot()).toEqual(before);
  expect(generated).toBe(0);
});
test("one-call tailoring is independent, source-comparable and requires fresh resume review after edits", async ({
  page,
}) => {
  await mockAPI(page);
  let analysisCalls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/analyze-job")) analysisCalls++;
  });
  await approve(page);
  const before = await page.evaluate(async () => {
    const { db } = await import("/src/lib/storage.ts");
    return {
      profiles: await db.professionalProfiles.toArray(),
      versions: await db.profileVersions.toArray(),
    };
  });
  const content = baseContent(profile);
  content.experience[0].bullets[0].text =
    "Developed 3 accessible applications.";
  await page.route("**/api/generate-resume", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ formatVersion: 2, content, warnings: [] }),
    }),
  );
  await page.getByRole("button", { name: "Job Match", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Job description", exact: true })
    .fill(
      "Seeking TypeScript and accessible application development experience.",
    );
  await page
    .getByRole("button", { name: "✦ Generate resume", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Review tailored resume" });
  await expect(review).toBeVisible();
  await expect(
    review.locator("p").filter({ hasText: "Original approved achievement:" }),
  ).toContainText("Built 3 accessible applications.");
  await expect(
    page.getByRole("textbox", { name: "Experience 1 bullet 1", exact: true }),
  ).toHaveValue("Developed 3 accessible applications.");
  expect(analysisCalls).toBe(0);
  const exportButton = page.getByRole("button", {
    name: "Export PDF ↓",
    exact: true,
  });
  await expect(exportButton).toBeDisabled();
  const approval = page.getByLabel(
    "I reviewed this tailored resume against the approved profile.",
  );
  await approval.check();
  await expect(exportButton).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Tailored summary", exact: true })
    .fill("Builds accessible applications with TypeScript.");
  await expect(approval).not.toBeChecked();
  await expect(exportButton).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Experience 1 bullet 1", exact: true })
    .fill("Led 100 projects.");
  await approval.click();
  await expect(page.getByRole("alert")).toContainText(
    "failed focused factuality checks",
  );
  await expect(exportButton).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Experience 1 bullet 1", exact: true })
    .fill("Developed 3 accessible applications.");
  await approval.check();
  await expect(exportButton).toBeEnabled();
  await page.getByLabel("Resume version name").fill("Reviewed tailoring");
  await page
    .getByRole("button", { name: "▣ Save new version", exact: true })
    .click();
  await page.getByRole("button", { name: "My Resumes", exact: true }).click();
  await page.getByRole("button", { name: "Open & edit", exact: true }).click();
  await expect(approval).toBeChecked();
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
  expect(after.resumes[0].formatVersion).toBe(2);
  expect(after.resumes[0].review.digest).toMatch(/^[a-f0-9]{64}$/);
});
