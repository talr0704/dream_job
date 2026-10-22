import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { getBrowser, closeBrowser } from "../server/pdf.js";
const origin = "http://127.0.0.1:5179",
  apiOrigin = "http://127.0.0.1:3020";
async function ready(url) {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await delay(100);
  }
  throw Error("Server did not start: " + url);
}
async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await once(child, "exit");
}
async function loadReference(page) {
  let html = await readFile(
    "templates/dream_job_interactive_concept.html",
    "utf8",
  );
  const font = await readFile(
    "node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2",
  );
  const dm = await readFile(
    "node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2",
  );
  html = html.replace(
    /@import url\([^\n]+\);/,
    `@font-face{font-family:'Press Start 2P';src:url(data:font/woff2;base64,${font.toString("base64")})}@font-face{font-family:'DM Sans';src:url(data:font/woff2;base64,${dm.toString("base64")})}`,
  );
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
}
test("pixel world, journal, matching, builder, immutable inventory, proposal review and responsive screenshots", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dream-job-ui-"));
  const api = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: "3020",
      LOCAL_DEMO: "true",
      DEMO_STORE_PATH: join(dir, "store.json"),
      ALLOWED_ORIGIN: origin,
    },
    stdio: "ignore",
  });
  const vite = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5179",
      "--strictPort",
    ],
    { env: { ...process.env, VITE_API_URL: apiOrigin }, stdio: "ignore" },
  );
  let browser, testPage;
  try {
    await ready(apiOrigin + "/api/health");
    await ready(origin);
    browser = await getBrowser();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
    });
    testPage = page;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const nav = (name) =>
      page.getByRole("navigation").getByRole("button", { name, exact: true });
    const noOverflow = async () =>
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "No horizontal viewport overflow",
      );
    await mkdir("artifacts", { recursive: true });
    await page.goto(origin);
    await page.getByText("Local demo · no AI", { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "artifacts/pixel-home-desktop.png",
      fullPage: true,
    });
    assert.equal(await page.locator(".island").count(), 4);
    assert.equal(
      await page
        .locator(".hero-title")
        .evaluate((e) =>
          getComputedStyle(e).fontFamily.includes("Press Start 2P"),
        ),
      true,
    );
    await noOverflow();
    const textStyles = await page
      .locator("body *")
      .evaluateAll((nodes) =>
        nodes
          .filter(
            (n) =>
              n.getBoundingClientRect().width &&
              [...n.childNodes].some(
                (x) => x.nodeType === 3 && x.textContent.trim(),
              ),
          )
          .map((n) => ({
            tag: n.tagName,
            font: parseFloat(getComputedStyle(n).fontSize),
            color: getComputedStyle(n).color,
          })),
      );
    assert.ok(
      textStyles.every((s) => s.font >= 17),
      "Website text is at least 17px",
    );
    assert.ok(
      textStyles.every((s) => {
        const channels = s.color.match(/\d+/g)?.map(Number) || [];
        return !channels.slice(0, 3).every((c) => c > 190);
      }),
      "No white or light-gray website text",
    );
    const reference = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
    });
    await loadReference(reference);
    await reference.screenshot({
      path: "artifacts/reference-home-desktop.png",
      fullPage: true,
    });
    await reference
      .getByRole("navigation")
      .getByRole("button", { name: "My Profile", exact: true })
      .click();
    await reference.screenshot({
      path: "artifacts/reference-journal-desktop.png",
      fullPage: true,
    });
    await reference.close();
    await nav("My Profile").click();
    await page.getByText("tal rozen", { exact: true }).waitFor();
    await page.screenshot({
      path: "artifacts/pixel-journal-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Edit Personal details", exact: true })
      .click();
    await page
      .getByLabel("Professional title", { exact: true })
      .fill("Technical Solutions Developer");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page.getByLabel("I reviewed and confirm").check();
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await page
      .getByText("Journal saved. Existing saved resumes are unchanged.")
      .waitFor();
    await page.reload();
    await page
      .getByText("Technical Solutions Developer", { exact: true })
      .waitFor();
    assert.ok(await page.getByLabel("I reviewed and confirm").isChecked());
    await page
      .getByRole("button", { name: "Edit Work experience", exact: true })
      .click();
    await page
      .getByRole("button", { name: "+ Add work experience", exact: true })
      .click();
    await page.getByLabel("Job title 2", { exact: true }).fill("Test role");
    await page.getByLabel("Company 2", { exact: true }).fill("Test company");
    await page.getByLabel("Employment dates 2", { exact: true }).fill("2025");
    await page
      .getByLabel("Responsibilities — one per line 2", { exact: true })
      .fill("Verified test responsibility.");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page.getByText("2 roles", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Edit Work experience", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove work experience", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page.getByLabel("I reviewed and confirm").check();
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await page
      .getByText("Journal saved. Existing saved resumes are unchanged.")
      .waitFor();
    await nav("Job Match").click();
    await page
      .getByLabel("Job description", { exact: true })
      .fill(
        "Seeking a frontend developer with JavaScript, React, Firebase, user onboarding and web development experience.",
      );
    await page.getByRole("button", { name: /Analyze & Generate/ }).click();
    await page
      .getByRole("heading", {
        name: "Local preview — no AI analysis",
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: "artifacts/pixel-match-desktop.png",
      fullPage: true,
    });
    await nav("CV Builder").click();
    await page
      .frameLocator("iframe")
      .getByRole("heading", { name: "tal rozen", exact: true })
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
      .getByLabel("Resume version name", { exact: true })
      .fill("Frontend · Acme");
    await page.getByLabel("Collection", { exact: true }).fill("Applications");
    await page.getByRole("button", { name: /Save new version/ }).click();
    await page
      .getByText(
        "New version saved to My Resumes. Earlier versions remain unchanged.",
      )
      .waitFor();
    let downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download PDF/ }).click();
    const pdf = await downloading;
    assert.equal(pdf.suggestedFilename(), "tailored-resume.pdf");
    await pdf.saveAs("artifacts/pixel-resume.pdf");
    await page.screenshot({
      path: "artifacts/pixel-builder-desktop.png",
      fullPage: true,
    });
    await nav("My Profile").click();
    await page
      .getByRole("button", { name: "Edit Personal details", exact: true })
      .click();
    await page
      .getByLabel("Professional title", { exact: true })
      .fill("Updated current profile title");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page.getByLabel("I reviewed and confirm").check();
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await page
      .getByText("Journal saved. Existing saved resumes are unchanged.")
      .waitFor();
    await nav("My Resumes").click();
    await page
      .getByRole("heading", { name: "Frontend · Acme", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Open & edit", exact: true })
      .click();
    await page
      .frameLocator("iframe")
      .getByText("Technical Solutions Developer", { exact: true })
      .waitFor();
    await nav("My Resumes").click();
    await page.getByRole("button", { name: "Organize", exact: true }).click();
    await page
      .getByLabel("Collection name", { exact: true })
      .fill("Interviews");
    await page
      .getByRole("button", { name: "Save organization", exact: true })
      .click();
    await page.getByText("Collection updated.", { exact: true }).waitFor();
    await page.reload();
    await page
      .getByRole("heading", { name: "Frontend · Acme", exact: true })
      .waitFor();
    await page.getByLabel("Search resumes", { exact: true }).fill("Acme");
    await page
      .getByLabel("Collection", { exact: true })
      .selectOption("Interviews");
    await page.screenshot({
      path: "artifacts/pixel-library-desktop.png",
      fullPage: true,
    });
    // Only this proposal response is a test fixture. It does not exercise live OpenAI.
    const current = await (
      await fetch(apiOrigin + "/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).json();
    const proposed = {
      ...current,
      confirmed: false,
      summary: "A reviewed profile proposal from the browser test fixture.",
    };
    await page.route("**/api/profile/propose", (route) =>
      route.fulfill({ json: proposed }),
    );
    await nav("My Profile").click();
    await page
      .getByText("Import a resume or propose a profile update", {
        exact: false,
      })
      .click();
    await page
      .getByLabel("Professional information or updates", { exact: true })
      .fill("Please update my professional summary using the supplied facts.");
    await page
      .getByRole("button", { name: "Propose profile updates", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Review proposed profile" })
      .waitFor();
    await page
      .getByRole("button", { name: "Discard proposal", exact: true })
      .click();
    assert.equal(
      await page.getByText(proposed.summary, { exact: true }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Propose profile updates", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Apply proposed profile", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("I reviewed and confirm").isChecked(),
      false,
    );
    await page.getByLabel("I reviewed and confirm").check();
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await page
      .getByText("Journal saved. Existing saved resumes are unchanged.")
      .waitFor();
    for (const width of [768, 390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await nav("Home").click();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `artifacts/pixel-home-${width}.png`,
        fullPage: true,
      });
      await noOverflow();
      await nav("My Profile").click();
      await page.screenshot({
        path: `artifacts/pixel-journal-${width}.png`,
        fullPage: true,
      });
      await noOverflow();
      const sizes = await page.locator(".page").evaluateAll((nodes) =>
        nodes.map((n) => ({
          width: n.getBoundingClientRect().width,
          top: n.getBoundingClientRect().top,
        })),
      );
      assert.ok(
        sizes[1].top > sizes[0].top,
        "Journal pages stack on mobile/tablet",
      );
      await nav("CV Builder").click();
      await page
        .frameLocator("iframe")
        .getByRole("heading", { name: "tal rozen", exact: true })
        .waitFor();
      await page.screenshot({
        path: `artifacts/pixel-builder-${width}.png`,
        fullPage: true,
      });
      await noOverflow();
      await page
        .getByRole("button", { name: "Actual size", exact: true })
        .click();
      await noOverflow();
      await page.getByRole("button", { name: "Fit page", exact: true }).click();
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await nav("Home").click();
    assert.equal(
      await page
        .locator(".cloud")
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    assert.deepEqual(errors, []);
    await page.close();
  } catch (error) {
    if (testPage) {
      await testPage.screenshot({
        path: "artifacts/ui-failure.png",
        fullPage: true,
      });
      console.log(
        "Failure screen:",
        (await testPage.locator("body").innerText()).slice(0, 5000),
      );
    }
    throw error;
  } finally {
    await closeBrowser();
    await stop(vite);
    await stop(api);
    await rm(dir, { recursive: true, force: true });
  }
});
