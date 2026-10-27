import React, { useState, useEffect, useMemo, useRef } from "react";
import { resumeDocument, fitPaper } from "../../shared/render.js";
import { PixelButton, Field } from "./World.jsx";
export function ResumePreview({ resume, twoPages, onLayout }) {
  const [actualSize, setActualSize] = useState(false);
  const frame = useRef(),
    viewport = useRef();
  const source = useMemo(
    () => resumeDocument(resume, { pages: twoPages ? "two" : "one" }),
    [resume, twoPages],
  );
  function measure() {
    const iframe = frame.current;
    if (!iframe?.contentDocument?.querySelector(".paper")) return;
    const layout = iframe.contentWindow.Function(
      "return (" + fitPaper.toString() + ")()",
    )();
    const height = Math.ceil(
      iframe.contentDocument.querySelector(".paper").getBoundingClientRect()
        .height + 2,
    );
    const width = actualSize
      ? 794
      : Math.max(1, Math.min(794, viewport.current.clientWidth - 32));
    const scale = width / 794;
    iframe.style.height = height + "px";
    iframe.style.transform = "scale(" + scale + ")";
    iframe.parentElement.style.width = width + "px";
    iframe.parentElement.style.height = height * scale + "px";
    onLayout(layout);
  }
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [actualSize]);
  return (
    <>
      <div className="zoom-controls">
        <button
          className="edit"
          aria-pressed={!actualSize}
          onClick={() => setActualSize(false)}
        >
          Fit page
        </button>
        <button
          className="edit"
          aria-pressed={actualSize}
          onClick={() => setActualSize(true)}
        >
          Actual size
        </button>
      </div>
      <div className="paper-viewport" ref={viewport}>
        <div className="paper-stage">
          <iframe
            title="Resume preview"
            ref={frame}
            srcDoc={source}
            onLoad={() => {
              measure();
              frame.current?.contentDocument.fonts.ready.then(measure);
            }}
          />
        </div>
      </div>
    </>
  );
}
function ResumeEditor({ resume, setResume }) {
  function update(k, v) {
    setResume((r) => ({ ...r, [k]: v }));
  }
  return (
    <div className="resume-editor">
      <Field
        label="Headline"
        value={resume.headline}
        onChange={(v) => update("headline", v)}
      />
      <Field
        label="Summary"
        value={resume.summary}
        multiline
        onChange={(v) => update("summary", v)}
      />
      <Field
        label="Skills — one per line"
        value={resume.skills.join("\n")}
        multiline
        onChange={(v) => update("skills", v.split("\n"))}
      />
      {resume.employment.map((j, i) => (
        <fieldset key={j.id}>
          <legend>{j.title}</legend>
          {j.bullets.map((b, k) => (
            <Field
              key={k}
              label={`Experience ${i + 1} bullet ${k + 1}`}
              value={b}
              multiline
              onChange={(v) =>
                setResume((r) => ({
                  ...r,
                  employment: r.employment.map((x, n) =>
                    n === i
                      ? {
                          ...x,
                          bullets: x.bullets.map((s, m) => (m === k ? v : s)),
                        }
                      : x,
                  ),
                }))
              }
            />
          ))}
        </fieldset>
      ))}
      {resume.projects.map((p, i) => (
        <Field
          key={p.id}
          label={p.name}
          value={p.description}
          multiline
          onChange={(v) =>
            setResume((r) => ({
              ...r,
              projects: r.projects.map((x, n) =>
                n === i ? { ...x, description: v } : x,
              ),
            }))
          }
        />
      ))}
      <p>
        Manual edits are not independently fact checked. Review every statement
        before exporting.
      </p>
    </div>
  );
}
export function Builder({
  resume,
  setResume,
  twoPages,
  setTwoPages,
  busy,
  canUse,
  download,
  onSaveVersion,
  sourceJob,
  concise,
  onRefine,
  requiresReview = false,
  reviewed = false,
  reviewPanel = /** @type {import("react").ReactNode} */ (null),
  go,
}) {
  const [instructions, setInstructions] = useState("");
  const [editing, setEditing] = useState(false),
    [layout, setLayout] = useState(null),
    [title, setTitle] = useState(""),
    [folder, setFolder] = useState("");
  return (
    <>
      <p className="lead">
        Craft your next chapter. The pixel world stays here; your exported
        resume stays professional.
      </p>
      <div className="builder-grid">
        <aside className="builder-tools panel">
          <h2>Crafting tools</h2>
          <p>
            {sourceJob
              ? "This draft is linked to the job description below."
              : "Start with your confirmed profile or generate a tailored version in Job Match."}
          </p>
          <PixelButton onClick={() => go("match")}>
            ✦ Go to Job Match
          </PixelButton>
          {!requiresReview && (
            <PixelButton onClick={() => setEditing(!editing)}>
              {editing ? "Done editing" : "Edit resume"}
            </PixelButton>
          )}
          {!resume.confirmed && (
            <p className="note">
              Confirm your profile in the journal before exporting.{" "}
              <button className="edit" onClick={() => go("profile")}>
                Open journal
              </button>
            </p>
          )}
          {sourceJob && (
            <details>
              <summary>Associated job description</summary>
              <p className="source-job">{sourceJob}</p>
            </details>
          )}
          <Field
            label="Requested resume edits"
            value={instructions}
            multiline
            onChange={setInstructions}
          />
          <PixelButton
            disabled={!!busy || instructions.trim().length < 3}
            onClick={() => onRefine(instructions)}
          >
            Refine with AI
          </PixelButton>
          <hr />
          <h2>Keep this version</h2>
          <Field
            label="Resume version name"
            value={title}
            placeholder="e.g. Frontend developer · Acme"
            maxLength={120}
            onChange={setTitle}
          />
          <Field
            label="Collection"
            value={folder}
            placeholder="e.g. Applications"
            maxLength={80}
            onChange={setFolder}
          />
          <PixelButton
            disabled={!!busy || !canUse || !resume.confirmed || !title.trim()}
            onClick={() => onSaveVersion(title, folder)}
          >
            ▣ Save new version
          </PixelButton>
          <p className="muted">
            Every save creates an independent snapshot. Profile changes never
            overwrite your saved versions.
          </p>
        </aside>
        <section className="resume-workspace">
          <div className="preview-toolbar">
            <h2>Live resume preview</h2>
            <span className={layout?.overflow ? "warning-label" : "fit-label"}>
              {layout
                ? layout.overflow
                  ? "Exceeds one A4 page"
                  : `A4 fit · ${layout.density} spacing`
                : "Measuring layout…"}
            </span>
          </div>
          {reviewPanel}
          {editing && !requiresReview && (
            <ResumeEditor resume={resume} setResume={setResume} />
          )}{" "}
          {layout?.overflow && (
            <div className="note overflow-note">
              Spacing is at its compact limit. Shorten the text or explicitly
              allow two pages. Content is never clipped.
              {sourceJob && (
                <PixelButton disabled={!canUse || !!busy} onClick={concise}>
                  Create concise version
                </PixelButton>
              )}
            </div>
          )}
          <ResumePreview
            resume={resume}
            twoPages={twoPages}
            onLayout={setLayout}
          />
          <div className="export-bar">
            <label className="check">
              <input
                type="checkbox"
                checked={twoPages}
                onChange={(e) => setTwoPages(e.target.checked)}
              />
              Allow two pages
            </label>
            <PixelButton
              disabled={
                !!busy ||
                !canUse ||
                !resume.confirmed ||
                (requiresReview && !reviewed) ||
                !layout ||
                (!twoPages && layout.overflow)
              }
              onClick={() => download(resume, twoPages)}
            >
              {busy === "Rendering PDF…" ? busy : "Export PDF ↓"}
            </PixelButton>
          </div>
          <p className="export-note">
            Choose your browser’s built-in “Save as PDF”, A4, no headers or
            footers, and background graphics. Check links in the saved file;
            print preview may not activate them. Missing URLs are never added.
          </p>
        </section>
      </div>
    </>
  );
}
