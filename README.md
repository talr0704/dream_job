# dream job · local workspace + Cloudflare AI API

The approved React pixel world and professional resume template are retained. The active app uses React/Vite/TypeScript, Zod, Dexie/IndexedDB and a **stateless** Cloudflare Worker named **`dream-job-api`**. No Firebase, cloud database, profile server, or new Worker is required. The previous Express/Firebase implementation is archived under `legacy/cloud-run/` for reference. Original JS UI components remain reusable behind typed model adapters.

**Nothing has been deployed by this implementation.** The current production Hello World Worker, existing Access policy, and `OPENAI_API_KEY` secret are untouched. `wrangler deploy --dry-run` only bundles locally. GitHub Actions validates pushes; publication requires its explicit manual frontend-publish input. It never deploys the Worker.

## Local development and validation

Use Node 24 and `npm ci`. `npm run dev` opens the local browser workspace; profile editing, history, saved resumes and backups work without an API. Approve a manually entered profile to save it. AI calls need an authenticated, configured Worker. Automated tests mock all OpenAI responses; they do not spend API credits or contact the deployed Worker.

```sh
npm ci
npm test                   # Vitest: Worker, contracts, Access JWT, typed client, Dexie
npm run test:legacy        # retained renderer/model regression assertions
npm run test:integration   # Chromium: layout, searchable A4 PDF, links, one/two page limits
npm run test:ui            # Playwright: real browser + IndexedDB + mocked AI/Access responses
npm run build             # strict TypeScript check + Vite production build
npm run worker:check      # Wrangler dry run only; no deployment or resource creation
```

Chromium is packaged for Linux x64. On other systems run `npx playwright install chromium`; Linux may need `npx playwright install-deps chromium`. `CHROMIUM_EXECUTABLE_PATH` overrides the executable. In restricted cloud workspaces use `npm_config_cache=/tmp/dream-job-npm`; Wrangler can use `XDG_CONFIG_HOME=/workspace/dream_job/work/config` and `WRANGLER_SEND_METRICS=false` without writing to the home directory.

Optional `npm run worker:dev` uses local Wrangler with ignored `.dev.vars` (copy `.dev.vars.example`). It **still verifies Access JWTs** and never enables an authentication bypass. A localhost Worker is not behind the Access edge; real authenticated browser integration should be tested only on an explicitly approved protected deployment. The test suite uses injected JWT verification keys and mocked model transport instead.

## API and factual grounding

Only these four JSON endpoints are implemented:

| Endpoint | Input | Output |
| --- | --- | --- |
| `POST /api/extract-profile` | extracted/pasted text, 20–60,000 characters | unverified profile draft and warnings |
| `POST /api/analyze-job` | approved profile, description, optional company/title/HTTPS URL | requirements, evidence IDs, strengths/gaps and computed score |
| `POST /api/generate-resume` | approved profile, description, structured analysis | structured tailored resume with fact IDs |
| `POST /api/refine-resume` | approved source profile, current structured resume, requested edits | revised resume with source references |

`shared/contracts.ts` is the shared runtime/type contract. Profiles include stable IDs for experience, individual achievements, skills, projects, education, certifications, languages and links. Metadata is mapped from source records, never supplied by generated resume text. Claims cite source fact IDs; each employment/project achievement must cite its own record's facts. Numeric claims are checked against cited facts. Skill, education, certification and link IDs must be subsets of the source profile. Model output is strict OpenAI JSON Schema Structured Outputs (`store:false`), Zod-validated, then independently audited by another model request. English and factual entailment are enforced by the generation/audit instructions; model audits are fallible, so review every output. Schema and numeric checks do not prove semantic truth.

Scoring is deterministic: mandatory weight **3**, preferred weight **1**; met receives **1**, partial **0.5**, no supporting evidence **0**. The model identifies requirements and evidence; application code computes the percentage. “Missing” means evidence is absent in the submitted profile, not that the person lacks the experience. The score estimates fit, not hiring success.

