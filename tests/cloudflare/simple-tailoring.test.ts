import { it, expect, vi } from "vitest";
import { profile, env, identity, mockAI } from "./fixtures";
import {
  baseContent,
  validateContent,
  guardContent,
} from "../../shared/tailoring";
import { contentToJournal } from "../../src/lib/content-adapter";
import { createWorker } from "../../worker/index";
import { DreamJobClient } from "../../src/lib/api";
function setup(raw: unknown = baseContent(profile)) {
  const fetcher = vi.fn().mockResolvedValueOnce(mockAI(raw));
  const w = createWorker({ authenticate: identity, fetcher, log: () => {} });
  return {
    fetcher,
    client: new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    ),
  };
}
it("normal tailoring and explicit refinement each use exactly one provider call without analysis", async () => {
  const before = structuredClone(profile);
  const { client, fetcher } = setup();
  const result = await client.tailorResume({
    profile,
    jobDescription:
      "Looking for a TypeScript developer with accessible application experience.",
  });
  expect(result.formatVersion).toBe(2);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(payload.store).toBe(false);
  expect(payload.messages[1].content).not.toContain(profile.personal.email);
  expect(payload.messages[1].content).not.toContain(profile.personal.fullName);
  expect(JSON.parse(payload.messages[1].content)).not.toHaveProperty(
    "analysis",
  );
  const second = setup();
  await second.client.refineContent({
    profile,
    content: result.content,
    instructions: "Make wording concise",
  });
  expect(second.fetcher).toHaveBeenCalledTimes(1);
  expect(profile).toEqual(before);
  const view = contentToJournal(profile, result.content);
  expect(view.name).toBe(profile.personal.fullName);
  expect(view.headline).toBe(profile.headline);
  expect(view.employment[0].dates).toBe(profile.experience[0].dates);
  expect(view.education[0].degree).toBe(profile.education[0].degree);
});
it("retains approved source wording with explicit warnings for invented metrics or responsibilities", async () => {
  const raw = baseContent(profile);
  raw.experience[0].bullets[0].text =
    "Led 100 projects and increased revenue by 80%.";
  const { content, warnings } = guardContent(raw, profile);
  expect(content.experience[0].bullets[0].text).toBe(
    profile.experience[0].achievements[0].text,
  );
  expect(warnings[0]).toContain("original approved wording retained");
  const { client } = setup(raw);
  expect(
    (
      await client.tailorResume({
        profile,
        jobDescription:
          "Seeking a TypeScript developer with proven accessible application work.",
      })
    ).warnings.length,
  ).toBeGreaterThan(0);
});
it("preserves one-source-per-bullet and blocks unknown, duplicate and cross-experience mappings", () => {
  for (const mutate of [
    (r: any) => {
      r.skillIds = ["unknown"];
    },
    (r: any) => {
      r.experience[0].experienceId = "unknown";
    },
    (r: any) => {
      r.experience[0].bullets[0].sourceAchievementIds = ["edu-1"];
    },
    (r: any) => {
      r.experience[0].bullets.push(r.experience[0].bullets[0]);
    },
    (r: any) => {
      r.experience[0].bullets[0].sourceAchievementIds = ["ach-1", "ach-2"];
    },
    (r: any) => {
      r.personal = { fullName: "Invented" };
    },
  ]) {
    const raw = baseContent(profile);
    mutate(raw);
    expect(() => validateContent(raw, profile)).toThrow();
  }
});
it("does not silently repair fabricated IDs or retry invalid shape responses", async () => {
  const raw = baseContent(profile);
  raw.skillIds = ["unapproved"];
  const { client, fetcher } = setup(raw);
  await expect(
    client.tailorResume({
      profile,
      jobDescription:
        "Looking for an experienced TypeScript application developer.",
    }),
  ).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
