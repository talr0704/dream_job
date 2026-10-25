# Analysis source reference contract

## Exact evidence and diagnostic ambiguity

Worker version `d90c15e8-e71a-4925-90e9-11cc9c22ff90`, request `4bf2c46c-eea3-4a72-929e-6ff214f5bb3a`, returned HTTP 422 / `UNSUPPORTED_CLAIM`, factuality source `application`, rule `invalid_source_reference`, path `requirements.4.sourceFactIds`.

This establishes that the fifth requirement failed the application's reference/status invariant before the independent model audit. It does **not** establish that an ID was invented. PR #13 deliberately grouped these three conditions under the same rule:

| Condition | Meaning |
| --- | --- |
| Any reference is absent from the supplied candidate fact map | Unknown/invented ID or a citation from another namespace |
| `status` is `met`/`partial`, but the array is empty | A claimed match has no cited evidence |
| `status` is `missing`, but the array is nonempty | A missing-evidence row incorrectly cites facts as supporting a match |

Synthetic fifth-requirement examples of all three reproduce the supplied pre-fix event. They are observationally indistinguishable in that event. Actual status, reference count and unknown-reference count were requested as metadata only; without those values or a richer event, the exact subcondition cannot be determined. No actual IDs, professional text or model output are needed or logged. The production event alone cannot support a claim that the model invented an ID.

The confirmed code-level contract defect is narrower: the provider schema accepted arbitrary reference strings with zero items allowed for every status, and the prompt said to cite existing IDs but did not explicitly require `sourceFactIds: []` for `missing`. A model could plausibly cite a job requirement/JSON path, cite a valid profile fact while describing a gap, or return an unsupported match with no references. The application rejected all those cases, correctly, but its diagnostics did not distinguish them.

## Fact ID creation, transport and validation

1. Extraction assigns stable IDs to professional records/facts. Normalized drafts require explicit user review/approval before becoming saved profiles. Manual editing/import/storage keep the existing strict profile/unique-ID checks. No new server profile database or approval mechanism is introduced.
2. Analyze-job request validation requires the approved (`verified:true`) professional profile. The same parsed profile is passed to generation and validation; IDs are not regenerated, trimmed, case-folded or translated by this pipeline.
3. `allFactEntries(profile)` creates exactly one candidate fact inventory: reserved `personal`, `headline`, `summary` keys; skill and achievement IDs; experience IDs and their achievement IDs; project IDs, achievements and link IDs; education, certification, language and general link IDs.
4. `Object.fromEntries(allFactEntries(...))` becomes `candidate.facts` in both the generation and independent audit requests. Its exact keys form the per-request provider reference constraints. Membership is checked with `Object.hasOwn`, not inherited properties or a second independently constructed ID namespace. The shared validator uses the same entries in a `Map`.
5. Profile row/version IDs are not automatically source facts. Neither job requirement IDs, job quotations, job field paths, labels nor array positions are candidate fact IDs. Only actual keys of `candidate.facts` are allowed. Existing approved opaque IDs, including non-UUID/custom IDs, remain byte-for-byte unchanged.
6. Candidate references are checked before shared scoring and the independent semantic audit. Valid IDs alone never prove that their facts entail a claim; the audit still checks every status/evidence/narrative statement against actual verified evidence and job sources.

Inspection and round-trip tests found no mismatch between the provided fact inventory and validation logic. Tests cover all fact entry families, reserved keys, opaque custom IDs, omitted profile-row IDs, job IDs, JSON paths and inherited object-property names.

## Provider contract and prompt fix

The first analysis request now supplies a request-specific provider contract with two disjoint nested `anyOf` requirement branches:

- `met`/`partial`: one to thirty references; ordinary profiles use an enum containing only exact keys from the approved profile's candidate fact map.
- `missing`: zero references, enforced by `maxItems:0`. The job description quote remains required separately and is never a candidate fact reference.

