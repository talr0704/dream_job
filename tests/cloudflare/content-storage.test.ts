import { it, expect } from "vitest";
import { DreamJobDB, isResumeV2 } from "../../src/lib/storage";
import { profile, resume } from "./fixtures";
import { baseContent, contentDigest } from "../../shared/tailoring";
const db = () => new DreamJobDB("content-" + crypto.randomUUID());
function legacy() {
  return {
    id: crypto.randomUUID(),
    title: "Legacy",
    folder: "",
    profile,
    resume,
    jobDescription: "",
    analysis: null,
    twoPages: false,
    createdAt: new Date().toISOString(),
    manualProfile: null,
  };
}
async function current() {
  const content = baseContent(profile);
  return {
    formatVersion: 2 as const,
    id: crypto.randomUUID(),
    title: "New",
    folder: "",
    profile,
    content,
    jobDescription: "",
    twoPages: false,
    createdAt: new Date().toISOString(),
    review: {
      reviewedAt: new Date().toISOString(),
      digest: await contentDigest(profile, content),
    },
    warnings: [],
  };
}
it("roundtrips both resume formats and preserves legacy records without migration writes", async () => {
  const a = db(),
    b = db();
  try {
    await a.approveProfile(profile, true);
    const old = legacy();
    await a.saveResume(old);
    const r = await a.saveResume(await current());
    expect(isResumeV2(r)).toBe(true);
    const backup = await a.exportBackup();
    expect(backup.version).toBe(2);
    await b.importBackup(backup);
    expect(await b.resumes.get(old.id)).toEqual(old);
    expect(await b.resumes.get(r.id)).toEqual(r);
    await b.duplicateResume(r.id);
    expect(await b.resumes.count()).toBe(3);
    expect(await b.profileVersions.count()).toBe(1);
  } finally {
    await a.delete();
    await b.delete();
  }
});
it("imports backup v1 without converting historical manual content", async () => {
  const a = db(),
    b = db();
  try {
    await a.saveResume(legacy());
    const backup = await a.exportBackup();
    await b.importBackup({ ...backup, version: 1 });
    expect(await b.resumes.toArray()).toEqual(await a.resumes.toArray());
  } finally {
    await a.delete();
    await b.delete();
  }
});
it("rejects stale review digests and atomically rejects collisions", async () => {
  const a = db();
  try {
    const r = await current();
    await a.saveResume(r);
    await expect(
      a.saveResume({
        ...r,
        id: crypto.randomUUID(),
        content: { ...r.content, summary: "Changed" },
      }),
    ).rejects.toThrow(/review/);
    const backup = await a.exportBackup();
    await expect(a.importBackup(backup)).rejects.toThrow();
    expect(await a.resumes.count()).toBe(1);
  } finally {
    await a.delete();
  }
});
