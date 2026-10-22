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
test("API validates input, demo roundtrip and PDF download; production requires authentication", async () => {
  let child;
  try {
    child = spawn(process.execPath, ["server/index.js"], {
      env: { ...process.env, PORT: "3011", LOCAL_DEMO: "true" },
      stdio: "pipe",
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch("http://127.0.0.1:3011/api/health")).ok) break;
      } catch {}
      await delay(100);
    }
    const post = (path, data) =>
      fetch("http://127.0.0.1:3011/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    assert.equal((await post("generate", {})).status, 400);
    assert.equal(
      (await post("generate", { profile, jobDescription: "A".repeat(80) }))
        .status,
      400,
    );
    const result = await post("generate", {
      profile: p,
      jobDescription:
        "Seeking a JavaScript developer experienced with React and Firebase.",
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).demo, true);
    const pdf = await post("pdf", { profile: p });
    assert.equal(pdf.status, 200);
    assert.equal((await pdfInfo(await pdf.arrayBuffer())).count, 1);
  } finally {
    if (child) {
      child.kill();
      await once(child, "exit");
    }
  }
  const secure = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: "3012",
      LOCAL_DEMO: "false",
      GOOGLE_CLOUD_PROJECT: "local-test",
    },
    stdio: "pipe",
  });
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch("http://127.0.0.1:3012/api/health")).ok) break;
      } catch {}
      await delay(100);
    }
    assert.equal(
      (
        await fetch("http://127.0.0.1:3012/api/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
  } finally {
    secure.kill();
    await once(secure, "exit");
  }
});
