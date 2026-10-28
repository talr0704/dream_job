import React from "react";
import {
  type ResumeContent,
  type ProfessionalProfile,
} from "../../shared/contracts";
import { evidenceCatalog } from "../../shared/evidence";
import { baseContent } from "../../shared/tailoring";
export function TailoringReview({
  profile,
  content,
  update,
  reviewed,
  approve,
  busy,
  warnings,
}: {
  profile: ProfessionalProfile;
  content: ResumeContent;
  update: (c: ResumeContent) => void;
  reviewed: boolean;
  approve: (checked: boolean) => void;
  busy: boolean;
  warnings: string[];
}) {
  const evidence = evidenceCatalog(profile);
  const sourceList = (
    ids: string[],
    eligible = evidence,
    edit?: (ids: string[]) => void,
  ) => (
    <>
      <ul>
        {ids.map((id) => (
          <li key={id}>{evidence.find((e) => e.id === id)?.text}</li>
        ))}
      </ul>
      {edit && (
        <details>
          <summary>Correct the approved sources for this wording</summary>
          <p>
            Sources were selected automatically. Adjust them only when
            correcting this draft; this never changes your profile.
          </p>
          {eligible.map((fact) => (
            <label className="check" key={fact.id}>
              <input
                type="checkbox"
                checked={ids.includes(fact.id)}
                disabled={
                  busy ||
                  (ids.includes(fact.id) ? ids.length === 1 : ids.length >= 20)
                }
                onChange={(event) =>
                  edit(
                    event.target.checked
                      ? [...ids, fact.id]
                      : ids.filter((id) => id !== fact.id),
                  )
                }
              />
              {fact.text}
            </label>
          ))}
        </details>
      )}
    </>
  );
  const change = (fn: (c: ResumeContent) => void) => {
    const c = structuredClone(content);
    fn(c);
    update(c);
  };
  return (
    <section
      className="panel resume-editor"
      aria-label="Review tailored resume"
    >
      <h2>Compare with your approved profile</h2>
      <p>
        Your complete draft is generated automatically. Review and correct it
        here; you do not need to decide the AI's selections first. Name,
        contacts, employment titles, employers, dates, education, certifications
        and links remain approved facts. A capability-based headline can differ
        from your master headline without changing any employment title.
      </p>
      {warnings.map((w, i) => (
        <p className="note" key={i}>
          {w}
        </p>
      ))}
      {content.headline && (
        <details open>
          <summary>Professional positioning</summary>
          <p>Master profile headline: {profile.headline}</p>
          <label className="form-field">
            Tailored headline
            <textarea
              value={content.headline.text}
              onChange={(e) =>
                change((c) => {
                  c.headline!.text = e.target.value;
                })
              }
            />
          </label>
          {sourceList(content.headline.sourceFactIds, evidence, (ids) =>
            change((c) => {
              c.headline!.sourceFactIds = ids;
            }),
          )}
        </details>
      )}
      <details open>
        <summary>Summary: approved source and draft</summary>
        <p>{profile.summary}</p>
        {content.summarySourceFactIds &&
          sourceList(content.summarySourceFactIds, evidence, (ids) =>
            change((c) => {
              c.summarySourceFactIds = ids;
            }),
          )}
        <label className="form-field">
          Tailored summary
          <textarea
            value={content.summary}
            onChange={(e) =>
              change((c) => {
                c.summary = e.target.value;
              })
            }
          />
        </label>
      </details>
      <fieldset>
        <legend>
          Automatically selected approved skills (optional corrections)
        </legend>
        {profile.skills.map((s) => (
          <label className="check" key={s.id}>
            <input
              type="checkbox"
              checked={content.skillIds.includes(s.id)}
              disabled={
                busy ||
                (content.skillIds.length === 1 &&
                  content.skillIds.includes(s.id))
              }
              onChange={(e) =>
                change((c) => {
                  c.skillIds = e.target.checked
                    ? [...c.skillIds, s.id]
                    : c.skillIds.filter((id) => id !== s.id);
                })
              }
            />
            {s.text}
          </label>
        ))}
      </fieldset>
      {profile.experience.map((e, i) => {
        const selected = content.experience.find(
          (v) => v.experienceId === e.id,
        );
        return (
          <fieldset key={e.id}>
            <legend>
              {e.title} · {e.employer} · {e.dates}
            </legend>
            <label className="check">
              <input
                type="checkbox"
                checked={!!selected}
                disabled={busy}
                onChange={(event) =>
                  change((c) => {
                    c.experience = event.target.checked
                      ? [
                          ...c.experience,
                          baseContent(profile).experience.find(
                            (v) => v.experienceId === e.id,
                          )!,
                        ]
                      : c.experience.filter((v) => v.experienceId !== e.id);
                  })
                }
              />
              Include experience {i + 1}
            </label>
            {e.achievements.map((a, k) => {
              const bullet = selected?.bullets.find((b) =>
                b.sourceAchievementIds.includes(a.id),
              );
              return (
                <div key={a.id}>
                  <p>
                    <strong>Original approved achievement:</strong> {a.text}
                  </p>
                  <label className="check">
                    <input
                      type="checkbox"
                      disabled={!selected || busy}
                      checked={!!bullet}
                      onChange={(event) =>
                        change((c) => {
                          const row = c.experience.find(
                            (v) => v.experienceId === e.id,
                          )!;
                          row.bullets = event.target.checked
                            ? [
                                ...row.bullets,
                                { sourceAchievementIds: [a.id], text: a.text },
                              ]
                            : row.bullets.filter(
                                (b) => !b.sourceAchievementIds.includes(a.id),
                              );
                        })
                      }
                    />
                    Include achievement {i + 1}.{k + 1}
                  </label>
                  {bullet ? (
                    <label className="form-field">
                      Experience {i + 1} bullet {k + 1}
                      <textarea
                        value={bullet.text}
                        onChange={(event) =>
                          change((c) => {
                            c.experience
                              .find((v) => v.experienceId === e.id)!
                              .bullets.find((b) =>
                                b.sourceAchievementIds.includes(a.id),
                              )!.text = event.target.value;
                          })
                        }
                      />
                    </label>
                  ) : (
                    <p className="muted">
                      Not included in this resume. The approved source is
                      unchanged.
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>
        );
      })}
      {profile.projects.map((p) => {
        const selected = content.projects.find((v) => v.projectId === p.id);
        return (
          <fieldset key={p.id}>
            <legend>{p.name}</legend>
            <p>
              Approved project:{" "}
              {[p.description, ...p.achievements.map((a) => a.text)].join(" ")}
            </p>
            {selected?.sourceFactIds &&
              sourceList(
                selected.sourceFactIds,
                evidence.filter(
                  (e) => e.kind === "project" && e.parentId === p.id,
                ),
                (ids) =>
                  change((c) => {
                    c.projects.find(
                      (project) => project.projectId === p.id,
                    )!.sourceFactIds = ids;
                  }),
              )}
            <label className="check">
              <input
                type="checkbox"
                checked={!!selected}
                disabled={busy}
                onChange={(event) =>
                  change((c) => {
                    c.projects = event.target.checked
                      ? [
                          ...c.projects,
                          baseContent(profile).projects.find(
                            (v) => v.projectId === p.id,
                          )!,
                        ]
                      : c.projects.filter((v) => v.projectId !== p.id);
                  })
                }
              />
              Include project {p.name}
            </label>
            {selected && (
              <label className="form-field">
                Tailored project {p.name}
                <textarea
                  value={selected.description}
                  onChange={(event) =>
                    change((c) => {
                      c.projects.find(
                        (v) => v.projectId === p.id,
                      )!.description = event.target.value;
                    })
                  }
                />
              </label>
            )}
          </fieldset>
        );
      })}
      <p>
        Focused checks do not prove every paraphrase. Compare responsibility
        level, technologies, metrics and scope. New facts must first be added to
        and approved in My Profile.
      </p>
      <label className="check">
        <input
          type="checkbox"
          disabled={busy}
          checked={reviewed}
          onChange={(e) => approve(e.target.checked)}
        />
        I reviewed this tailored resume against the approved profile.
      </label>
    </section>
  );
}
