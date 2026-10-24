# Dependency security remediation

No deployment or Cloudflare settings/secret changes are included in this change.

## Findings and exposure

The reproduced npm audit reported four distinct advisory records across **five affected package entries** (3 high, 2 moderate), rather than the four packages originally reported. Transitive packages inherit findings in npm's totals.

| Dependency before remediation | Exposure | Remediation |
| --- | --- | --- |
| `zod@3.25.76` | Production: browser profile/backup validation and Worker request/model validation | Upgrade to `zod@4.6.7`, above the advisory's `4.6.6` fixed floor |
| `zod-to-json-schema@3.25.2 → zod` | Production schema generation; inherits the Zod finding | Remove the converter and use Zod 4's native `z.toJSONSchema` |
| `wrangler@4.152.0 → miniflare@5.20261019.2-beta → undici@7.29.1` | Development/deployment tooling and local Worker emulation; not bundled in the static app or deployed Worker | Scoped `miniflare` override to patched `undici@7.30.1` |

Zod advisory: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), memory exhaustion while validating oversized constrained collections. Undici advisories: [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685), [GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472), and [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c), covering EventSource memory exhaustion, integrity-check handling and content-encoding error handling. The existing Access gate/body limits reduce some exposure; they do not substitute for dependency patches.

At investigation time the latest Wrangler was still 4.152.0 and pinned the vulnerable Undici through Miniflare. No supported parent update resolving this chain was available. The override stays within Undici 7.x rather than adopting the latest Undici 8 major, and only applies beneath Miniflare. Undici 7.30.1 supports Node >=20.18.1, compatible with the project's Node 24 requirement. Local workerd routing, actual Wrangler subprocess invocation and the same-origin bundle were tested with the override. Revisit/remove the override when Wrangler/Miniflare ships its own patched dependency. No `npm audit fix --force`, advisory suppression or omission of development dependencies was used to obtain a clean full audit.

## Validation and API compatibility

All active imports use the patched Zod 4 API; there is no production fallback to `zod/v3`. The archived Cloud Run implementation remains historical source, outside the active runtime/build.

- Export the original unrefined profile object explicitly, replacing removed Zod 3 `innerType()` calls. Strict objects, incomplete drafts, confirmation gates, duplicate IDs, evidence grounding, URL restrictions and bounded collections remain in place.
- Native JSON Schema generation uses input semantics and retains the existing OpenAI strict-schema checks. URL constraints still run in Zod; the unsupported `uri` format and dialect marker are omitted from provider schemas as before. No live paid model request is used for tests.
- Preserve Zod 3's optional unknown-valued metadata/settings fields explicitly; Zod 4 otherwise makes unknown-valued object properties required.
- Accept minute-precision UTC timestamps as well as second/fractional UTC timestamps, matching the previous schemas. Offsets and invalid calendar dates remain rejected.
- Preserve the previous finite-integer semantics for unbounded version/source-index fields, while keeping integer JSON Schema types. Scores retain their bounded 0–100 integer checks.

`tests/cloudflare/contract-compatibility.json` contains **64 acceptance/parsed-output cases captured from the original Zod 3 implementation before upgrading**. They cover canonical and legacy profiles, drafts, all four endpoint inputs, resumes, defaults, backups, unknown fields, ID/array limits, emails, URLs and timestamps. The comparison tests and existing factual-grounding, storage and browser tests verify the migration. Additional checks cover integer compatibility and strict JSON Schema structure. Human-readable internal Zod diagnostics may differ between majors; the application's structured API error envelopes and codes are unchanged.

Windows deployment portability remains covered by simulated Windows paths/metacharacters, real npm/Wrangler JavaScript CLI subprocesses, and validation-before-approval/cancellation tests. The helper still uses `process.execPath`, argument arrays and `shell:false`. The existing Windows/macOS/Linux Node 24 CI matrix remains enabled; cloud-workspace execution is Linux, not a native Windows result.

## Reproduction

```sh
npm ci
npm audit
npm audit --omit=dev
npm ls zod zod-to-json-schema wrangler miniflare undici
npm test
npm run test:legacy
npm run test:integration
npm run test:ui
npm run build:same-origin
npm run worker:check:same-origin
node scripts/check-same-origin.mjs
```

A clean `npm ci`, full audit and production-only audit completed with **0 vulnerabilities** after the dependency updates. The scoped override and exact resolved versions are recorded in `package-lock.json`. Audit results reflect the advisory database at execution time; no audit filters are committed.

Final local results: 98 Vitest tests (including the 64 pre-upgrade cases and Windows subprocess tests), 7 legacy regression tests, 3 PDF integration tests and 4 Playwright workflows passed. TypeScript/Vite same-origin production build and Wrangler dry-run passed. Local workerd static/API routing smoke checks also passed during remediation. Full and production-only audits both reported zero vulnerabilities. No paid AI calls or live deployment were performed.
