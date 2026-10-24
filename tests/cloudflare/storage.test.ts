import { it, expect } from "vitest";
import Dexie from "dexie";
import { DreamJobDB } from "../../src/lib/storage";
import { profile, resume, analysis } from "./fixtures";
const makeDB = () => new DreamJobDB("test-" + crypto.randomUUID());
const record = () => ({
  id: crypto.randomUUID(),
  profile,
  resume,
  analysis,
  jobDescription:
    "Looking for a TypeScript developer with accessible application experience.",
  title: "Developer application",
  folder: "Applications",
  createdAt: new Date().toISOString(),
  twoPages: false,
  manualProfile: null,
});
it("requires explicit approval, versions profile changes, detects stale writes and persists across reopen", async () => {
  const db = makeDB();
  try {
    await expect(db.approveProfile(profile, false)).rejects.toThrow(/approval/);
    expect(await db.professionalProfiles.count()).toBe(0);
    const saved = await db.approveProfile(profile, true);
    const next = await db.approveProfile(
      { ...saved, headline: "Senior developer" },
      true,
    );
    expect(next.version).toBe(2);
    expect(await db.profileVersions.count()).toBe(2);
    await expect(db.approveProfile(saved, true)).rejects.toThrow(/another tab/);
    db.close();
    await db.open();
    expect((await db.professionalProfiles.get(profile.id))?.headline).toBe(
      "Senior developer",
    );
  } finally {
    await db.delete();
  }
});
it("keeps immutable historical resume snapshots; duplicate/delete never modify master", async () => {
  const db = makeDB();
  try {
    const saved = await db.approveProfile(profile, true);
    const r = await db.saveResume(record());
    await db.approveProfile({ ...saved, summary: "New summary" }, true);
    expect((await db.resumes.get(r.id))?.profile.summary).toBe(profile.summary);
    const duplicate = await db.duplicateResume(r.id);
    expect(duplicate.id).not.toBe(r.id);
    expect(duplicate.resume).toEqual(resume);
    await db.resumes.delete(r.id);
    expect(await db.resumes.count()).toBe(1);
    expect(await db.professionalProfiles.count()).toBe(1);
  } finally {
    await db.delete();
  }
});
it("roundtrips versioned backups, rejects invalid backups and atomically cancels all collisions", async () => {
  const a = makeDB(),
    b = makeDB();
  try {
    await a.approveProfile(profile, true);
    await a.saveResume(record());
    await a.saveAnalysis({
      id: crypto.randomUUID(),
      profile,
      analysis,
      jobDescription:
        "Seeking a TypeScript developer with accessibility experience.",
      createdAt: new Date().toISOString(),
    });
    const backup = await a.exportBackup();
    await b.importBackup(backup);
    expect(await b.resumes.count()).toBe(1);
    expect(await b.jobAnalyses.count()).toBe(1);
    await expect(b.importBackup({ ...backup, version: 999 })).rejects.toThrow();
    await expect(
      b.importBackup({
        ...backup,
        professionalProfiles: [
          { ...profile, id: "new-profile" },
          ...backup.professionalProfiles,
        ],
      }),
    ).rejects.toThrow();
    expect(await b.professionalProfiles.get("new-profile")).toBeUndefined();
    expect(await b.resumes.count()).toBe(1);
  } finally {
    await a.delete();
    await b.delete();
  }
});
it("migrates an existing v1 database without losing data", async () => {
  const name = "migrate-" + crypto.randomUUID();
  const old = new Dexie(name);
  old
    .version(1)
    .stores({
      professionalProfiles: "id,updatedAt",
      profileVersions: "versionKey,id,version",
      jobAnalyses: "id,createdAt",
      resumes: "id,createdAt,folder",
      settings: "key",
    });
  await old.table("professionalProfiles").add(profile);
  old.close();
  const upgraded = new DreamJobDB(name);
  try {
    await upgraded.open();
    expect(
      (await upgraded.professionalProfiles.get(profile.id))?.personal.fullName,
    ).toBe(profile.personal.fullName);
    expect((await upgraded.settings.get("schemaVersion"))?.value).toBe(2);
  } finally {
    await upgraded.delete();
  }
});
it("rejects unsafe manual backup snapshots and mismatched analysis evidence", async () => {
  const db = makeDB();
  try {
    await expect(
      db.saveResume({
        ...record(),
        manualProfile: {
          name: "Unsafe",
          links: [{ url: "javascript:alert(1)" }],
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.saveResume({
        ...record(),
        analysis: {
          ...analysis,
          requirements: [
            { ...analysis.requirements[0], sourceFactIds: ["foreign-fact"] },
          ],
        },
      }),
    ).rejects.toThrow();
    expect(await db.resumes.count()).toBe(0);
  } finally {
    await db.delete();
  }
});
