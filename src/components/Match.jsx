import React from "react";
import { PixelButton } from "./World.jsx";
export function Match({
  profile,
  job,
  setJob,
  result,
  generate,
  analyze,
  busy,
  canUse,
  go,
}) {
  return (
    <>
      <p className="lead">
        Find the overlap between the opportunity and your real experience.
      </p>
      <div className="match-layout">
        <div className="panel">
          <h2>Discover your next opportunity</h2>
          <label className="form-field">
            Job description
            <textarea
              id="job"
              value={job}
              maxLength={18000}
              rows={10}
              placeholder="Paste the job description here…"
              onChange={(e) => setJob(e.target.value)}
            />
          </label>
          <p className="muted">
            {job.length.toLocaleString()} / 18,000 characters · At least 40
            characters
          </p>
          {!profile.confirmed && (
            <p className="note">
              Confirm your profile facts in My Profile before generating.{" "}
              <button className="edit" onClick={() => go("profile")}>
                Open journal
              </button>
            </p>
          )}
          <PixelButton
            disabled={
              !!busy || !canUse || !profile.confirmed || job.trim().length < 40
            }
            onClick={() => generate()}
          >
            {busy || "✦ Generate resume"}
          </PixelButton>
          <PixelButton
            disabled={
              !!busy || !canUse || !profile.confirmed || job.trim().length < 40
            }
            onClick={analyze}
          >
            Analyze fit (optional)
          </PixelButton>
          <PixelButton onClick={() => go("builder")}>
            Open in CV Builder →
          </PixelButton>
          <p className="muted">
            A match score is an estimated fit indicator, not a prediction of
            hiring success. AI never changes your contacts, dates, or links.
          </p>
        </div>
        {result ? (
          <Analysis result={result} go={go} />
        ) : (
          <div className="panel quest-empty">
            <div className="quest-glyph" aria-hidden="true">
              ✦
            </div>
            <h2>Your next quest starts here</h2>
            <p>
              Paste a job description to reveal matching skills, experience, and
              requirements that need attention.
            </p>
            <div className="pixel-progress" aria-hidden="true">
              <span style={{ width: "0%" }} />
            </div>
            <p>Grounded in your confirmed profile.</p>
          </div>
        )}
      </div>
    </>
  );
}
export function Analysis({ result, go }) {
  return (
    <section className="panel analysis" aria-label="Job match analysis">
      <h2>{result.jobTitle}</h2>
      <p className="muted">
        This analysis reflects the profile used for this resume draft. Generate
        again to assess later profile changes.
      </p>
      <div className="score-line">
        <strong>
          {result.demo ? "—" : result.score}
          <span> / 100</span>
        </strong>
        <span>
          {result.demo ? "Demo · fit not assessed" : "Estimated match"}
        </span>
      </div>
      <div
        className="pixel-progress"
        role={result.demo ? undefined : "progressbar"}
        aria-label="Estimated job fit"
        aria-valuemin={result.demo ? undefined : 0}
        aria-valuemax={result.demo ? undefined : 100}
        aria-valuenow={result.demo ? undefined : result.score}
      >
        <span style={{ width: (result.demo ? 0 : result.score) + "%" }} />
      </div>
      <p className="muted">
        Mandatory requirements weigh 3× preferred requirements. Met earns full
        credit; partial earns half. Missing earns zero.
      </p>
      {[
        ["Matching skills", result.relevantSkills],
        ["Key strengths", result.strengths],
        ["Potential gaps", result.gaps],
        ["Resume emphasis", result.recommendations],
      ].map(([title, items]) => (
        <div key={title}>
          <h3>{title}</h3>
          <ul>
            {items.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ))}
      <h3>Experience alignment</h3>
      <p>{result.experienceAlignment}</p>
      <h3>Requirements & evidence</h3>
      {result.requirements.map((r, i) => (
        <div className={"requirement " + r.status} key={i}>
          <b>
            {r.status.toUpperCase()} · {r.mandatory ? "Mandatory" : "Preferred"}
          </b>
          <p>{r.requirement}</p>
          <p>{r.evidence || "No supporting evidence in your profile."}</p>
        </div>
      ))}
      <PixelButton onClick={() => go("builder")}>
        Open in CV Builder →
      </PixelButton>
    </section>
  );
}
