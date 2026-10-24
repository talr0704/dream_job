import { unzipSync } from "fflate";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
export async function extractDocumentText(file: File): Promise<string> {
  if (file.size > 4 * 1024 * 1024)
    throw Error("Resume files must be at most 4 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
    const doc = await task.promise;
    try {
      if (doc.numPages > 20) throw Error("Maximum 20 PDF pages.");
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        text += content.items.map((x: any) => x.str || "").join(" ") + "\n";
        if (text.length > 60000)
          throw Error("Maximum extracted text is 60,000 characters.");
      }
    } finally {
      await task.destroy();
    }
  } else if (/\.docx$/i.test(file.name)) {
    let expanded = 0;
    let entries = 0;
    const files = unzipSync(bytes, {
      filter: (e) => {
        expanded += e.originalSize;
        entries++;
        if (expanded > 16 * 1024 * 1024 || entries > 1000)
          throw Error("DOCX archive is too large.");
        return e.name === "word/document.xml";
      },
    });
    if (!files["word/document.xml"]) throw Error("Invalid DOCX document.");
    const xml = new DOMParser().parseFromString(
      new TextDecoder().decode(files["word/document.xml"]),
      "application/xml",
    );
    if (xml.querySelector("parsererror")) throw Error("Invalid DOCX XML.");
    text = Array.from(xml.getElementsByTagNameNS("*", "p"))
      .map((p) =>
        Array.from(p.getElementsByTagNameNS("*", "t"))
          .map((t) => t.textContent)
          .join(""),
      )
      .join("\n");
  } else throw Error("Choose a PDF or DOCX file.");
  if (text.trim().length < 20)
    throw Error("No readable text found. Scanned PDFs need OCR.");
  if (text.length > 60000)
    throw Error("Maximum extracted text is 60,000 characters.");
  return text.trim();
}
