import React, { useState } from "react";
import { PixelButton, Dialog, Field } from "./World.jsx";
import { profileDraftSchema, profileChanges } from "../../shared/workspace.js";
const split = (s) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const sections = {
  personal: "Character information",
  certifications: "Certifications",
  languages: "Languages",
  employment: "Work experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  links: "Professional links",
  summary: "Professional summary",
  achievements: "Verified achievements",
};
function LinkEditor({ links, onChange, prefix = "" }) {
  return (
    <div>
      {links.map((l, i) => (
        <div className="record" key={i}>
          <Field
            label={prefix + "Link label " + (i + 1)}
            value={l.label}
            onChange={(v) =>
              onChange(links.map((x, n) => (n === i ? { ...x, label: v } : x)))
            }
          />
          <Field
            label={prefix + "Link URL " + (i + 1)}
            value={l.url}
            type="url"
            placeholder="https://…"
            onChange={(v) =>
              onChange(links.map((x, n) => (n === i ? { ...x, url: v } : x)))
            }
          />
          <button
            className="edit danger"
            onClick={() => onChange(links.filter((_, n) => n !== i))}
          >
            Remove link
          </button>
        </div>
      ))}
      <PixelButton
        onClick={() => onChange([...links, { label: "", url: "" }])}
        disabled={links.length >= 10}
      >
        + Add link
      </PixelButton>
    </div>
  );
}
function SectionEditor({ section, value, setValue }) {
  const field = (label, key, multiline = false) => (
    <Field
      label={label}
      value={value[key]}
      multiline={multiline}
      onChange={(v) => setValue({ ...value, [key]: v })}
    />
  );
  if (section === "personal")
    return (
      <>
        {field("Full name", "name")}
        {field("Professional title", "headline")}
        {field("Email address", "email")}
        {field("Phone number", "phone")}
        {field("Location", "location")}
      </>
    );
  if (section === "summary")
    return (
      <Field
        label="Professional summary"
        value={value}
        multiline
        onChange={setValue}
      />
    );
  if (["skills", "achievements"].includes(section))
    return (
      <Field
        label={
          section === "skills"
            ? "Skills — one per line"
            : "Verified achievements — one per line"
        }
        value={value.join("\n")}
        multiline
        rows={8}
        onChange={(v) => setValue(v.split("\n"))}
      />
    );
  if (section === "links")
    return <LinkEditor links={value} onChange={setValue} />;
  const configuration = {
    certifications: {
      label: "certification",
      fresh: { name: "", issuer: "", dates: "", url: null, provenance: null },
      fields: [
        ["Certification", "name"],
        ["Issuer", "issuer"],
        ["Dates", "dates"],
      ],
    },
    languages: {
      label: "language",
      fresh: { name: "", proficiency: "", provenance: null },
      fields: [
        ["Language", "name"],
        ["Proficiency", "proficiency"],
      ],
    },
    employment: {
      label: "work experience",
      fresh: { title: "", company: "", dates: "", bullets: [] },
      fields: [
        ["Job title", "title"],
        ["Company", "company"],
        ["Employment dates", "dates"],
        ["Responsibilities — one per line", "bullets", true],
      ],
    },
    education: {
      label: "education",
      fresh: { degree: "", school: "", dates: "" },
      fields: [
        ["Degree or qualification", "degree"],
        ["School", "school"],
        ["Education dates", "dates"],
      ],
    },
    projects: {
      label: "project",
      fresh: { name: "", description: "", links: [] },
      fields: [
        ["Project name", "name"],
        ["Project description", "description", true],
      ],
    },
  }[section];
  return (
    <>
      {value.map((record, i) => (
        <fieldset className="record" key={record.id}>
          <legend>
            {configuration.label} {i + 1}
          </legend>
          {configuration.fields.map(([label, key, multiline]) => (
            <Field
              key={key}
              label={label + " " + (i + 1)}
              value={
                Array.isArray(record[key])
                  ? record[key].join("\n")
                  : record[key]
              }
              multiline={multiline}
              onChange={(v) =>
                setValue(
                  value.map((r, n) =>
                    n === i
                      ? { ...r, [key]: key === "bullets" ? v.split("\n") : v }
                      : r,
                  ),
                )
              }
            />
          ))}
          {section === "projects" && (
            <LinkEditor
              prefix={"Project " + (i + 1) + " "}
              links={record.links}
              onChange={(links) =>
                setValue(value.map((r, n) => (n === i ? { ...r, links } : r)))
              }
            />
          )}
          <button
            className="edit danger"
            onClick={() => setValue(value.filter((_, n) => n !== i))}
          >
            Remove {configuration.label}
          </button>
        </fieldset>
      ))}
      <PixelButton
        disabled={value.length >= 10}
        onClick={() =>
          setValue([
            ...value,
            { ...configuration.fresh, id: crypto.randomUUID() },
          ])
        }
      >
        + Add {configuration.label}
      </PixelButton>
    </>
  );
}
export function Journal({
  profile,
  onSave,
  canUse,
  busy,
  request,
  notify,
  onAcceptProposal,
}) {
  const [draft, setDraft] = useState(() => structuredClone(profile));
  const [editing, setEditing] = useState(null),
    [value, setValue] = useState(null),
    [localError, setLocalError] = useState(""),
    [information, setInformation] = useState(""),
    [proposal, setProposal] = useState(null),
    [importBusy, setImportBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  function edit(section) {
    setLocalError("");
    setEditing(section);
    setValue(
      structuredClone(
        section === "personal"
          ? {
              name: draft.name,
              headline: draft.headline,
              email: draft.email,
              phone: draft.phone,
              location: draft.location || "",
            }
          : draft[section] || [],
      ),
    );
  }
  function applyEdit() {
    let v = value;
    if (["skills", "achievements"].includes(editing))
      v = split(value.join("\n"));
    if (editing === "employment")
      v = value.map((r) => ({ ...r, bullets: split(r.bullets.join("\n")) }));
    const next = {
      ...draft,
      ...(editing === "personal" ? v : { [editing]: v }),
      confirmed: false,
    };
    const parsed = profileDraftSchema.safeParse(next);
    if (!parsed.success) {
      setLocalError(
        parsed.error.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
      );
      return;
    }
    setDraft(parsed.data);
    setEditing(null);
  }
  async function propose(file) {
    setImportBusy(true);
    setLocalError("");
    try {
      let response;
      if (file) {
        const body = new FormData();
        body.append("resume", file);
        response = await request("/api/profile/import", body);
      } else
        response = await request("/api/profile/propose", {
          profile: draft,
          information,
        });
      setProposal(await response.json());
    } catch (e) {
      setLocalError(e.message);
    } finally {
      setImportBusy(false);
    }
  }
  const row = (title, subtitle, section) => (
    <div className="field">
      <span>
        {title}
        <small>{subtitle || "Not added"}</small>
      </span>
      <button
        className="edit"
        aria-label={"Edit " + title}
        onClick={() => edit(section)}
      >
        Edit
      </button>
    </div>
  );
  return (
    <>
      <p className="lead">
        Your career story, organized like a character journal. Edit any field at
        any time.
      </p>
      <div className="book">
        <div className="page">
          <h2>♟ Character Information</h2>
          <div className="avatar">
            <div className="avatar-art" aria-hidden="true">
              ♟
            </div>
            <div>
              <strong>{draft.name || "Your Name"}</strong>
              <div className="muted">Career explorer · Your story matters</div>
            </div>
          </div>
          {row("Personal details", draft.headline, "personal")}
          {row(
            "Work experience",
            draft.employment.length + " roles",
            "employment",
          )}
          {row(
            "Education",
            draft.education.length + " qualifications",
            "education",
          )}
          {row("Professional summary", draft.summary, "summary")}
          {row(
            "Certifications",
            (draft.certifications || []).map((x) => x.name).join(" · "),
            "certifications",
          )}
          {row(
            "Languages",
            (draft.languages || []).map((x) => x.name).join(" · "),
            "languages",
          )}
        </div>
        <div className="page">
          <h2>✦ Skills & Treasures</h2>
          <div className="skill-grid">
            {[
              ["✦", "Skills", "skills"],
              ["◇", "Projects", "projects"],
              ["▣", "Portfolio", "links"],
              ["✧", "Links", "links"],
              ["♥", "Achievements", "achievements"],
              ["▤", "Summary", "summary"],
            ].map(([icon, label, id]) => (
              <button className="skill" onClick={() => edit(id)} key={label}>
                <span aria-hidden="true">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          {row("Skills", draft.skills.join(" · "), "skills")}
          {row(
            "Projects",
            draft.projects.map((p) => p.name).join(" · "),
            "projects",
          )}
          {row(
            "Professional links",
            draft.links.map((l) => l.label).join(" · "),
            "links",
          )}
          {row(
            "Verified achievements",
            draft.achievements.length + " achievements",
            "achievements",
          )}
        </div>
      </div>
      <div className="journal-save panel">
        <label className="check">
          <input
            type="checkbox"
            checked={draft.confirmed}
            onChange={(e) =>
              setDraft((d) => ({ ...d, confirmed: e.target.checked }))
            }
          />
          I reviewed and confirm the profile facts and links.
        </label>
        <div className="actions">
          <PixelButton
            disabled={busy || !canUse}
            onClick={async () => {
              setLocalError("");
              const p = profileDraftSchema.safeParse(draft);
              if (!p.success) {
                setLocalError(
                  p.error.issues
                    .map((i) => i.path.join(".") + ": " + i.message)
                    .join("; "),
                );
                return;
              }
              await onSave(p.data);
            }}
          >
            Save profile
          </PixelButton>
          <span role="status">
            {dirty
              ? "Unsaved journal changes"
              : profile.confirmed
                ? "✓ Confirmed profile"
                : "Draft profile — review before generation"}
          </span>
        </div>
        <p className="muted">
          {canUse
            ? "Saved in this browser after approval. Export backups to keep a separate copy."
            : "Sign in to save your journal securely."}
        </p>
      </div>
      {localError && (
        <p className="error" role="alert">
          {localError}
        </p>
      )}
      <details className="panel import-panel" open={!profile.confirmed}>
        <summary>✦ Import a resume or propose a profile update</summary>
        <p>
          Upload a text-based PDF or DOCX, paste professional information, or
          describe a new achievement. AI proposes facts for review; it never
          saves them automatically.
        </p>
        <label className="form-field">
          Resume file (PDF or DOCX, up to 4 MB)
          <input
            type="file"
            accept=".pdf,.docx"
            disabled={!canUse || importBusy}
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) {
                if (f.size > 4 * 1024 * 1024)
                  setLocalError("Resume files must be at most 4 MB.");
                else propose(f);
              }
              e.target.value = "";
            }}
          />
        </label>
        <Field
          label="Professional information or updates"
          value={information}
          multiline
          rows={5}
          onChange={setInformation}
        />
        <PixelButton
          disabled={!canUse || importBusy || information.trim().length < 20}
          onClick={() => propose()}
        >
          {importBusy ? "Preparing proposal…" : "Propose profile updates"}
        </PixelButton>
        <p className="muted">
          AI import requires a configured live backend. Missing facts remain
          blank. Scanned PDFs require OCR before upload.
        </p>
      </details>
      {proposal && (
        <Dialog
          title="Review proposed profile"
          onClose={() => setProposal(null)}
        >
          <p>
            Nothing has been applied. Check every proposed fact before
            accepting.
          </p>
          {proposal.warnings?.map((warning, i) => (
            <p className="note" key={i}>
              {warning}
            </p>
          ))}
          {profileChanges(draft, proposal).map((key) => (
            <div className="proposal-diff" key={key}>
              <h3>{key}</h3>
              <p>
                <b>Current</b>
              </p>
              <pre>
                {typeof draft[key] === "string"
                  ? draft[key]
                  : JSON.stringify(draft[key], null, 2)}
              </pre>
              <p>
                <b>Proposed</b>
              </p>
              <pre>
                {typeof proposal[key] === "string"
                  ? proposal[key]
                  : JSON.stringify(proposal[key], null, 2)}
              </pre>
            </div>
          ))}
          <div className="actions">
            <PixelButton
              onClick={() => {
                onAcceptProposal?.();
                const { warnings, ...proposed } = proposal;
                setDraft({ ...proposed, confirmed: false });
                setProposal(null);
                notify(
                  "Proposal applied to your draft. Review, confirm, and save your profile.",
                );
              }}
            >
              Apply proposed profile
            </PixelButton>
            <PixelButton onClick={() => setProposal(null)}>
              Discard proposal
            </PixelButton>
          </div>
        </Dialog>
      )}
      {editing && (
        <Dialog
          title={"Edit " + sections[editing]}
          onClose={() => setEditing(null)}
        >
          <SectionEditor section={editing} value={value} setValue={setValue} />
          {localError && (
            <p className="error" role="alert">
              {localError}
            </p>
          )}
          <div className="actions">
            <PixelButton onClick={applyEdit}>Save changes</PixelButton>
            <PixelButton onClick={() => setEditing(null)}>Cancel</PixelButton>
          </div>
        </Dialog>
      )}
    </>
  );
}