The prompt explicitly states these invariants. A missing qualification legitimately returns `status:missing`, `sourceFactIds:[]`, a sourced job requirement and honest narrative evidence such as "not evidenced in the profile". An explicitly documented shortfall may still be described accurately; it is not a supporting match citation. A row cannot claim an unsupported match just to satisfy a schema branch. Requirements and candidate facts remain separate sources.

Only the met/partial branch carries the ID enum, avoiding repeated inventories. The contract reserves capacity for status/category enum values and respects the provider's large-enum character limits. For unusually large/long inventories exceeding those limits, it retains every approved fact and uses the bounded string schema with the same strict local membership check, rather than truncating facts, fabricating aliases or sending an unsupported enum. `schemaMode` records which contract applied on failures. Typical profiles use the enum; oversized profiles can still produce invalid model references, but no such reference can pass local validation or the audit.

The generic structured-output helper now accepts an optional stricter provider schema. The received JSON still passes the original strict candidate shape, then explicit application reference checks. This intentional two-stage design means a provider/mock response violating its requested enum/branch still produces precise safe factuality diagnostics instead of bypassing checks or losing the reference failure behind a generic parse error. The provider contract and local invariant accept the same valid reference/status combinations. Other endpoint generation/validation contracts are unchanged.

No returned ID is replaced. No source citation, missing-evidence row, status or claim is silently normalized. Unknown IDs, absent evidence for matches and references attached to missing rows continue to reject the entire response. Public API/saved-analysis formats, canonical profile validation, shared scoring and independent factuality auditing remain unchanged.

## More precise safe diagnostics

The existing `invalid_source_reference` rule/path is retained. Application failures additionally include `sourceReferenceFailure` with only:

- `reasons`: allowlisted `unknown_fact_id`, `match_without_evidence`, `missing_status_with_references` (all applicable reasons, not only the first).
- `status`: validated `met`, `partial` or `missing`.
- `referenceCount` and `unknownReferenceCount`: bounded counts computed from the validated array.
- `schemaMode`: `enum` or `validated_string`.

For example, `status:missing`, `referenceCount:1`, `unknownReferenceCount:0` proves a known reference attached to a missing row; it does not indicate invented evidence. These values identify the exact future subcondition without logging any ID, source value, source quote, resume/job text, personal information or credential. Existing server request IDs, rule/path limits and logging-failure behavior remain intact.

## Retry decision

A bounded retry was considered and intentionally not added. The historical event cannot establish the intended claim or whether the status should change. Clearing a known reference might hide a classification error; selecting another valid ID might manufacture support for an unsupported claim; changing met/partial to missing would change scoring and meaning. Even a source-restricted retry would require a transparent repair policy, preservation of substantive claims and a full independent re-audit. This change prevents malformed references at first generation where possible, retains strict rejection everywhere, makes failures diagnosable, and adds no paid retry or silent repair.

## Regression verification

New tests inspect the actual first-request JSON schema and the exact fact map sent to the model, ensure every permitted key matches the approved profile inventory, exercise status-dependent constraints, and preserve all valid reference strings unchanged. Fifth-requirement fixtures distinguish unknown IDs, met/partial without evidence, missing with known references, missing with unknown references and mixed known/unknown arrays. They also test empty missing-evidence rows with role requirements absent from the candidate, large-enum fallback without truncating facts, shared-validator enforcement, semantic audit rejection despite valid IDs and unchanged IndexedDB data/history on failures.

Authentication, Access JWT validation, CORS, quotas, request limits/timeouts, approval, model store:false, privacy, public schemas, resume/extraction workflows and saved-data behavior remain unchanged. No production log access, paid OpenAI request, merge, deployment, Cloudflare setting change or secret change is included.

Local checks passed: 500 Vitest tests (`npm test -- --maxWorkers=1`), 7 legacy tests, 3 PDF integration tests, 6 Playwright workflows, strict TypeScript/Vite same-origin production build and same-origin Wrangler dry-run. Local workerd routing passed: HTML 200/two root assets, unauthenticated API 401, unknown API 404, wrong origin 403. Existing privacy, Access, canonical compatibility and Windows subprocess regressions remain passing. `git diff --check` passed.
