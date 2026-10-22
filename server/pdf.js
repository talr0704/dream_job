import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import packagedChromium from "@sparticuz/chromium";
import { resumeDocument, fitPaper } from "../shared/render.js";
let browserPromise;
export async function getBrowser() {
  if (!browserPromise)
    browserPromise = (async () => {
      const packaged = process.platform === "linux" && process.arch === "x64";
      const browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.CHROMIUM_EXECUTABLE_PATH ||
          (packaged ? await packagedChromium.executablePath() : undefined),
        args: packaged
          ? packagedChromium.args.filter((arg) => arg !== "--single-process")
          : ["--no-sandbox"],
      });
      browser.on("disconnected", () => { browserPromise = null; });
      return browser;
    })().catch((e) => {
      browserPromise = null;
      throw e;
    });
  return browserPromise;
}
export async function exportPDF(profile, twoPages = false) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.route("**/*", (route) => route.abort());
    await page.setContent(
      resumeDocument(profile, { pages: twoPages ? "two" : "one" }),
    );
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(fitPaper);
    if (layout.overflow && !twoPages) {
      const error = new Error(
        "Resume exceeds one A4 page. Request a concise version or choose two pages.",
      );
      error.status = 422;
      throw error;
    }
    if (twoPages && layout.height > layout.limit * 2 - 8) {
      const error = new Error(
        "Content exceeds two pages. Shorten the resume before exporting.",
      );
      error.status = 422;
      throw error;
    }
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    const doc = await PDFDocument.load(pdf);
    if (doc.getPageCount() > (twoPages ? 2 : 1)) {
      const error = new Error(
        "Rendered PDF exceeds the selected page count. Shorten content before exporting.",
      );
      error.status = 422;
      throw error;
    }
    return pdf;
  } finally {
    await page.close();
  }
}
export async function closeBrowser() {
  if (browserPromise) {
    await (await browserPromise).close();
    browserPromise = null;
  }
}