Requests are bounded to 256 KiB, model calls share a 55-second deadline, the client has a 60-second timeout, and outputs are token-bounded. Error bodies use `{error:{code,message,requestId}}`. Codes include `AUTH_REQUIRED`, `ORIGIN_DENIED`, `INVALID_INPUT`, `BODY_TOO_LARGE`, `RATE_LIMITED`, `AI_RATE_LIMITED`, `AI_UNAVAILABLE`, `INVALID_AI_RESPONSE`, `UNSUPPORTED_CLAIM` and `TIMEOUT`. No profile, job, resume, token or provider error body is logged. Provider errors are sanitized.

The native `AI_RATE_LIMITER` binding allows 5 authenticated endpoint requests per 60 seconds. If the binding is missing or fails, paid requests fail closed. Cloudflare rate limiting is approximate and location-scoped, **not a billing cap**. A generation flow calls analysis then resume generation; each endpoint normally makes two model calls including audit. Configure OpenAI project model permissions, rate limits and budget notifications; monitor usage and set suitably low project limits. Provider budget notifications may not stop spending. No paid automatic retries are performed.

## Local persistence, backups and document import

Dexie stores: **`professionalProfiles`**, **`profileVersions`**, **`jobAnalyses`**, **`resumes`**, **`settings`**. Schema v2 upgrades v1 indexes without deleting data. Approved profile saves atomically append a new version; stale concurrent-tab saves are rejected. Extraction proposals remain unsaved until the user applies, reviews, approves and saves them. Profile history can be loaded for review and saved as a new version. Tailoring and refinement never mutate the master profile.

Each saved resume stores its original professional profile, generated structure with fact references, analysis, job description, page preference and separately marked manual text. Manual edits are user-authored and are not represented as independently verified AI claims. Reopen, rename/move, duplicate and delete are available in My Resumes. Saved analyses remain in `jobAnalyses`, including when later resume generation fails.

The profile screen exports a versioned `dream-job` JSON backup and imports validated backups after a count/confirmation preview. Imports use a single transaction and **add only**: any colliding profile, version, analysis, resume or setting key cancels the entire import. Existing data is never overwritten. Backup format v1 is distinct from the IndexedDB schema version. JSON is bounded to 32 MiB in the UI. Imported structures and saved manual profiles are validated before rendering.

All persisted workspace data stays in the current browser/origin. Data submitted for AI processing is sent to the Worker and OpenAI. Data is not synchronized or encrypted by Dexie. Clearing browser data/private browsing can remove it. Export a backup before switching browsers or frontend origins; import it at the new origin. Never clear the old copy until the new one has been verified. A previous localStorage profile can be explicitly loaded into the journal for approval; it is never silently imported or deleted.

PDF and DOCX text extraction runs **in the browser**, before the text is sent to extraction. Limits: 4 MiB upload, 20 PDF pages, 60,000 extracted characters, 16 MiB DOCX expanded archive and 1,000 entries. Scanned PDFs need external OCR. Archives/links are not fetched remotely.

## Access authentication and the cross-site deployment constraint

`worker/auth.ts` verifies **`Cf-Access-Jwt-Assertion`** with cached/rotating JWKS at `https://ACCESS_TEAM_DOMAIN/cdn-cgi/access/certs`, allowing RS256 only and checking signature, exact issuer, audience, expiry, issued-at and signed subject/email. It never trusts the unsigned email header. Production config is fail-closed. No Access service token or permanent auth secret is placed in the frontend.

The client uses `credentials:'include'` and `redirect:'error'`. HTML login responses, 401/403, opaque redirect/CORS failures, expiry, timeouts and 429 are handled without clearing user input. The Access sign-in button opens the API in a top-level tab; a 405 JSON response after login is expected for that GET URL. Retry the original action after sign-in. This is a convenience, **not a guarantee that a cross-site browser request can authenticate**.

