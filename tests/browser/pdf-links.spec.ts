import { test, expect } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { inspectPDFLinks } from "../../scripts/check-pdf-links.mjs";
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFString,
  PDFHexString,
} from "pdf-lib";
import { profile } from "../cloudflare/fixtures";
import { verifiedProfileSchema } from "../../shared/contracts";
import { baseContent } from "../../shared/tailoring";
import { toJournal, baseResume, resumeToJournal } from "../../src/lib/adapter";
import { contentToJournal } from "../../src/lib/content-adapter";

const approved = verifiedProfileSchema.parse({
  ...profile,
  personal: {
    ...profile.personal,
    email: "alex+jobs@local.test",
    linkedin: "https://www.linkedin.com/in/alex-developer/",
    github: "https://github.com/alex-developer",
    portfolio: "https://portfolio.test/alex?view=cv&lang=en",
  },
  links: [
    {
      id: "link-general",
      label: 'Writing & "talks"',
      url: "https://writing.test/articles?tag=web&sort=new",
    },
  ],
  projects: [
    {
      id: "project-1",
      name: "Accessible tools",
      description: "Tools for accessible applications.",
      achievements: [],
      provenance: null,
      links: [
        {
          id: "project-link",
          label: 'Source & "demo"',
          url: "https://github.com/alex-developer/tools?tab=readme-ov-file&view=full",
        },
      ],
    },
  ],
  certifications: [
    {
      id: "cert-1",
      name: "Web certificate",
      issuer: "Training",
      dates: "2024",
      provenance: null,
      url: "https://credentials.test/certificates/alex",
    },
  ],
});
const expected = [
  `mailto:${approved.personal.email}`,
  approved.personal.linkedin!,
  approved.personal.github!,
  approved.personal.portfolio!,
  approved.links[0].url,
  approved.projects[0].links[0].url,
  approved.certifications[0].url!,
].sort();

for (const format of [
  "approved",
  "content-v2",
  "historical-v1",
  "historical-manual",
] as const) {
  test(`${format}: actual export popup preserves link destinations in real A4 PDF annotations`, async ({
    page,
  }, testInfo) => {
    const journal =
      format === "content-v2"
        ? contentToJournal(approved, baseContent(approved))
        : format === "historical-v1"
          ? resumeToJournal(approved, baseResume(approved))
          : toJournal(approved);
    // Historical manual overlays already contain their complete journal model.
    if (format === "historical-manual")
      journal.summary = "A historical manual summary.";
    const before = JSON.stringify(journal);
    await page.goto("/");
    await page.context().addInitScript(() => {
      window.print = () => {
        document.documentElement.dataset.printRequested = "yes";
      };
    });
    const popupPromise = page.waitForEvent("popup");
    await page.evaluate(async (journal) => {
      const { printResume } = await import("/src/lib/print.ts");
      await printResume(journal);
    }, journal);
    const popup = await popupPromise;
    await expect(popup.locator("html")).toHaveAttribute(
      "data-print-requested",
      "yes",
    );
    const destinations = await popup
      .locator("a")
      .evaluateAll((anchors) =>
        anchors.map((a) => a.getAttribute("href")).sort(),
      );
    expect(destinations).toEqual(expected);
    expect(await popup.locator("script").count()).toBe(0);
    await expect(
      popup.getByRole("link", { name: 'Writing & "talks"', exact: true }),
    ).toBeVisible();
    await popup.emulateMedia({ media: "print" });
    // Use the real popup DOM and Chromium's PDF compositor. Only the OS print
    // dialog is stubbed above; no HTML, PDF bytes or annotations are mocked.
    const bytes = await popup.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      path: testInfo.outputPath("resume-links.pdf"),
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const paper = pdf.getPage(0);
    expect(paper.getWidth()).toBeCloseTo(595.28, 0);
    expect(paper.getHeight()).toBeCloseTo(841.89, 0);
    const uris: string[] = [];
    const annotations = paper.node.Annots();
    expect(annotations).toBeDefined();
    for (const ref of annotations!.asArray()) {
      const annotation = pdf.context.lookup(ref, PDFDict);
      if (annotation.get(PDFName.of("Subtype"))?.toString() !== "/Link")
        continue;
      const action = annotation.lookup(PDFName.of("A"), PDFDict);
      expect(action.get(PDFName.of("S"))?.toString()).toBe("/URI");
      const uri = action.lookup(PDFName.of("URI"));
      expect(uri instanceof PDFString || uri instanceof PDFHexString).toBe(
        true,
      );
      uris.push((uri as PDFString).decodeText());
      const rect = annotation.lookup(PDFName.of("Rect"));
      expect(rect).toBeDefined();
    }
    expect([...new Set(uris)].sort()).toEqual(expected);
    const metadata = await inspectPDFLinks(bytes);
    expect(metadata.pages[0]).toMatchObject({
      httpsDestinations: 6,
      emailDestinations: 1,
      malformedLinkActions: 0,
    });
    expect(metadata.pages[0].usableLinkRectangles).toBe(
      metadata.pages[0].linkAnnotations,
    );
    expect(JSON.stringify(metadata)).not.toContain(approved.personal.email);
    expect(JSON.stringify(metadata)).not.toContain("https:");
    const task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    try {
      const document = await task.promise;
      const text = (await (await document.getPage(1)).getTextContent()).items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      expect(text.toLowerCase()).toContain(
        approved.personal.fullName.toLowerCase(),
      );
      expect(text).toContain(journal.summary);
      expect(text).toContain(approved.experience[0].achievements[0].text);
    } finally {
      await task.destroy();
    }
    expect(JSON.stringify(journal)).toBe(before);
    await popup.close();
  });
}

test("absent optional links do not produce substituted PDF destinations", async ({
  page,
}) => {
  const journal = toJournal({
    ...profile,
    personal: { ...profile.personal, email: "" },
  });
  await page.goto("/");
  await page.context().addInitScript(() => {
    window.print = () => {};
  });
  const popupPromise = page.waitForEvent("popup");
  await page.evaluate(async (journal) => {
    const { printResume } = await import("/src/lib/print.ts");
    await printResume(journal);
  }, journal);
  const popup = await popupPromise;
  await expect(popup.locator(".paper")).toBeVisible();
  expect(await popup.locator("a").count()).toBe(0);
  const pdf = await PDFDocument.load(
    await popup.pdf({ format: "A4", preferCSSPageSize: true }),
  );
  expect(pdf.getPage(0).node.Annots()?.size() || 0).toBe(0);
  await popup.close();
});

test("link-preserving print guidance is visible before opening the print dialog", async ({
  page,
}) => {
  await page.goto("/#builder");
  await expect(page.locator(".export-note")).toContainText("Save as PDF");
  await expect(page.locator(".export-note")).toContainText(
    "Check links in the saved file",
  );
});
