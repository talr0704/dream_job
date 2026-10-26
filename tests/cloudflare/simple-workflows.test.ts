import { it, expect, vi } from "vitest";
import { profile, env, identity, mockAI } from "./fixtures";
import { createWorker } from "../../worker/index";
import { DreamJobClient } from "../../src/lib/api";
import { baseContent } from "../../shared/tailoring";
import { DreamJobDB } from "../../src/lib/storage";
it("extracts professional data in one call and assigns approval metadata in application code", async () => {
  const raw: any = structuredClone(profile);
  for (const key of ["id", "version", "verified", "updatedAt"]) delete raw[key];
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI({ profile: raw, warnings: [] }));
  const w = createWorker({ authenticate: identity, fetcher, log: () => {} });
  const client = new DreamJobClient("https://api.test", async (url, init) =>
    w.fetch(new Request(url, init), env),
  );
  const result = await client.extractProfile({
    text: "Alex Example is a software developer using TypeScript and building accessible applications.",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.profile.verified).toBe(false);
  expect(result.profile.version).toBe(1);
  expect(result.profile.id).toMatch(/^[a-f0-9-]{36}$/);
  expect(result.profile.experience).toEqual(profile.experience);
  const req = JSON.parse(fetcher.mock.calls[0][1].body);
  for (const field of ["id", "version", "verified", "updatedAt"])
    expect(
      req.response_format.json_schema.schema.properties.profile.properties,
    ).not.toHaveProperty(field);
  const db = new DreamJobDB("extract-review-" + crypto.randomUUID());
  try {
    await expect(db.approveProfile(result.profile, false)).rejects.toThrow(
      /approval/,
    );
    expect(await db.professionalProfiles.count()).toBe(0);
  } finally {
    await db.delete();
  }
});
const requirement = (
  id: string,
  requirement: string,
  status: string,
  sourceFactIds: string[],
) => ({
  id,
  requirement,
  mandatory: true,
  category: "technical",
  status,
  sourceFactIds,
});
it("optional analysis uses one call and derives candidate narratives only from approved facts", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      mockAI({
        requirements: [
          requirement("r1", "TypeScript", "met", ["skill-1"]),
          requirement("r2", "AWS certification", "missing", []),
        ],
      }),
    );
  const w = createWorker({ authenticate: identity, fetcher, log: () => {} }),
    client = new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    );
  const r = await client.analyzeJob({
    profile,
    jobDescription:
      "Required: TypeScript. Required: AWS certification. Work on accessible applications.",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(r.score).toBe(50);
  expect(r.strengths).toEqual(["TypeScript"]);
  expect(r.gaps).toEqual(["AWS certification"]);
  expect(r.requirements[1].evidence).toContain("Not evidenced");
  expect(r.experienceAlignment).toContain("estimate");
});
it("an optional analysis failure cannot block a subsequent one-call tailoring request", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      mockAI({
        requirements: [requirement("r1", "TypeScript", "met", ["made-up"])],
      }),
    )
    .mockResolvedValueOnce(mockAI(baseContent(profile)));
  const w = createWorker({ authenticate: identity, fetcher, log: () => {} }),
    client = new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    );
  const input = {
    profile,
    jobDescription:
      "Required: TypeScript development and accessible application experience.",
  };
  await expect(client.analyzeJob(input)).rejects.toMatchObject({
    code: "INVALID_AI_RESPONSE",
  });
  expect((await client.tailorResume(input)).formatVersion).toBe(2);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("the new format remains protected by authentication and quotas before any provider call", async () => {
  for (const auth of [false, true]) {
    const fetcher = vi.fn();
    const w = createWorker({
      ...(auth ? { authenticate: identity } : {}),
      fetcher,
      log: () => {},
    });
    const r = await w.fetch(
      new Request("https://api.test/api/generate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formatVersion: 2,
          profile,
          jobDescription:
            "Seeking a TypeScript developer with application delivery experience.",
        }),
      }),
      { ...env, AI_RATE_LIMITER: { limit: async () => ({ success: false }) } },
    );
    expect(r.status).toBe(auth ? 429 : 401);
    expect(fetcher).not.toHaveBeenCalled();
  }
});
