# Resume PDF links: investigation and supported export

## Findings

The current application retains supplied HTTPS links through canonical ProfessionalProfile validation, `toJournal`, both `contentToJournal` (v2) and `resumeToJournal` (historical v1), and historical manual journal overlays. Missing optional links remain absent. No normalization or invented destination was needed for this change.

`shared/render.js` creates real anchors: `href="https://…"` for personal/general/project/certification links and `href="mailto:…"` for email. Labels and attributes are HTML escaped. Query-string ampersands and quoted labels survive correctly. Existing URL validation remains unchanged and active at the application export boundary. The template and its CSS have not changed.

`printResume` opens a local document containing the rendered HTML and invokes `window.print()`. It does not rasterize the resume, send it to a PDF service, or run the PDF through a sanitizer. The selected browser/OS print destination determines the final PDF bytes; the application cannot inspect or control those bytes through `window.print()`.

A new real-browser integration suite follows the actual print-popup code, invokes Chromium's PDF compositor on that popup, and examines `/Link` annotations with `/URI` actions. All seven supplied destination types survive exactly: email, LinkedIn, GitHub, portfolio, general profile link, project link and certification link. Tests cover approved-profile rendering, content-v2 resumes, historical-v1 resumes and historical manual overlays; A4 size and selectable text are also checked. A separate case confirms that absent links do not produce substituted destinations. Generated PDFs are retained under Playwright's test-results directory for inspection.

**No application-side URL stripping, malformed anchor or missing annotation was reproduced.** The user confirmed Chrome on Windows 11 with the built-in Save as PDF destination. A wrong printer destination is therefore not an explanation for this report. The failing PDF, Chrome version and PDF viewer are still unavailable, so the exact root cause remains unconfirmed. The managed headed browser in this workspace has PrintingEnabled=false and DisablePrintPreview=true policies; native print-preview testing was blocked without changing those controls. Headless PDF generation is available and covered. Viewer link handling and differences in the native Windows printing path remain hypotheses, not established diagnoses.

## Scoped changes while the production cause remains unresolved

The previous UI promised clickable links unconditionally and showed print-setting instructions only after the print call returned. Basic export guidance is now visible beside the export button, with a reminder to check the saved file rather than rely on preview link activation. This is a usability correction, **not a confirmed fix for the reported Windows failure**.

There is no new PDF engine, download service, template change, data migration or change to saved resumes. Headless tests stub only the OS dialog; they exercise real application popup HTML and real PDF generation/annotation parsing. They do not automate Windows printer drivers or prove behavior of every PDF viewer.

A local metadata-only checker uses the existing pdf-lib dependency:

```sh
node scripts/check-pdf-links.mjs "C:\path\to\resume.pdf"
```

It reports per-page link annotation counts, HTTPS/mailto counts, malformed actions and usable link rectangles. It never prints the filename, destination URLs, resume text or raw parser errors, and makes no network requests. It does not modify the PDF. Share only this metadata if the PDF contains personal information. Zero annotations locates the loss before/during PDF creation; valid actions and usable rectangles instead direct investigation toward viewing/activation. Counts alone do not prove that destination URLs match the approved profile; the synthetic integration tests compare those destinations exactly.

## If the reported file still has no clickable links

Record browser/version, OS, exact print destination and PDF viewer. Inspect the PDF for `/Link` annotations and their `/URI` actions. If the annotations exist with correct destinations, compare link activation in another viewer. If absent, compare a new export using the browser's built-in Save as PDF. A failing PDF may contain personal information; inspect it locally or use a synthetic reproduction rather than logging or uploading professional data without authorization.

Validation commands: `npm test -- --maxWorkers=1`, `npm run test:legacy`, `npm run test:integration`, `npm run test:ui`, `npm run build:same-origin`. The new tests are `tests/browser/pdf-links.spec.ts`; they use synthetic facts and do not call OpenAI or Cloudflare.
