# Dream Job · AI Resume Studio

A React/Vite frontend for GitHub Pages with a separate authenticated Node/Express API on Google Cloud Run. Firebase Authentication protects the API; OpenAI generates structured drafts; Playwright renders the supplied resume design to searchable, linked A4 PDFs. Cloud Run is used instead of Cloud Functions to provide a predictable Chromium container runtime. GitHub Pages serves only static frontend assets.

## Supplied sources and accuracy

- `templates/resume_template_dynamic_v5.html` is the unmodified approved source template.
- **`cv_talRozen (3).pdf` was not supplied.** No PDF reference or original project/portfolio URLs could be extracted.
- `shared/profile.json` contains draft facts transcribed from the supplied HTML, not independently verified background. Confirm each fact and the existing LinkedIn URL; add actual project, GitHub, and Figma URLs before sharing. No fake project URLs are exported.
- The frontend fetches this profile from the authenticated API rather than bundling it into Pages assets. This repository and the original template still contain personal information: keep the repository private if that information should remain private. GitHub Pages availability for private repositories depends on your GitHub plan. Pages content itself is a public shell and contains no profile data.
- AI can rephrase, reorder skills, and emphasize existing facts. Dates, companies, education, contacts and links are merged from the profile. Source references, exact skill membership, numerical-claim checks, schema validation, and a second AI factuality audit gate generated output. AI audits are fallible; review all claims before exporting. Manual edits are your responsibility.

## Local development

Use Node 24 and npm. Each cloud task already has an isolated checkout; use the existing checkout, without creating a worktree.

```sh
cd /workspace/dream_job
npm ci
npm test
npm run test:integration
npm run build
```

Linux x64 uses integrity-checked Chromium packaged in `@sparticuz/chromium`; no separate browser download is needed. Other operating systems: `npx playwright install chromium` (and `npx playwright install --with-deps chromium` on Linux if using the standard browser instead). `CHROMIUM_EXECUTABLE_PATH` can select a compatible installed browser. npm cache can be relocated with `npm_config_cache=/tmp/dream-job-npm` in restricted cloud workspaces.

For a complete **local demo without credentials**, run in separate terminals:

```sh
LOCAL_DEMO=true npm start
npm run dev
```

The demo binds the API to loopback only. It returns the existing profile unchanged and explicitly does **not** analyze job fit or call AI. Confirm profile facts in the UI, paste a description (40–18,000 characters), generate a demo, edit text, and download a real Chromium PDF. Never deploy with `LOCAL_DEMO=true`. Offline mode supports manual JSON profile entry and preview, but generation and PDF export require the API.

Run `npm run test:ui` while these two servers are running for the browser workflow test. Test artifacts are generated under ignored `artifacts/`.

## Production configuration

1. Create a Firebase/Google Cloud project with billing, enable Firebase Authentication's Google provider, and create a Firestore **Native mode** database. Add your Pages domain (e.g. `talr0704.github.io`) under Firebase Authentication authorized domains. Create a web app to obtain the public Firebase configuration.
2. Install Google Cloud SDK and Firebase CLI outside this project as appropriate. Sign in with `gcloud auth login` and `firebase login`, then select your project. For local authenticated API development use `gcloud auth application-default login` and `GOOGLE_CLOUD_PROJECT`.
   For local authenticated configuration, copy `.env.example` to ignored `.env` and set the backend and public frontend settings; `npm start` and Vite load it automatically. Never use `VITE_` for secrets.

3. Deploy deny-all client Firestore rules with `firebase deploy --only firestore:rules --project YOUR_PROJECT`. Only the backend's Admin SDK reads/writes usage counters. Optionally enable Firestore TTL on the `usage` collection's `expiresAt` field to clean expired counters; quota enforcement does not depend on TTL.
4. Enable APIs and create a dedicated runtime service account:

```sh
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com --project YOUR_PROJECT
gcloud iam service-accounts create resume-api --project YOUR_PROJECT
gcloud projects add-iam-policy-binding YOUR_PROJECT --member=serviceAccount:resume-api@YOUR_PROJECT.iam.gserviceaccount.com --role=roles/datastore.user
gcloud projects add-iam-policy-binding YOUR_PROJECT --member=serviceAccount:resume-api@YOUR_PROJECT.iam.gserviceaccount.com --role=roles/firebaseauth.viewer
```