**GitHub Pages → `workers.dev` is cross-site.** An Access session cookie may be blocked or partitioned as a third-party cookie, regardless of CORS or a successful top-level login. An unauthenticated preflight can be intercepted by Access before it reaches this Worker. A redirect can fail CORS or return HTML instead of JSON. Worker code cannot change Access's edge response. Do not disable Access or create a broad bypass policy to work around these problems.

Worker OPTIONS handling allows only the exact configured origin, POST and Content-Type, with credentials. If retaining GitHub Pages temporarily, inspect the existing Access application's **CORS settings** and configure its documented “bypass OPTIONS requests” preflight behavior or edge CORS handling for that exact origin, POST and Content-Type. This exempts only the browser preflight; actual POSTs still require Access authentication **and Worker JWT verification**. If preserving “all traffic including OPTIONS” is essential, use Access's edge-managed CORS response instead, or choose the same-origin option. No Access settings have been changed here. Even correctly handled preflight does not solve blocked cross-site cookies. Test real production browsers, including Safari/Firefox and third-party-cookie-blocked Chrome, before relying on the GitHub Pages topology.

**Recommended smallest reliable change:** serve the built static frontend from the **existing `dream-job-api` Worker origin**, keeping `/api/*` on that same origin. Export local backups first. `wrangler.same-origin.jsonc` is a prepared, inactive static-assets configuration. It uses the same Worker name, API source and Access audience/team; `VITE_API_URL` is empty and Vite base is `/`. Asset requests remain behind the existing Access edge; API requests additionally verify the JWT in code. The optional Wrangler asset routing serves only built static files and contains no authentication bypass. This hosting change requires separate user approval and a deploy; it has not been activated. Simply placing the frontend on a `pages.dev` hostname while keeping this `workers.dev` API would still be cross-site. Another option is frontend/API on custom subdomains under the same registrable domain with correct cookie/CORS/Access configuration, but exact same origin avoids preflights entirely.

## Required manual Cloudflare configuration and deployment

The existing endpoint is `https://dream-job-api.tal070498.workers.dev`. `wrangler.jsonc` maps directly to that existing Worker via `name: "dream-job-api"`. It has no KV, D1, R2, Durable Object or browser-rendering data binding. The native rate-limit binding stores only a rate counter keyed by the signed subject. The Worker has no application storage.

Before deployment, use the **existing** Cloudflare Access application to obtain its real audience tag and team hostname. No credentials are configured in this execution environment and these values have not been inferred. Set non-secret `vars` in `wrangler.jsonc`:

| Binding | Required value |
| --- | --- |
| `OPENAI_MODEL` | configured Structured Outputs capable model; default `gpt-4.1-mini` |
| `ALLOWED_ORIGIN` | exact deployed frontend HTTPS origin, no path/trailing slash; GitHub Pages repo path is not part of the origin |
| `ACCESS_AUD` | actual existing Access application audience tag |
| `ACCESS_TEAM_DOMAIN` | actual team hostname ending `.cloudflareaccess.com`, no scheme/path |
| `OPENAI_API_KEY` | **existing Worker secret**, never a `vars` entry or `VITE_` variable |
| `AI_RATE_LIMITER` | native rate-limit binding prepared in config; namespace 1001, 5 requests/minute |

Keep the existing Access All traffic scope, production/preview protection, account-members Allow policy and 24-hour session. Confirm the active Cloudflare account and Worker first. `wrangler secret list --name dream-job-api` can verify the secret **name** without reading its value; do not recreate it. Wrangler `keep_vars:true` preserves unrelated dashboard variables; configured local vars are still authoritative and must be filled correctly before deployment. Secrets are not defined in source and normal deploy does not replace the existing secret.

**Only after testing and explicit deployment approval**, from this repository:

```sh
npx wrangler whoami
npx wrangler secret list --name dream-job-api
npm run worker:deploy
```

The deployment wrapper refuses missing configuration/different Worker names, reruns validation and requires the exact interactive phrase `DEPLOY dream-job-api` before executing `wrangler deploy --keep-vars`. It replaces Hello World in the existing Worker; it creates no second Worker and does not alter Access policies or secrets. Never run an unreviewed deployment command from CI. Live JWT/Access edge handling, rate-limit provisioning and OpenAI Structured Outputs need a protected smoke test after the separately approved deployment.

