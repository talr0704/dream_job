import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { getBrowser, closeBrowser } from "../server/pdf.js";
test("browser workflow: confirm profile, generate, edit, export, mobile preview", async () => {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("http://127.0.0.1:5173");
    await page.getByText("Local demo · no AI").waitFor();
    await page
      .frameLocator("iframe")
      .getByRole("heading", { name: "tal rozen", exact: true })
      .waitFor();
    await page.getByLabel("I reviewed and confirm").check();
    await page
      .getByLabel("Job description", { exact: true })
      .fill(
        "Seeking a frontend developer with JavaScript, React, Firebase, user onboarding and web development experience.",
      );
    await page.getByRole("button", { name: /Analyze & Generate/ }).click();
    await page
      .getByText("Local preview — no AI analysis", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Edit resume", exact: true })
      .click();
    await page
      .getByLabel("Headline", { exact: true })
      .fill("Technical Solutions Developer");
    await page
      .getByRole("button", { name: "Done editing", exact: true })
      .click();
    await page
      .frameLocator("iframe")
      .getByText("Technical Solutions Developer", { exact: true })
      .waitFor();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download PDF/ }).click();
    const file = await download;
    assert.equal(file.suggestedFilename(), "tal-rozen-resume.pdf");
    await mkdir("artifacts", { recursive: true });
    await file.saveAs("artifacts/ui-resume.pdf");
    await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "No horizontal viewport overflow",
    );
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await closeBrowser();
  }
});
