# dream job

A local resume workspace with a pixel-art interface and a professional A4 export. React/Vite/TypeScript runs in the browser; the existing stateless Cloudflare Worker `dream-job-api` handles AI requests.

## Workflow

1. Import professional information or enter it manually. Review, approve and save your profile.
2. Paste a job description and generate a tailored resume. Fit analysis is optional and does not block generation. Editing the job description clears its displayed analysis.
3. Compare changed wording with approved facts. Expand unchanged or omitted items when needed. Save a draft copy at any time; review is required before export and edits clear that review.
4. Choose **Print / Save as PDF**, then your browser’s Save as PDF option: A4, no headers or footers, background graphics enabled.

Generation and refinement each use one structured AI call. Protected facts come from the approved profile. Automated guards help flag unsupported changes; human review remains necessary. See [evidence-ranked tailoring](docs/evidence-ranked-tailoring.md) for the current composition pipeline and [workflow boundaries](docs/simplified-architecture.md) for persistence and compatibility.

## Run and validate

Use Node 24 and `npm ci`.

```sh
npm run dev                  # browser workspace; local features work without AI
npm run build                # TypeScript + production build
npm test                     # mocked API, contracts and storage tests
npm run test:legacy          # model/renderer regression tests
npm run test:ui              # browser workflows with mocked AI
npm run test:integration     # Chromium A4/PDF checks
npm run worker:check:same-origin # local bundle only
```

AI requires the configured Worker and Cloudflare Access authentication. Tests mock provider responses and do not spend API credits. Chromium is packaged for Linux x64; other platforms need Playwright Chromium or `CHROMIUM_EXECUTABLE_PATH`.

## Storage and backups

Profiles, history, analyses and saved resume copies stay in this browser and origin, in IndexedDB. They are not synchronized. AI requests send submitted information to the Worker and OpenAI.

Use **My Profile → Export local backup** before clearing browser data or changing browsers/origins. Current exports are `dream-job-backup-v2.json`, with `format: "dream-job"` and `version: 2`. Imports accept v1 and v2, validate the entire backup and add records atomically; any key collision cancels the import without overwriting existing data. Verify the imported profile and resumes before removing the old copy.

## Deployment and maintenance

The same-origin configuration serves frontend and `/api/*` from the existing `dream-job-api` Worker. Prepare locally with `npm run build:same-origin` and `npm run worker:check:same-origin`. Deployment is a separate explicit action; these checks do not publish anything. Preserve existing Access protection and secrets.

- [Deployment details and historical validation](docs/implementation-history.md)
- [Dependency maintenance](docs/dependency-security.md)
- [Safe extraction diagnostics](docs/extraction-investigation.md)
- [PDF links and export](docs/pdf-link-export.md)

`src/` contains the interface and browser storage, `worker/` the authenticated AI API, and `shared/` contracts, guards and rendering. The inactive previous backend is under `legacy/cloud-run/`.
