# Simplified resume builder

This change targets the existing same-origin `dream-job-api` Worker. It does not deploy, merge, modify Cloudflare settings, recreate secrets, or change the approved template. Authentication, restricted origins, JWT verification, quotas, body limits, deadlines, provider `store:false` and privacy-safe diagnostics remain in place.

## Active workflow and contract

1. Extract document text in the browser. One structured-output call returns professional facts and warnings. Application code assigns profile metadata; the proposal remains unverified until explicit profile approval.
2. Send `{formatVersion:2, profile, jobDescription}` to `/api/generate-resume`. Analysis is not an input.
3. Exactly one structured-output call produces the content below. The provider receives necessary professional facts and stable IDs, without personal contact details or application metadata.
4. Validate structure, selections and references; apply focused rewrite guards; return `{formatVersion:2, content, warnings}`.
5. Assemble the existing renderer model from protected approved facts and validated content. Show original achievements beside rewrites, including omitted selections. Explicit review is required for PDF export. Saving an unreviewed draft remains possible.

```json
{
  "summary": "English professional summary",
  "skillIds": ["approved-skill-id"],
  "experience": [
    {
      "experienceId": "approved-experience-id",
      "bullets": [
        {
          "sourceAchievementIds": ["approved-achievement-id"],
          "text": "Rewritten achievement"
        }
      ]
    }
  ],
  "projects": [
    {
      "projectId": "approved-project-id",
      "description": "Relevant project description"
    }
  ]
}
```

`sourceAchievementIds` must contain exactly one ID today. Its array shape permits future combinations of approved achievements from the same experience without changing stored structure; that capability is not enabled now. No generated identity, employment title, employer, dates, degree, certification, contact or link fields exist in this contract. Those fields are copied from the approved snapshot. Reordering and explicit content selections do not delete source facts.

Refinement sends `{formatVersion:2, profile, content, instructions}` to `/api/refine-resume`, follows the same one-call path, and clears review. Legacy generate/refine request shapes still use the existing protected legacy path, including its independent audit; the current frontend does not use that path for new resumes.

## Factuality boundaries

Unknown, duplicate or wrong-parent source IDs, malformed structure, empty required summary, unsupported selection IDs and multiple source achievements per bullet reject the output. Guards compare each bullet only with its referenced achievement, projects with their approved project, and summary with approved professional information. New numeric claims/units, selected qualification or leadership terms, URLs/emails and HTML trigger a warning and restoration of the approved source wording. No extra model call or automatic retry occurs. Manual edits that fail these guards cannot be approved until corrected; they are not silently replaced.

These deterministic checks are intentionally focused, not a proof of semantic entailment. A plausible but unsupported paraphrase without a detectable new metric or protected term can escape them. Conservative guards can also restore a legitimate rewrite. Source comparison and explicit human review are essential. The approved profile remains unchanged; tailored-resume review does not approve a new source-profile version. The review digest binds the canonical source snapshot and content; any content edit clears it. A digest is an integrity check, not authentication or factual proof.

## Optional analysis

`worker/job-analysis.ts` makes one call for requirement classification and evidence IDs. Requirements must be present in the submitted job description. Existing-reference, status/evidence and scoring checks remain deterministic. Candidate narratives are derived from approved facts and static explanatory text; no free-form AI candidate biography is emitted. Missing means **not evidenced in this profile**, not proven absence. Scoring remains mandatory weight 3, preferred weight 1; met 1, partial 0.5, missing 0.

Status classification is an AI estimate, not independently verified semantic entailment. Optional analysis errors do not mutate source profiles or resumes and do not block generation. Users can generate without requesting analysis at all.

## Simplified and preserved components

Removed the active assessment-policy module, multi-model assessment review, source-reference repair/revision loops, and tests tied to those retired protocols. Extraction no longer uses a second semantic-audit request; its full canonical validation, URL normalization, warnings and approval boundary remain. The generic legacy audit remains only for old resume-write compatibility. Historical investigation documents describe prior implementations, not the new primary workflow.

Preserved the React pixel-art interface, document import limits, professional HTML/CSS template, existing A4/selectable-text/link PDF renderer, protected canonical schemas, shared profile approval storage, Access verification, rate limits, sanitized errors, indexed stores, profile versioning, backup collision protection and legacy readers/manual overlays. No framework or cloud database was added.

## Data migration and rollback

No destructive IndexedDB migration is performed: the existing five stores and DB schema versions remain. New resumes have `formatVersion:2`; historical resume records retain their original structure and manual edits. Saved source snapshots and stable record IDs are preserved. Backup exports use version 2 containing both formats; imports accept versions 1 and 2, validate all records, and use an atomic add-only transaction. Any conflicting key rejects the entire import.

Before updating or switching origins, export a JSON backup from the profile screen, keep a separate copy, and verify its contents/counts. Data is browser/origin-local: download the backup at the old origin, sign into the new protected origin, import into an empty workspace, and verify profiles, versions and resumes before deleting anything. Never clear the old origin as part of deployment.

Roll back only to a build retaining version-2 readers, review support and both backup readers, or disable new generation while retaining those readers. An older pre-change app cannot safely edit new-format records or import v2 backups. Keep the pre-change backup for an isolated recovery workspace; do not import it over existing records. Existing v1 records remain readable without conversion.

## Acceptance checks and trade-offs

Automated coverage verifies one-call generation/refinement and extraction, independent optional analysis, authenticated/quota rejection before provider use, strict ID/parent checks, immutable-fact assembly, guarded rewrites, canonical extraction failures, mixed-format backups, atomic collisions, manual-history preservation, review invalidation and reopen, original/rewrite comparison, template rendering and PDF layout. All provider responses in tests are synthetic; no paid calls are used.

Normal tailoring eliminates prerequisite analysis and independent auditing: one provider call instead of analysis plus generation/audit/revision requests. This reduces failure surfaces, expected latency and token spend; no measured production latency or cost claim is made. The trade-off is reduced semantic automation, made visible through focused guards and mandatory user review. Historical clients retain their old audit cost until retired explicitly.
