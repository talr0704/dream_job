// Fixed synthetic profile only. Default: deterministic retrieval, no API calls.
// --live explicitly permits at most three sequential, token-bounded model calls.
import { createServer } from "vite";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parse } from "jsonc-parser";
const live = process.argv.includes("--live");
if (process.argv.slice(2).some((arg) => arg !== "--live"))
  throw Error(
    "Use no arguments for offline evaluation, or --live for three synthetic provider calls.",
  );
if (live && !process.env.OPENAI_API_KEY) {
  console.error(
    "Live evaluation requires OPENAI_API_KEY in the secure local environment. No calls made.",
  );
  process.exit(1);
}
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { planTailoring } = await server.ssrLoadModule("/shared/evidence.ts");
  const { evidenceProfile, engineCases } = await server.ssrLoadModule(
    "/tests/cloudflare/evidence.fixture.ts",
  );
  const { tailorFromEvidence } = await server.ssrLoadModule(
    "/worker/evidence-tailoring.ts",
  );
  const config = parse(
    await readFile(
      new URL("../wrangler.same-origin.jsonc", import.meta.url),
      "utf8",
    ),
  );
  let calls = 0;
  const providerUsage = [];
  await mkdir("artifacts", { recursive: true });
  const results = [];
  for (const sample of engineCases) {
    const plan = planTailoring(evidenceProfile, sample.job);
    const selected = plan.experience[0].facts.map((f) => f.id);
    const row = {
      role: sample.role,
      precisionAt3:
        selected.filter((id) => sample.gold.includes(id)).length /
        selected.length,
      selectedFactIds: selected,
      headline: plan.headline,
      skills: plan.skillIds.map(
        (id) => evidenceProfile.skills.find((s) => s.id === id).text,
      ),
      projectDetails: plan.projects.map((p) => ({
        projectId: p.projectId,
        sourceFactIds: p.facts.map((f) => f.id),
      })),
      priorities: plan.priorities,
    };
    if (live) {
      let provider;
      const fetcher = async (url, init) => {
        if (++calls > 3) throw Error("Evaluation call limit reached");
        const body = JSON.parse(init.body);
        body.max_completion_tokens = 2000;
        const response = await fetch(url, {
          ...init,
          body: JSON.stringify(body),
        });
        const envelope = await response
          .clone()
          .json()
          .catch(() => ({}));
        provider = {
          status: response.status,
          model: envelope.model,
          usage: envelope.usage,
        };
        providerUsage.push({ role: sample.role, ...provider });
        // Keep usage even if a later call/validation fails; never log error bodies.
        await writeFile(
          "artifacts/evidence-provider-usage.json",
          JSON.stringify({ calls, providerUsage }, null, 2),
        );
        if (response.ok && envelope.choices?.[0]?.finish_reason === "stop") {
          try {
            provider.draft = JSON.parse(envelope.choices[0].message.content);
          } catch {}
        }
        return response;
      };
      const result = await tailorFromEvidence(
        {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          OPENAI_MODEL: config.vars.OPENAI_MODEL,
        },
        evidenceProfile,
        sample.job,
        undefined,
        undefined,
        AbortSignal.timeout(55000),
        fetcher,
        {
          requestId: crypto.randomUUID(),
          endpoint: "generate-resume",
          operation: "generate",
          log: () => {},
        },
      );
      const rawBullets = provider.draft.experience.flatMap((e) => e.bullets);
      const returned = result.content.experience.flatMap((e) => e.bullets);
      const originals = new Map(
        evidenceProfile.experience
          .flatMap((e) => e.achievements)
          .map((f) => [f.id, f.text]),
      );
      row.live = {
        model: provider.model,
        usage: provider.usage,
        rawDraft: provider.draft,
        guarded: result.content,
        warnings: result.warnings,
        copiedBullets: rawBullets.filter(
          (b) => b.text === originals.get(b.sourceAchievementIds[0]),
        ).length,
        rewrittenBullets: rawBullets.filter(
          (b) => b.text !== originals.get(b.sourceAchievementIds[0]),
        ).length,
        restoredBullets: rawBullets.filter(
          (b) =>
            returned.find(
              (r) => r.sourceAchievementIds[0] === b.sourceAchievementIds[0],
            )?.text !== b.text,
        ).length,
      };
    }
    results.push(row);
  }
  const report = {
    method:
      "Capability-labelled synthetic evidence coverage; not a proof of free-text entailment or live-model quality",
    live,
    model: config.vars.OPENAI_MODEL,
    calls,
    maximumOutputTokens: live ? 6000 : 0,
    cost: live ? null : 0,
    costNote:
      "No price assumed. For live mode use returned usage and current account-specific pricing; billed cost is not exposed by chat completions.",
    results,
  };
  await mkdir("artifacts", { recursive: true });
  const path = live
    ? "artifacts/evidence-live-evaluation.json"
    : "artifacts/evidence-evaluation.json";
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        path,
        calls,
        live,
        results: results.map((r) => ({
          role: r.role,
          precisionAt3: r.precisionAt3,
          headline: r.headline.text,
          skills: r.skills,
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    "Evaluation stopped: " +
      (typeof error?.code === "string" && /^[A-Z_]+$/.test(error.code)
        ? error.code
        : "EVALUATION_FAILED") +
      ". No automatic retry was made.",
  );
  process.exitCode = 1;
} finally {
  await server.close();
}
