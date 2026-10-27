import { it, expect } from "vitest";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectPDFLinks } from "../../scripts/check-pdf-links.mjs";
it("local PDF diagnostics distinguish missing annotations from usable links without exposing destinations", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const annotation = (uri: string, rect = [1, 1, 20, 20]) =>
    pdf.context.register(
      pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: rect,
        A: { S: "URI", URI: PDFString.of(uri) },
      }),
    );
  page.node.set(
    PDFName.of("Annots"),
    pdf.context.obj([
      annotation("https://private.test/personal-name"),
      annotation("mailto:private@private.test"),
      annotation("not a URL"),
      annotation("https://private.test/off-page", [9000, 9000, 9020, 9020]),
    ]),
  );
  pdf.addPage();
  const summary = await inspectPDFLinks(await pdf.save());
  expect(summary.pages[0]).toEqual({
    page: 1,
    linkAnnotations: 4,
    httpsDestinations: 2,
    emailDestinations: 1,
    otherDestinations: 0,
    malformedLinkActions: 1,
    usableLinkRectangles: 3,
  });
  expect(summary.pages[1].linkAnnotations).toBe(0);
  expect(JSON.stringify(summary)).not.toMatch(
    /private|personal-name|https:|mailto:/,
  );
});
it("the CLI fails safely without printing personal filenames or parser errors", () => {
  const script = fileURLToPath(
    new URL("../../scripts/check-pdf-links.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [script, "missing-private-resume-name.pdf"],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Could not inspect the PDF");
  expect(result.stderr).not.toMatch(/private-resume|ENOENT|stack/i);
});
