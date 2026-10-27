// Local, metadata-only inspection. No uploads, destination URLs or resume text.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFString,
  PDFHexString,
  PDFArray,
  PDFNumber,
} from "pdf-lib";
export async function inspectPDFLinks(bytes) {
  const pdf = await PDFDocument.load(bytes);
  return {
    pages: pdf.getPages().map((page, index) => {
      const result = {
        page: index + 1,
        linkAnnotations: 0,
        httpsDestinations: 0,
        emailDestinations: 0,
        otherDestinations: 0,
        malformedLinkActions: 0,
        usableLinkRectangles: 0,
      };
      for (const ref of page.node.Annots()?.asArray() || []) {
        const annotation = pdf.context.lookup(ref);
        if (
          !(annotation instanceof PDFDict) ||
          annotation.get(PDFName.of("Subtype"))?.toString() !== "/Link"
        )
          continue;
        result.linkAnnotations++;
        const action = annotation.lookup(PDFName.of("A"));
        const uri =
          action instanceof PDFDict
            ? action.lookup(PDFName.of("URI"))
            : undefined;
        if (
          action instanceof PDFDict &&
          action.get(PDFName.of("S"))?.toString() === "/URI" &&
          (uri instanceof PDFString || uri instanceof PDFHexString)
        ) {
          try {
            const url = new URL(uri.decodeText());
            if (url.protocol === "https:") result.httpsDestinations++;
            else if (url.protocol === "mailto:") result.emailDestinations++;
            else result.otherDestinations++;
          } catch {
            result.malformedLinkActions++;
          }
        } else result.malformedLinkActions++;
        const rect = annotation.lookup(PDFName.of("Rect"));
        if (rect instanceof PDFArray && rect.size() === 4) {
          const coordinates = rect
            .asArray()
            .map((value) => pdf.context.lookup(value));
          if (coordinates.every((value) => value instanceof PDFNumber)) {
            const [x1, y1, x2, y2] = coordinates.map((value) =>
              value.asNumber(),
            );
            if (
              [x1, y1, x2, y2].every(Number.isFinite) &&
              x2 > x1 &&
              y2 > y1 &&
              x2 > 0 &&
              y2 > 0 &&
              x1 < page.getWidth() &&
              y1 < page.getHeight()
            )
              result.usableLinkRectangles++;
          }
        }
      }
      return result;
    }),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3) {
    console.error(
      'Usage: node scripts/check-pdf-links.mjs "path/to/resume.pdf"',
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(
        JSON.stringify(
          await inspectPDFLinks(await readFile(process.argv[2])),
          null,
          2,
        ),
      );
    } catch {
      console.error(
        "Could not inspect the PDF. Check the local path and that the file is a readable, unencrypted PDF.",
      );
      process.exitCode = 1;
    }
  }
}
