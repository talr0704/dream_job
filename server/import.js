import mammoth from "mammoth";
import yauzl from "yauzl";
export async function extractFile(file) {
  if (!file)
    throw Object.assign(Error("Choose a PDF or DOCX file."), { status: 400 });
  if (
    file.originalname.toLowerCase().endsWith(".pdf") &&
    file.buffer.subarray(0, 5).toString() === "%PDF-"
  ) {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(file.buffer),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    try {
      const doc = await task.promise;
      if (doc.numPages > 20) throw Error("Use a resume of at most 20 pages.");
      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        text +=
          (await page.getTextContent()).items.map((x) => x.str).join(" ") +
          "\n";
        if (text.length > 60000)
          throw Error("Resume text exceeds 60,000 characters.");
      }
      if (text.trim().length < 20)
        throw Error(
          "This PDF has no readable text. Paste your information instead; scanned PDFs need OCR.",
        );
      return text;
    } finally {
      await task.destroy();
    }
  }
  if (
    file.originalname.toLowerCase().endsWith(".docx") &&
    file.buffer.subarray(0, 2).toString() === "PK"
  ) {
    await inspectZip(file.buffer);
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    if (value.trim().length < 20 || value.length > 60000)
      throw Error("DOCX must contain 20–60,000 characters of text.");
    return value;
  }
  throw Error("File content must be a PDF or DOCX matching its extension.");
}
function inspectZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error) return reject(error);
        let size = 0,
          count = 0;
        zip.on("error", reject);
        zip.on("entry", (entry) => {
          size += entry.uncompressedSize;
          count++;
          if (size > 8 * 1024 * 1024 || count > 256) {
            zip.close();
            reject(Error("DOCX expands beyond the safe import limit."));
          } else zip.readEntry();
        });
        zip.on("end", resolve);
        zip.readEntry();
      },
    );
  });
}