For GitHub Pages, set the public Actions variable `VITE_API_URL` to the API origin, configure Settings → Pages → GitHub Actions, then manually run the workflow with `publish_frontend=true` only when frontend publication is approved. This does not resolve the cross-site Access constraint above.

For the separately approved **same-origin alternative**, reuse the existing configured Access bindings (do not add blank overrides), build with empty `VITE_API_URL` and `/` base, review the static asset policy and run `npm run worker:deploy -- --same-origin` only after approval. The wrapper builds with those same-origin values and selects the alternate config. Do not switch configurations without exporting the current browser's data first.

## Source map and practical limits

- `worker/`: four API routes, JWT verifier, bounded structured AI transport, factuality audit, safe errors.
- `shared/contracts.ts`: canonical profile/analysis/resume contracts, evidence and score validation.
- `src/main.tsx`, `src/lib/`: typed app orchestration/client, Dexie, model adapters, document extraction, local print export.
- `src/components/`, `src/style.css`: retained approved pixel interface; additional controls use existing styles.
- `shared/render.js`, `shared/template-css.js`, `templates/`: approved resume renderer and original supplied HTML; no AI-generated HTML.
- `tests/cloudflare/`, `tests/browser/`, `tests/integration.test.js`: mocked Vitest, Playwright workflows and Chromium PDF checks.
- `legacy/cloud-run/`: previous implementation retained for reference; inactive.

PDF export opens the approved document and uses the browser's **Save as PDF** dialog: choose A4, disable browser headers/footers, and enable background graphics. Text stays selectable and links clickable in Chromium's PDF output. The same layout function validates one/two-page overflow; no content is silently clipped or font sizes reduced. A direct headless server PDF download would require another runtime/binding and is intentionally not added to this stateless AI Worker. Other browser print engines/settings can differ; review the exported PDF. Local Chromium checks validate A4, text extraction, hyperlink annotations, overlap, one/two-page counts and overflow. The original `cv_talRozen (3).pdf` was never supplied; the original approved HTML template is present and retained unchanged.

## Recorded local validation

The final local validation completed successfully: 26 mocked Vitest tests; 7 retained model/renderer regression tests; 3 Chromium PDF integration tests; 4 Playwright browser workflows; strict TypeScript/Vite production build; API-only and optional same-origin Wrangler dry-run bundles. The local workerd smoke test returned 204 for the allowed preflight, 401 without an Access JWT, and 403 for a wrong origin. Approved source HTML, template CSS and pixel-world CSS have no changes. No paid model request, real Access login, production rate-limit provisioning, frontend publication or Worker deployment was performed.

## Same-origin production preparation

Production frontend and API origin: **https://dream-job-api.tal070498.workers.dev**. Use the existing `wrangler.same-origin.jsonc`, whose Worker name is `dream-job-api`; API requests under `/api/*` run Worker code first and other requests serve `dist/` static assets. No new Worker or route/domain registration is configured.

This config sets `ALLOWED_ORIGIN` to the production origin. It reuses the `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` already configured in `wrangler.jsonc` on main. `keep_vars:true` also preserves unrelated dashboard variables. It does not declare or replace `OPENAI_API_KEY`. The workspace has no Cloudflare credentials, so the live bindings, Worker ownership/account and Access policy cannot be independently checked here. Before an approved deploy, confirm those two existing Access bindings are present and nonempty in the existing Worker's settings. Never replace them with test values. Preserve Access All traffic protection, account-member Allow policy and preview protection. No Access bypass or policy mutation is performed by these scripts. Local workerd tests do not emulate the Cloudflare Access edge.

Preparation commands (no deployment):

```sh
npm run build:same-origin
npm run worker:check:same-origin
node scripts/deploy-worker.mjs --same-origin --print-plan
node scripts/check-same-origin.mjs
```

