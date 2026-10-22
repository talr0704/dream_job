import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
const initialProfile = {
  confirmed: false,
  name: "",
  headline: "",
  phone: "",
  email: "",
  links: [],
  summary: "",
  skills: [],
  employment: [],
  projects: [],
  education: [],
  achievements: [],
};
import { profileSchema, resumeProfile } from "../shared/model.js";
import { renderResume, fitPaper } from "../shared/render.js";
import { templateCSS } from "../shared/template-css.js";
import "./style.css";
const configured = !!import.meta.env.VITE_FIREBASE_API_KEY;
const auth = configured
  ? getAuth(
      initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      }),
    )
  : null;
const apiBase = import.meta.env.VITE_API_URL || "";
function saved() {
  try {
    return profileSchema.parse(
      JSON.parse(localStorage.getItem("dream-job-profile")),
    );
  } catch {
    return initialProfile;
  }
}
function App() {
  const [profile, setProfile] = useState(saved),
    [draft, setDraft] = useState(() => JSON.stringify(profile, null, 2)),
    [job, setJob] = useState(""),
    [result, setResult] = useState(null),
    [resume, setResume] = useState(profile),
    [tab, setTab] = useState("Tailor"),
    [user, setUser] = useState(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [layout, setLayout] = useState(null),
    [twoPages, setTwoPages] = useState(false),
    [mode, setMode] = useState("offline"),
    [editing, setEditing] = useState(false);
  const frame = useRef();
  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), []);
  useEffect(() => {
    fetch(apiBase + "/api/health")
      .then((r) => r.json())
      .then((d) => setMode(d.mode))
      .catch(() => setMode("offline"));
  }, []);
  useEffect(() => {
    if (mode === "offline" || (mode !== "demo" && !user) || profile.name)
      return;
    request("/api/profile", {})
      .then((r) => r.json())
      .then((p) => {
        setProfile(p);
        setResume(p);
        setDraft(JSON.stringify(p, null, 2));
      })
      .catch((e) => setError(e.message));
  }, [mode, user]);
  useEffect(() => {
    localStorage.setItem("dream-job-profile", JSON.stringify(profile));
  }, [profile]);
  async function request(path, body) {
    const token = user ? await user.getIdToken() : null;
    const response = await fetch(apiBase + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let data;
      try {
        data = await response.json();
      } catch {}
      throw Error(
        data?.error ||
          "Backend unavailable. Check your connection and deployment configuration.",
      );
    }
    return response;
  }
  async function generate(concise = false) {
    setBusy(concise ? "Creating concise version…" : "Analyzing your fit…");
    setError("");
    try {
      const response = await request("/api/generate", {
        profile,
        jobDescription: job,
        concise,
      });
      const data = await response.json();
      setResult(data);
      setResume(resumeProfile(profile, data));
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function download() {
    setBusy("Rendering PDF…");
    setError("");
    try {
      profileSchema.parse(resume);
      const response = await request("/api/pdf", { profile: resume, twoPages });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tal-rozen-resume.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  function saveProfile() {
    try {
      const p = profileSchema.parse(JSON.parse(draft));
      setProfile(p);
      setResume(p);
      setResult(null);
      setError("");
      setTab("Tailor");
    } catch (e) {
      setError(
        e.issues
          ? e.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ")
          : e.message,
      );
    }
  }
  function onPreview() {
    const doc = frame.current.contentDocument;
    const style = doc.createElement("style");
    style.textContent = templateCSS;
    doc.head.appendChild(style);
    doc.body.innerHTML = renderResume(resume, {
      pages: twoPages ? "two" : "one",
    });
    const fit = () => {
      try {
        const fn = frame.current.contentWindow.Function(
          "return (" + fitPaper.toString() + ")()",
        );
        setLayout(fn());
        const height = Math.ceil(
          doc.querySelector(".paper").getBoundingClientRect().height + 2,
        );
        frame.current.style.height = height + "px";
        const stage = frame.current.parentElement;
        const width = Math.min(794, stage.parentElement.clientWidth - 32);
        const scale = width / 794;
        frame.current.style.transform = "scale(" + scale + ")";
        stage.style.width = width + "px";
        stage.style.height = height * scale + "px";
      } catch (e) {
        setError("Preview layout could not be measured.");
      }
    };
    fit();
    doc.fonts.ready.then(fit);
  }
  useEffect(() => {
    if (frame.current) onPreview();
    const resize = () => {
      if (frame.current) onPreview();
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resume, twoPages, tab]);
  function editText(key, value) {
    setResume((r) => ({ ...r, [key]: value }));
  }
  const canUse = mode === "demo" || !!user;
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#">
          d<span>j</span>
          <b>
            dream job<span>RESUME STUDIO</span>
          </b>
        </a>
        <div className="account">
          <span className={"connection " + (mode === "offline" ? "muted" : "")}>
            {mode === "demo"
              ? "Local demo · no AI"
              : mode === "offline"
                ? "Offline editor"
                : "Secure AI backend"}
          </span>
          {auth ? (
            <button
              onClick={() =>
                (user
                  ? signOut(auth)
                  : signInWithPopup(auth, new GoogleAuthProvider())
                ).catch((e) => setError(e.message))
              }
            >
              {user ? "Sign out" : "Sign in with Google"}
            </button>
          ) : (
            <span className="small">Local profile stays in this browser</span>
          )}
        </div>
      </header>
      <main className="workspace">
        <div className="intro">
          <div>
            <p className="eyebrow">YOUR NEXT CHAPTER</p>
            <h1>
              Your experience.
              <br />
              <span>A sharper story.</span>
            </h1>
            <p>
              Turn your real experience into a resume built for the opportunity.
            </p>
          </div>
          <div className="privacy">
            <span>✦</span>
            <p>
              <strong>Grounded in your experience</strong>
              <br />
              Your facts. Your template. You make the final call.
            </p>
          </div>
        </div>
        <nav className="tabs">
          {["Tailor", "Profile", "Template"].map((t) => (
            <button
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setError("");
              }}
              key={t}
            >
              {t === "Tailor" ? "01" : t === "Profile" ? "02" : "03"} &nbsp; {t}
            </button>
          ))}
        </nav>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        <div className="notice">
          Original resume PDF is missing. Profile text was imported from the
          supplied HTML and needs your confirmation. Project and portfolio URLs
          were not supplied.
        </div>
        {tab === "Profile" ? (
          <section className="card">
            <h2>Your professional profile</h2>
            <p>
              Edit the structured facts below. Dates and contact details are
              never rewritten by AI. Add real HTTPS URLs in the links arrays.
              This information is stored locally and sent to the backend only
              when you generate or export.
            </p>
            <textarea
              className="json-editor"
              aria-label="Professional profile JSON"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="actions">
              <button className="primary" onClick={saveProfile}>
                Save profile
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("dream-job-profile");
                  setProfile(initialProfile);
                  setResume(initialProfile);
                  setDraft(JSON.stringify(initialProfile, null, 2));
                  setResult(null);
                }}
              >
                Reset local profile
              </button>
            </div>
          </section>
        ) : (
          <div className="columns">
            <aside>
              {tab === "Tailor" ? (
                <>
                  <section className="card">
                    <p className="eyebrow">01 / THE OPPORTUNITY</p>
                    <h2>What’s your next role?</h2>
                    <label htmlFor="job">Job description</label>
                    <textarea
                      id="job"
                      placeholder="Paste the full job description here, including responsibilities and requirements…"
                      value={job}
                      maxLength={18000}
                      onChange={(e) => setJob(e.target.value)}
                    />
                    <div className="input-meta">
                      <span>Include requirements for a better match</span>
                      <span>{job.length.toLocaleString()} / 18,000</span>
                    </div>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={profile.confirmed}
                        onChange={(e) => {
                          const p = { ...profile, confirmed: e.target.checked };
                          setProfile(p);
                          setResume((r) => ({ ...r, confirmed: p.confirmed }));
                          setDraft(JSON.stringify(p, null, 2));
                        }}
                      />
                      I reviewed and confirm the profile facts and links.
                    </label>
                    <button
                      className="primary wide"
                      disabled={
                        !!busy ||
                        !profile.confirmed ||
                        job.trim().length < 40 ||
                        !canUse
                      }
                      onClick={() => generate()}
                    >
                      ✦ &nbsp; {busy || "Analyze & Generate"}
                    </button>
                    {!canUse && (
                      <p className="small">
                        {auth
                          ? "Sign in to use AI and PDF export."
                          : "Configure Firebase and the backend for AI and PDF export. You can edit and preview now."}
                      </p>
                    )}
                  </section>
                  {result ? (
                    <section className="card analysis">
                      <p className="eyebrow">02 / YOUR MATCH</p>
                      <div className="score">
                        <strong>
                          {result.demo ? "—" : result.score}
                          <small>{result.demo ? "Demo" : " / 100"}</small>
                        </strong>
                        <span>{result.jobTitle}</span>
                      </div>
                      <p className="small">
                        Estimated fit, not hiring probability. Mandatory
                        requirements weigh 3× preferred; partial matches earn
                        half credit.
                      </p>
                      {[
                        ["Strengths", result.strengths],
                        ["Potential gaps", result.gaps],
                        ["Resume emphasis", result.recommendations],
                        ["Relevant skills", result.relevantSkills],
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
                      <h3>Requirements and evidence</h3>
                      {result.requirements.map((r, i) => (
                        <div className="requirement" key={i}>
                          <b>
                            {r.status.toUpperCase()} ·{" "}
                            {r.mandatory ? "Mandatory" : "Preferred"}
                          </b>
                          <p>{r.requirement}</p>
                          <small>
                            {r.evidence || "No supporting evidence"}
                          </small>
                        </div>
                      ))}
                    </section>
                  ) : (
                    <section className="card steps">
                      <p className="eyebrow">BUILT AROUND YOUR TRUTH</p>
                      <h3>A focused resume, in three steps</h3>
                      <p>
                        <b>1</b> Confirm your professional profile
                      </p>
                      <p>
                        <b>2</b> Analyze the opportunity
                      </p>
                      <p>
                        <b>3</b> Review, refine, and export
                      </p>
                    </section>
                  )}
                </>
              ) : (
                <section className="card">
                  <h2>Your approved template</h2>
                  <p>
                    The supplied v5 design is preserved, including the blue
                    header, two-column section layout, typography, and adaptive
                    spacing.
                  </p>
                  <p>
                    Font sizes stay fixed while whitespace adapts. Longer
                    content is never hidden.
                  </p>
                  <p>
                    The unmodified original is retained in
                    templates/resume_template_dynamic_v5.html.
                  </p>
                </section>
              )}
            </aside>
            <section className="preview-panel">
              <div className="preview-toolbar">
                <div>
                  <p className="eyebrow">LIVE PREVIEW</p>
                  <h2>
                    {result
                      ? "Your tailored resume"
                      : "Your resume, ready to refine"}
                  </h2>
                </div>
                <button onClick={() => setEditing(!editing)}>
                  {editing ? "Done editing" : "Edit resume"}
                </button>
              </div>
              <div className="layout-status">
                <span className={layout?.overflow ? "warn" : "fit"}>
                  {layout
                    ? layout.overflow
                      ? "Exceeds one A4 page"
                      : `A4 fit · ${layout.density} spacing`
                    : "Measuring layout…"}
                </span>
                <span>Selectable text · live links</span>
              </div>
              {layout?.overflow && (
                <div className="notice">
                  Spacing is at its compact limit. Generate a concise version,
                  shorten text manually, or choose two pages. Export never
                  silently crops content.
                  {result && (
                    <button
                      disabled={!!busy || !canUse}
                      onClick={() => generate(true)}
                    >
                      Create concise version
                    </button>
                  )}
                </div>
              )}
              {editing && (
                <div className="resume-editor">
                  <label>
                    Headline
                    <input
                      value={resume.headline}
                      onChange={(e) => editText("headline", e.target.value)}
                    />
                  </label>
                  <label>
                    Summary
                    <textarea
                      value={resume.summary}
                      onChange={(e) => editText("summary", e.target.value)}
                    />
                  </label>
                  <label>
                    Skills (one per line)
                    <textarea
                      value={resume.skills.join("\n")}
                      onChange={(e) =>
                        editText("skills", e.target.value.split("\n"))
                      }
                    />
                  </label>
                  {resume.employment.map((j, i) => (
                    <div key={j.id}>
                      <h3>{j.title}</h3>
                      {j.bullets.map((b, k) => (
                        <textarea
                          aria-label={`Experience ${i + 1} bullet ${k + 1}`}
                          key={k}
                          value={b}
                          onChange={(e) =>
                            setResume((r) => ({
                              ...r,
                              employment: r.employment.map((x, n) =>
                                n === i
                                  ? {
                                      ...x,
                                      bullets: x.bullets.map((s, m) =>
                                        m === k ? e.target.value : s,
                                      ),
                                    }
                                  : x,
                              ),
                            }))
                          }
                        />
                      ))}
                    </div>
                  ))}
                  {resume.projects.map((p, i) => (
                    <label key={p.id}>
                      {p.name}
                      <textarea
                        value={p.description}
                        onChange={(e) =>
                          setResume((r) => ({
                            ...r,
                            projects: r.projects.map((x, n) =>
                              n === i
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          }))
                        }
                      />
                    </label>
                  ))}
                  <p className="small">
                    Your manual edits are not independently fact checked. Review
                    before exporting.
                  </p>
                </div>
              )}
              <div className="paper-viewport">
                <div className="paper-stage">
                  <iframe
                    title="Resume preview"
                    ref={frame}
                    srcDoc="<!doctype html><html><head></head><body></body></html>"
                    onLoad={onPreview}
                  />
                </div>
              </div>
              <div className="export-bar">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={twoPages}
                    onChange={(e) => setTwoPages(e.target.checked)}
                  />
                  Allow two pages
                </label>
                <button
                  className="primary"
                  disabled={
                    !!busy ||
                    !canUse ||
                    !resume.confirmed ||
                    (!twoPages && layout?.overflow)
                  }
                  onClick={download}
                >
                  {busy === "Rendering PDF…" ? busy : "Download PDF ↓"}
                </button>
              </div>
              <p className="small export-note">
                PDF uses the same template and spacing as this preview. Review
                every statement and link before sharing.
              </p>
            </section>
          </div>
        )}
        <footer>
          Made for your next move. &nbsp; · &nbsp; Private by design.
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
