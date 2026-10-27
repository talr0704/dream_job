import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { writeFile, mkdir } from "node:fs/promises";
import profile from "../shared/profile.json" with { type: "json" };
import { exportPDF, closeBrowser, getBrowser } from "../server/pdf.js";
import { resumeDocument, fitPaper } from "../shared/render.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const p = { ...profile, confirmed: true };
after(closeBrowser);
async function pdfInfo(buffer) {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const text = (await page.getTextContent()).items.map((x) => x.str).join(" ");
  const links = (await page.getAnnotations()).filter(
    (x) => x.subtype === "Link",
  );
  const result = {
    count: doc.numPages,
    width: page.view[2],
    height: page.view[3],
    text,
    links,
  };
  await task.destroy();
  return result;
}
test("short, medium and long layouts retain all text; overflow requires explicit opt in", async () => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  for (const [name, summary] of [
    ["short", "Technical solutions developer."],
    ["medium", p.summary],
    ["long", Array(18).fill(p.summary).join(" ")],
  ]) {
    await page.setContent(resumeDocument({ ...p, summary }));
    const layout = await page.evaluate(fitPaper);
    assert.equal(
      await page.locator(".section:first-child .content").textContent(),
      summary,
    );
    if (name === "long") {
      assert.ok(layout.overflow);
      await assert.rejects(exportPDF({ ...p, summary }), /exceeds one/);
    } else {
      assert.equal(layout.overflow, false, name);
      const box = await page.locator(".section").evaluateAll((nodes) =>
        nodes.map((n) => ({
          top: n.getBoundingClientRect().top,
          bottom: n.getBoundingClientRect().bottom,
        })),
      );
      for (let i = 1; i < box.length; i++)
        assert.ok(box[i].top >= box[i - 1].bottom - 1);
    }
  }
  await page.close();
});
test("PDF is one A4 page with searchable text and real clickable links", async () => {
  const pdf = await exportPDF(p);
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/resume.pdf", pdf);
  const info = await pdfInfo(pdf);
  assert.equal(info.count, 1);
  assert.ok(Math.abs(info.width - 595.28) < 1);
  assert.ok(Math.abs(info.height - 841.89) < 1);
  assert.match(info.text, /tal rozen/);
  assert.match(info.text, /MINDPLAY/);
  assert.match(info.text, /HOLON/);
  assert.ok(
    info.links.some((x) => x.url?.includes("linkedin.com/in/tal-rozen-")),
  );
  assert.ok(info.links.some((x) => x.url?.startsWith("mailto:")));
});
test("moderate overflow exports two pages only when requested", async () => {
  const longer = { ...p, summary: Array(4).fill(p.summary).join(" ") };
  await assert.rejects(exportPDF(longer), /exceeds one/);
  const info = await pdfInfo(await exportPDF(longer, true));
  assert.equal(info.count, 2);
  assert.ok(info.text.includes("Technical solutions"));
});

test("fitPaper resets prior overflow after text edits and the shortened model exports one A4 page", async () => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(
      resumeDocument({ ...p, summary: Array(18).fill(p.summary).join(" ") }),
    );
    assert.equal((await page.evaluate(fitPaper)).overflow, true);
    await page.locator(".section:first-child .content p").evaluate((node) => {
      node.textContent = "Technical solutions developer.";
    });
    const recovered = await page.evaluate(fitPaper);
    assert.equal(recovered.overflow, false);
    const repeated = await page.evaluate(fitPaper);
    assert.ok(Math.abs(repeated.height - recovered.height) < 1);
    assert.equal(repeated.overflow, false);
    const info = await pdfInfo(
      await exportPDF({ ...p, summary: "Technical solutions developer." }),
    );
    assert.equal(info.count, 1);
    assert.ok(info.text.includes("Technical solutions developer."));
    assert.ok(info.links.some((link) => link.url?.startsWith("mailto:")));
  } finally {
    await page.close();
  }
});
