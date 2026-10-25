# Project link extraction boundary

Historical PR #11 scope. The subsequent [complete extraction contract audit](extraction-contract-audit.md) extends the same candidate handling to general profile links; canonical saved-profile rules remain strict.

## Confirmed production failure

Worker version `cce4f5c0-937c-4446-a955-fe4e7b14ac84`, request `f8e3d864-5fa3-48d0-95bc-b1b1bdfa2d2c`, failed `POST /api/extract-profile` with `INVALID_AI_RESPONSE` during `zod_validation`. The provider returned HTTP 200 with `finishReason:stop`; ten reported issues at `profile.projects.[].links.[].url` alternate between `invalid_format` and `custom`.

The evidence identifies malformed non-null project URL candidates failing URL-format and public HTTPS validation. The private candidate values are unknown and are not needed or logged. Five synthetic `N/A` candidates reproduce ten issues with the unchanged canonical validator. This does not establish which private project or candidate strings were involved.

PR #10 normalized only nullable scalar URLs. Project link records still had a required URL even though a project's link collection is optional (an empty array is valid). A malformed candidate therefore rejected the whole draft before the independent factuality audit. The generated strict Structured Outputs schema describes strings and bounds but omits the unsupported `uri` format; custom HTTPS/placeholder checks are necessarily local. Provider HTTP 200 and `stop` cannot guarantee local URL validity.

## Two explicit contracts

`professionalProfileSchema` remains the strict canonical contract. Its field definitions, required URLs, non-URL checks and acceptance behavior are unchanged. The existing profile checks were factored into a shared function so both canonical profiles and extraction candidates enforce unique fact IDs and approval prerequisites. Canonical compatibility regressions remain required.

`extractionCandidateSchema` is the provider-facing extraction contract. Only `projects[].links[].url` additionally allows null to represent an unusable optional candidate. Records still require IDs, nonempty labels, valid structure and original collection limits. The prompt instructs the model to return an empty project link array when there are no valid supplied links, retain valid labels and URLs exactly, and preserve technologies, descriptions and accomplishments in project facts rather than only in link labels. The URL property remains required and nullable in Structured Outputs; the defensive boundary also handles an omitted URL in a candidate record.

`extractResponseSchema` is the final Worker/client contract. Retained project links require valid, non-placeholder HTTPS URLs; null or invalid URLs cannot escape into the response. Extraction project link labels are validated without trimming so valid supplied labels are preserved exactly, including surrounding whitespace. Blank or overlong labels still fail. Canonical approval/storage keeps its original label validation and trimming behavior.

## Parsing and normalization sequence

1. Browser PDF/DOCX extraction, pasted source text and typed request validation are unchanged.
2. `structuredSchema(extractionSchema)` generates the supported candidate JSON Schema. Other operations retain their own original schemas. Prompt and candidate URL description agree: no URL inference, repair or fabrication; preserve project facts.
3. After model JSON parsing, existing personal/certification URL normalization runs. Project candidate URLs are independently checked with the shared extraction HTTPS/placeholder validator. Missing, malformed, placeholder, unsupported, wrong-type or null URL candidates become null. Valid strings are copied exactly; no destination is fetched or followed.
4. The entire candidate profile is validated before removing records. Missing/malformed project containers, invalid IDs/labels, unknown fields, duplicate global IDs (including candidates that would be removed), more than ten links per project, malformed original warnings and all unrelated errors still fail. A null/primitive link record is not a valid candidate and remains rejected. Normalization does not synthesize IDs, labels, arrays, project records or facts.
5. Only validated candidate records with null URLs are removed from project link arrays. Valid links retain IDs, labels, exact URLs and order. Project records, descriptions, technologies represented in those descriptions/skills, achievements, provenance and all other facts are retained. The input object is never mutated.
6. A deterministic warning identifies each affected project by its one-based position, for example `Project 2: invalid or missing optional links were removed...`. The original project order is preserved. Warnings contain no project names, labels, URLs, quotes or IDs; no sensitive content is logged. Up to ten project warnings are prioritized within the existing fifty-warning bound, alongside existing scalar URL warnings. Original malformed or excessive warnings fail before truncation.
7. The full strict final response schema validates the cleaned draft. The independent factuality audit then checks the cleaned draft and its surviving links against the submitted source; unsupported project claims still reject extraction. Existing safe failure diagnostics remain unchanged.
8. Responses remain `verified:false`. No saved master profile or version history changes until explicit user review and approval. Original source text remains available for review in the browser. This fix removes optional unusable link candidates, not professional facts from project descriptions or achievements.

## Other URL collections audited

A regression inventories every URL location in the canonical profile:

| Location | Behavior |
| --- | --- |
| `projects[].links[].url` | Optional candidate collection; remove only validated records whose URLs are unusable during extraction |
| `links[].url` | Standalone professional link record URL stays required and strict; no filtering |
| `personal.linkedin`, `personal.portfolio`, `personal.github` | PR #10 extraction-only nullable scalar normalization unchanged |
| `certifications[].url` | PR #10 extraction-only scalar normalization unchanged; certification record retained |

There are no other nested optional URL collections in this profile contract. The separate analyze-job request's `jobUrl`, generation/refinement contracts, canonical backup/import/save validation and other required URL paths are unchanged. Authentication/JWT validation, CORS, quotas, timeouts, secrets and privacy-safe diagnostics are unchanged.

## Regression coverage

Tests reproduce the five-candidate/ten-issue failure and exercise multiple invalid links; mixed valid/invalid arrays; exact labels/URLs and ordering; empty project arrays and projects with empty link arrays; missing URL values; placeholders; unsupported protocols; credentials; loopback; wrong types; overlong values; full project fact/provenance preservation; ordinal warnings for all ten projects despite fifty model warnings; strict malformed record and duplicate-ID rejection before filtering; supported provider schema versus strict final response; the complete URL inventory; audit input/failure behavior; unchanged IndexedDB profiles/history; and safe logging.

No paid OpenAI calls, deployment, merge, Cloudflare configuration change or secret change is included.

Validation passed locally: 312 Vitest tests (including canonical compatibility, privacy, Access and Windows subprocess regressions), 7 legacy tests, 3 PDF integration tests, 5 Playwright workflows, strict TypeScript/Vite same-origin production build and same-origin Wrangler dry-run. Local workerd routing checks passed: static HTML 200 with two root assets, unauthenticated API 401, unknown API 404 and wrong origin 403. `git diff --check` passed.
