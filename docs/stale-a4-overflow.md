# Recovering from A4 overflow after manual edits

## Confirmed cause

A browser reproduction on the previous implementation opened an overflowing historical resume, attempted export, shortened its project descriptions, and observed an up-to-date `A4 fit` preview while the application's global export error remained visible. The regression failed at the assertion that the old alert should disappear.

There were two distinct state problems:

- `task()` cleared errors only at the start of another task. Legacy manual edits and successful preview measurements did not clear the previous PDF overflow error.
- The export button treated a cached preview `layout.overflow` as an authoritative veto. That could prevent requesting the fresh print-window measurement. Preview layout state was not explicitly tied to the current resume object and page selection while its iframe was loading.

The audit found that valid manual edits already update the resume model. Tailored content is assembled from the current draft plus its approved source snapshot; historical manual overlays use their editable journal model. `fitPaper()` already resets its spacing variables and tries densities from scratch. The PDF function already creates a new document per attempt. There was no evidence that increasing page height, suppressing validation, or changing the template was needed.

## Changes

- Preview measurements belong to the exact resume object and one/two-page selection. New HTML mounts a fresh iframe; font callbacks from replaced documents are ignored. The resize observer also refreshes when the source changes.
- The export button retains approval, busy and profile gates, but a preview warning does not prevent a fresh export check. Each attempt renders the supplied current model into a new window, waits for document load and fonts, and invokes `fitPaper()` again. Overflow still throws before `window.print()`.
- `A4OverflowError` identifies only PDF page-limit failures. A successfully fitting preview clears that previous error; authentication and other errors remain visible. A new export task also clears old errors before performing its own validation.
- Shared `exceedsPageLimit()` uses the original conditions: one page rejects `layout.overflow`; two pages reject `height > limit * 2 - 8`. No threshold, typography, CSS or template markup changed.
- Tailored exports bind review validation and assembly to the same draft/source references. If the draft changes during asynchronous digest validation, export aborts and asks for review of the latest edits.

Empty or otherwise invalid required draft fields still fail structural validation and approval. This change does not turn incomplete input into approved facts or silently delete source information.

## Regression coverage

- Browser: historical resume overflows, export blocks, manual shortening produces a current fitting preview, old error disappears, and the exported real PDF is one A4 page with link annotations. Expanding the draft again blocks actual printing. A subsequent Access error survives successful layout revalidation.
- Browser: reviewed content-v2 resume overflows; removing selected projects clears the obsolete error, but export stays unavailable until explicit renewed review. The print document contains the new selections while saved/master records remain unchanged.
- PDF integration: remeasure the same DOM after shortening previously overflowing text; repeated fitting stays stable and the shortened model exports with searchable text and email annotations.
- Unit: original one/two-page thresholds, including the exact two-page boundary.

Run `npm test -- --maxWorkers=1`, `npm run test:legacy`, `npm run test:integration`, `npm run test:ui` and `npm run build:same-origin`. Provider calls are mocked. Nothing is deployed by these checks.
