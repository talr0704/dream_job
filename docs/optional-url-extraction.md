# Optional URL extraction boundary

## Production evidence and root cause

Worker version `1c341475-c71f-4c65-9333-bec0a559f28b`, request `14521ab6-3624-4f71-9897-60ea29358ec1`, returned HTTP 502 with `INVALID_AI_RESPONSE`. The provider returned HTTP 200, `finishReason:stop`, `refused:false`; the extraction's `zod_validation` failed at `profile.personal.portfolio` with `invalid_format` and `custom`.

This identifies a non-null portfolio candidate failing the URL-format and public HTTPS checks. The actual candidate is unknown and is neither needed nor logged. Synthetic `N/A` reproduces exactly those two validation codes using the unchanged canonical validator. A nullable URL permits null, but does not permit an empty string or another invalid string. PR #9 applied tolerance only to LinkedIn; portfolio, GitHub and certification URLs still rejected the whole extraction. This was a local validation failure, not a refusal, provider schema rejection, truncation or HTTP method failure.

## Complete inventory and scope

The canonical professional profile has exactly these nullable URL locations:

| Location | Extraction policy |
| --- | --- |
| `personal.linkedin` | Existing personal LinkedIn HTTPS domain/path policy, plus shared placeholder checks |
| `personal.portfolio` | Existing public HTTPS URL policy, plus shared placeholder checks |
| `personal.github` | Existing public HTTPS URL policy, plus shared placeholder checks |
| `certifications[].url` | Existing public HTTPS URL policy, plus shared placeholder checks; retain certification record |

The inventory regression walks the canonical JSON Schema and requires this list, so adding another nullable URL requires reviewing this boundary. GitHub/portfolio/certification URLs have no new hostname whitelist. LinkedIn retains PR #9's domain and personal-profile path rules. No destination is fetched or followed.

`profile.links[].url` and `projects[].links[].url` are required values in professional link records. They stay strict: no record or label is dropped to hide an invalid URL. `jobUrl` belongs to the separate analyze-job request; it is not part of extraction and remains strict. Email, phone, location, dates and provenance are not URLs and are not normalized.

## Flow and preservation

1. Document text extraction and client input handling are unchanged.
2. The prompt and shared extraction schema describe the four nullable URL locations: copy valid supplied HTTPS URLs exactly, otherwise null; never infer, repair or fabricate a URL. Preserve certification facts even when its URL is blank.
3. After model JSON parsing, immediately before full Zod validation, the Worker copies the draft and normalizes only these four locations using the shared field validators. Missing, null, wrong-type, malformed, unsupported or explicit placeholder candidates become null. The source object is not mutated. Missing containers, array shapes and records are never synthesized or removed.
4. The full strict extraction schema still validates every record and field. Native JSON Schema generation, normalization validators, Worker final response validation and typed client validation all use the same extraction contract. Required nullable properties are retained in the provider schema. Local refinements such as HTTPS and placeholder checks are enforced after generation; the provider cannot represent every Zod refinement.
5. The independent factuality audit receives the normalized draft. Failed audits still reject extraction. A normalized optional URL cannot conceal an invalid non-URL fact.
6. After a successful audit, fixed review warnings identify blank LinkedIn/portfolio/GitHub locations and blank certification URLs. Certification warnings are aggregated to keep all categories within the 50-warning limit, even with 30 certifications and 50 model warnings. No rejected URL, record name, source quote or personal data is inserted into system warnings or logs. Original malformed model warnings still fail validation.
7. Drafts remain `verified:false`. Existing saved profiles and version history are unchanged until explicit user approval. The browser retains the submitted source text for review; warning text directs the user to review omitted URLs before saving. No professional records, names, achievements, IDs or provenance are discarded by this normalization.

Accepted URL strings are preserved exactly, including host case, paths, query parameters and fragments. No trimming, scheme insertion, username guessing, URL expansion or canonicalization occurs. Explicit placeholder checks cover documentation domains (`example.com`, `.org`, `.net`, including subdomains), `.invalid`, template tokens such as `<name>`/`{username}` and explicit placeholder/your-domain/your-website/your-portfolio/your-url path or host segments. These checks identify explicit templates; they do not prove ownership or exhaustively identify every invented URL. Factuality auditing and user approval remain required.

The canonical `professionalProfileSchema`, canonical URL validator, saved-profile/import rules and other endpoint contracts are unchanged. Invalid unnormalized extraction responses still fail the typed client validator. All required fields, unknown-field rejection, bounds, unique fact IDs, non-URL validations, required link URLs, grounding checks, Access JWT validation, CORS, quotas, timeouts and privacy-safe diagnostics remain strict.

## Verification

Synthetic regressions exercise all four locations with valid, omitted, null, empty, malformed, placeholder, unsupported-protocol, credential-bearing, loopback, wrong-type and overlong values; exact preservation of valid strings; canonical rejection of malformed values; required/non-URL failures; complete schema inventory; normalized audit input; refusal of unsupported facts; bounded safe review warnings; and unchanged IndexedDB profiles/history before approval.

No deployment, paid model call, Cloudflare configuration change or secret change is part of this fix.

Local checks passed: 280 Vitest tests (including canonical compatibility, privacy, Access and Windows subprocess regressions), 7 legacy tests, 3 PDF integration tests, 5 Playwright workflows, strict TypeScript and Vite same-origin production build, and same-origin Wrangler dry-run. The PDF suite was rerun separately after an initial shared Chromium extraction race (`ETXTBSY`) while both browser suites initialized concurrently; it passed without code changes.