5. Create the secret `resume-openai-key` in Google Secret Manager and enter your OpenAI key **securely through the Cloud Console**. Do not put keys in shell history or frontend environment variables. Grant `resume-api@YOUR_PROJECT.iam.gserviceaccount.com` `roles/secretmanager.secretAccessor` on that secret. Pin a numbered secret version in deployment (the example uses version 1).
6. Deploy the container from this directory (replace the example project, email, region and origin):

```sh
gcloud run deploy resume-api --source . --project YOUR_PROJECT --region europe-west1 --allow-unauthenticated --service-account resume-api@YOUR_PROJECT.iam.gserviceaccount.com --set-secrets OPENAI_API_KEY=resume-openai-key:1 --set-env-vars 'GOOGLE_CLOUD_PROJECT=YOUR_PROJECT,ALLOWED_EMAILS=YOUR_GOOGLE_EMAIL,ALLOWED_ORIGIN=https://talr0704.github.io,OPENAI_MODEL=gpt-4.1-mini,LOCAL_DEMO=false' --memory 2Gi --cpu 1 --concurrency 2 --max-instances 1 --timeout 180
```

Cloud Run accepts public transport so browsers can reach it; **all sensitive routes verify Firebase ID tokens**, verified email, and the exact email allowlist. An empty allowlist denies everyone. Origin restriction is additional browser protection, not authentication. Production quota enforcement uses atomic Firestore transactions (20 generation/export requests per user per hour) plus a process-local limiter. The API fails closed when quota storage is unavailable. Set Google Cloud/OpenAI billing budgets as an additional cost safeguard. Each generation uses two bounded model requests; a concise retry also consumes quota. Resume/job content is sent to OpenAI only for generation and the factuality review. PDF rendering makes no external network requests.

7. Set GitHub repository **Actions variables**, not OpenAI credentials:

| Variable                    | Value                                             |
| --------------------------- | ------------------------------------------------- |
| `VITE_API_URL`              | Cloud Run HTTPS service origin, no trailing slash |
| `VITE_FIREBASE_API_KEY`     | Firebase web API key (public project identifier)  |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase project's auth domain                    |
| `VITE_FIREBASE_PROJECT_ID`  | Firebase project ID                               |

In repository Settings → Pages, choose **GitHub Actions**. Push to `main` or manually run the Pages workflow. It runs unit and browser/PDF integration tests, builds with the repository base path, and deploys the frontend. Backend deployment is separate and manual. Neither this implementation nor a local successful build publishes the application.

## Profile and editing

The Profile tab edits validated JSON: identity/contact details, summary, exact skills, employment with stable IDs and responsibilities, projects and links, education, and verified achievements. Dates are text to preserve the supplied format. Entries must use unique IDs. Links must be real HTTPS URLs without credentials. Email is rendered as `mailto:`. Stored URLs are never generated by AI. Profile data is kept in browser local storage, not a backend database. On shared machines, use Reset local profile to remove the stored profile. Tailored drafts stay in memory; export before reloading.

The Edit resume panel edits every AI-writable field: headline, summary, skills, experience bullets, project descriptions. Contact and education edits belong in Profile. Saving a profile resets analysis and the tailored draft so stale generated data is not attached to changed facts.

## Layout and PDF behavior

Preview and export use `shared/render.js` and the original template CSS. Content grows naturally, with measured comfortable → balanced → compact spacing and bounded whitespace distribution. Approved type sizes remain fixed. One-page exports reject overflow with HTTP 422. Request a concise AI rewrite (retains all records and bullets), edit manually, or explicitly permit two pages. Content beyond two A4 pages is rejected. No content is silently clipped. Preview uses browser fonts; the deployment container uses its system sans-serif fonts, so use the generated PDF as the final visual reference across operating systems.

## Validation

- `npm test`: profile/generation schemas, scoring, skill/evidence/numeric gates, safe URLs, immutable metadata, HTML escaping.
- `npm run test:integration`: short/medium/long layout, overlap and overflow, single-page and two-page PDF output, A4 dimensions, extracted text, hyperlink annotations, API input errors, demo roundtrip and missing-auth rejection.
- `npm run test:ui`: real browser profile confirmation, generation, edits, PDF download, responsive layout and console errors (requires local demo and Vite).
- Live OpenAI, real Firebase login, Firestore transactions, Cloud Run build/deploy and GitHub Pages publication require your external project configuration and are not proven by local demo tests.

## Project map

`src/` frontend · `shared/` schemas, factual profile, renderer and approved CSS · `server/` auth, quotas, AI and PDF API · `templates/` original reference · `tests/` unit, PDF, API and browser tests · `.github/workflows/pages.yml` Pages deployment.
