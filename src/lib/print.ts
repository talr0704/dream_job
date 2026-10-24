import { resumeDocument, fitPaper } from "../../shared/render.js";
export async function printResume(profile: any, twoPages = false) {
  // Browser print-to-PDF keeps text and links; no server receives the document.
  const win = window.open("", "_blank");
  if (!win) throw Error("Allow a print window to export your PDF.");
  try {
    win.document.open();
    win.document.write(
      resumeDocument(profile, { pages: twoPages ? "two" : "one" }),
    );
    win.document.close();
    await win.document.fonts.ready;
    const layout = (win as Window & { Function: FunctionConstructor }).Function(
      "return (" + fitPaper.toString() + ")()",
    )();
    if (
      (!twoPages && layout.overflow) ||
      (twoPages && layout.height > layout.limit * 2 - 8)
    )
      throw Error(
        "Content exceeds the selected A4 page limit. Shorten the resume before exporting.",
      );
    win.focus();
    win.print();
  } catch (e) {
    win.close();
    throw e;
  }
}
