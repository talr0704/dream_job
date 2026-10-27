import {
  resumeDocument,
  fitPaper,
  exceedsPageLimit,
} from "../../shared/render.js";
export class A4OverflowError extends Error {
  constructor() {
    super(
      "Content exceeds the selected A4 page limit. Shorten the resume before exporting.",
    );
    this.name = "A4OverflowError";
  }
}
export async function printResume(profile: any, twoPages = false) {
  // Keep real anchors and selectable HTML text; the selected browser/print
  // destination controls the final PDF annotations. Instructions precede export.
  // No server receives the document.
  const win = window.open("", "_blank");
  if (!win) throw Error("Allow a print window to export your PDF.");
  try {
    win.document.open();
    win.document.write(
      resumeDocument(profile, { pages: twoPages ? "two" : "one" }),
    );
    win.document.close();
    // document.close() starts loading the new document. fonts.ready alone can
    // refer to an unfinished document; wait for that document's load first.
    if (win.document.readyState !== "complete")
      await new Promise<void>((resolve) =>
        win.addEventListener("load", () => resolve(), { once: true }),
      );
    await win.document.fonts.ready;
    const layout = (win as Window & { Function: FunctionConstructor }).Function(
      "return (" + fitPaper.toString() + ")()",
    )();
    if (exceedsPageLimit(layout, twoPages)) throw new A4OverflowError();
    win.focus();
    win.print();
  } catch (e) {
    win.close();
    throw e;
  }
}
