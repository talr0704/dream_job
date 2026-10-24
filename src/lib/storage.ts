import { profileSchema } from "../../shared/model.js";
import Dexie, { type Table } from "dexie";
import { z } from "zod";
import {
  professionalProfileSchema,
  verifiedProfileSchema,
  analysisSchema,
  tailoredResumeSchema,
  validateResume,
  validateAnalysis,
  type ProfessionalProfile,
} from "../../shared/contracts";
export const savedAnalysisSchema = z
  .object({
    id: z.string().uuid(),
    profile: verifiedProfileSchema,
    jobDescription: z.string().min(40).max(18000),
    analysis: analysisSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export const savedResumeSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    folder: z.string().max(80),
    profile: verifiedProfileSchema,
    resume: tailoredResumeSchema,
    jobDescription: z.string().max(18000),
    analysis: analysisSchema.nullable(),
    twoPages: z.boolean(),
    createdAt: z.string().datetime(),
    manualProfile: profileSchema
      .refine((p) => p.confirmed, "Confirm manual snapshot facts")
      .nullable(),
  })
  .strict();
export type SavedResume = z.infer<typeof savedResumeSchema>;
export const backupSchema = z
  .object({
    format: z.literal("dream-job"),
    version: z.literal(1),
    exportedAt: z.string().datetime(),
    professionalProfiles: z.array(verifiedProfileSchema).max(100),
    profileVersions: z.array(verifiedProfileSchema).max(10000),
    jobAnalyses: z.array(savedAnalysisSchema).max(10000),
    resumes: z.array(savedResumeSchema).max(10000),
    settings: z
      .array(
        z.object({ key: z.string().max(100), value: z.unknown() }).strict(),
      )
      .max(100),
  })
  .strict();
export class DreamJobDB extends Dexie {
  professionalProfiles!: Table<ProfessionalProfile, string>;
  profileVersions!: Table<ProfessionalProfile & { versionKey: string }, string>;
  jobAnalyses!: Table<z.infer<typeof savedAnalysisSchema>, string>;
  resumes!: Table<SavedResume, string>;
  settings!: Table<{ key: string; value: unknown }, string>;
  constructor(name = "dream-job") {
    super(name);
    this.version(1).stores({
      professionalProfiles: "id,updatedAt",
      profileVersions: "versionKey,id,version",
      jobAnalyses: "id,createdAt",
      resumes: "id,createdAt,folder",
      settings: "key",
    });
    this.version(2)
      .stores({
        professionalProfiles: "id,updatedAt",
        profileVersions: "versionKey,id,version,[id+version]",
        jobAnalyses: "id,createdAt",
        resumes: "id,createdAt,folder,title",
        settings: "key",
      })
      .upgrade((tx) =>
        tx.table("settings").put({ key: "schemaVersion", value: 2 }),
      );
  }
  async approveProfile(input: unknown, approved: boolean) {
    if (!approved) throw Error("Explicit profile approval is required");
    const draft = professionalProfileSchema.parse(input);
    return this.transaction(
      "rw",
      this.professionalProfiles,
      this.profileVersions,
      async () => {
        const previous = await this.professionalProfiles.get(draft.id);
        if (previous && previous.version !== draft.version)
          throw Error("Profile changed in another tab. Reload before saving.");
        const saved = verifiedProfileSchema.parse({
          ...draft,
          verified: true,
          version: previous ? previous.version + 1 : 1,
          updatedAt: new Date().toISOString(),
        });
        await this.professionalProfiles.put(saved);
        await this.profileVersions.add({
          ...saved,
          versionKey: `${saved.id}:${saved.version}`,
        });
        return saved;
      },
    );
  }
  async saveAnalysis(input: unknown) {
    const a = savedAnalysisSchema.parse(input);
    const { score, ...draft } = a.analysis;
    if (validateAnalysis(draft, a.profile).score !== score)
      throw Error("Inconsistent analysis");
    await this.jobAnalyses.add(a);
    return a;
  }
  async saveResume(input: unknown) {
    const r = savedResumeSchema.parse(input);
    validateResume(r.resume, r.profile);
    if (r.analysis) {
      const { score, ...draft } = r.analysis;
      if (validateAnalysis(draft, r.profile).score !== score)
        throw Error("Inconsistent resume analysis");
    }
    await this.resumes.add(r);
    return r;
  }
  async duplicateResume(id: string) {
    const source = await this.resumes.get(id);
    if (!source) throw Error("Resume not found");
    return this.saveResume({
      ...source,
      id: crypto.randomUUID(),
      title: source.title.slice(0, 113) + " (copy)",
      createdAt: new Date().toISOString(),
    });
  }
  async exportBackup() {
    return this.transaction("r", this.tables, async () =>
      backupSchema.parse({
        format: "dream-job",
        version: 1,
        exportedAt: new Date().toISOString(),
        professionalProfiles: await this.professionalProfiles.toArray(),
        profileVersions: (await this.profileVersions.toArray()).map(
          ({ versionKey, ...p }) => p,
        ),
        jobAnalyses: await this.jobAnalyses.toArray(),
        resumes: await this.resumes.toArray(),
        settings: await this.settings.toArray(),
      }),
    );
  }
  async importBackup(raw: unknown) {
    const b = backupSchema.parse(raw);
    for (const r of b.resumes) {
      validateResume(r.resume, r.profile);
      if (r.analysis) {
        const { score, ...draft } = r.analysis;
        if (validateAnalysis(draft, r.profile).score !== score)
          throw Error("Inconsistent resume analysis");
      }
    }
    for (const a of b.jobAnalyses) {
      const { score, ...draft } = a.analysis;
      if (validateAnalysis(draft, a.profile).score !== score)
        throw Error("Inconsistent analysis");
    }
    return this.transaction("rw", this.tables, async () => {
      // add(), never put(): a single collision rolls back the entire import.
      for (const p of b.professionalProfiles)
        await this.professionalProfiles.add(p);
      for (const p of b.profileVersions)
        await this.profileVersions.add({
          ...p,
          versionKey: `${p.id}:${p.version}`,
        });
      for (const a of b.jobAnalyses) await this.jobAnalyses.add(a);
      for (const r of b.resumes) await this.resumes.add(r);
      // Settings cannot silently override an existing browser preference.
      for (const s of b.settings)
        await this.settings.add({ key: s.key, value: s.value });
      return {
        profiles: b.professionalProfiles.length,
        resumes: b.resumes.length,
      };
    });
  }
}
export const db = new DreamJobDB();