`build:same-origin` explicitly overrides inherited Vite settings to `VITE_API_URL=''` and `VITE_BASE_PATH='/'`. The built client therefore sends relative `/api/*` requests with credentials to the same origin. The deployment wrapper uses a JSONC-aware parser, selects this same build, and dry-runs **this same config** before any deployment prompt. The `--print-plan` command exits before running checks or deployment. Only after separate approval, `npm run worker:deploy -- --same-origin` reruns tests/build and the matching dry-run, then requires the explicit interactive deployment phrase. The original API-only configuration remains available for the existing architecture.

### Back up browser data before changing origin

1. Open the current app at its **old frontend origin** in the browser/profile where the data is stored. Open My Profile and choose **Export local backup**. Keep the downloaded `dream-job-backup-v1.json` securely; it contains personal information.
2. Verify the JSON contains `format: "dream-job"`, `version: 1` and the expected profile/version, analysis and resume arrays. Keep a second safe copy. An older Firebase backend's data is not automatically included in an IndexedDB backup; migrate that data separately if still in use.
3. After the separately approved same-origin deployment, sign in through Access at the new URL using the same browser. The new origin starts with a separate IndexedDB database; it cannot read the old origin's storage.
4. In My Profile choose **Import backup**, select the downloaded file, check the counts and confirm. Import validates the backup and cancels the whole transaction on any ID collision; it never overwrites existing records. If conflicts occur, export the new origin's data too and resolve the conflict deliberately before retrying.
5. Reopen the profile, profile history and saved resumes and verify their content. Retain the old origin's data and backup until you have confirmed the new copy. Clearing browser storage or changing browser profiles can remove local data.

A GitHub Pages origin is shared by all repositories under the same hostname; the repository path is not a distinct IndexedDB origin. The workers.dev hostname above is a separate origin, so exporting and importing is required.

Same-origin preparation validation: 27 Vitest tests, 7 regression tests, 3 PDF integration tests and 4 Playwright workflows passed. The same-origin production build and matching Wrangler dry-run passed (16 static files included). Local workerd served HTML and root JS/CSS assets with HTTP 200; unauthenticated API returned 401, unknown `/api/*` returned JSON 404 rather than SPA HTML, and a wrong origin returned 403. This verifies local routing, not the live Access edge or existing remote binding values. Nothing was deployed.

The existing Access audience/team values were found in updated GitHub main and copied unchanged into the same-origin configuration. Tests assert that both configurations use the same Access application. Live Cloudflare policy/binding state has not been independently inspected.

### Windows / Node 24 deployment commands

The deployment and same-origin build scripts invoke npm's JavaScript CLI through `process.execPath`, using npm's supplied `npm_execpath` when launched by `npm run`. Wrangler is invoked through its installed local JavaScript CLI, also through Node. They never execute `npm.cmd`/`npx.cmd` directly and never construct a `cmd.exe` or shell command string. This avoids Windows ENOENT/EINVAL behavior with command shims on Node 24 and preserves argument boundaries for paths with spaces and shell metacharacters. macOS and Linux use the same approach. Launch deployment through `npm run worker:deploy -- --same-origin`; all tests, the same-origin build and matching Wrangler dry-run complete before the approval prompt. A failed step or cancelled prompt prevents deployment.

Regression checks cover Windows-style CLI paths and literal metacharacters, real installed npm/Wrangler CLI subprocesses, validation ordering and failure/cancellation. The subprocess portability workflow runs the focused checks on Windows, macOS and Linux with Node 24; local execution in this cloud workspace tests Linux only. No Cloudflare configuration or secret changes are part of this portability fix.

Dependency audit remediation and Zod 4 compatibility details are documented in [docs/dependency-security.md](docs/dependency-security.md). The full audit includes development tooling; run `npm ci` followed by `npm audit` to reproduce.

Extraction error flow, safe diagnostics, error codes and the limits of the production investigation are documented in [docs/extraction-investigation.md](docs/extraction-investigation.md). Report the displayed request reference and safe diagnostic metadata when investigating failures; never share resume text, raw model output, credentials or headers.
