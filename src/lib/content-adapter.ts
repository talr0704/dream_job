import {
  type ProfessionalProfile,
  type ResumeContent,
} from "../../shared/contracts";
import { validateContent } from "../../shared/tailoring";
import { toJournal } from "./adapter";
export function contentToJournal(p: ProfessionalProfile, raw: ResumeContent) {
  const c = validateContent(raw, p),
    j = toJournal(p);
  return {
    ...j,
    summary: c.summary,
    skills: c.skillIds.map((id) => p.skills.find((s) => s.id === id)!.text),
    employment: c.experience.map((e) => ({
      ...j.employment.find((v: any) => v.id === e.experienceId),
      bullets: e.bullets.map((b) => b.text),
    })),
    projects: c.projects.map((v) => ({
      ...j.projects.find((s: any) => s.id === v.projectId),
      description: v.description,
    })),
  };
}
