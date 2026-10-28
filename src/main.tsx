import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-sans/latin-800.css";
import { profileSchema } from "../shared/model.js";
import { emptyProfile, profileDraftSchema } from "../shared/workspace.js";
import {
  professionalProfileSchema,
  type ProfessionalProfile,
  type TailoredResume,
  type ResumeContent,
  type JobAnalysis,
} from "../shared/contracts";
import {
  db,
  backupSchema,
  savedResumeSchema,
  type SavedResume,
  type SavedResumeV2,
  isResumeV2,
} from "./lib/storage";
import { DreamJobClient } from "./lib/api";
import {
  toJournal,
  fromJournal,
  baseResume,
  resumeToJournal,
  displayAnalysis,
  applyManualText,
} from "./lib/adapter";
import { contentToJournal } from "./lib/content-adapter";
import {
  contentDigest,
  baseContent,
  validateContent,
  guardContent,
} from "../shared/tailoring";
import { extractDocumentText } from "./lib/documents";
import { printResume, A4OverflowError } from "./lib/print";
import {
  destinations,
  World,
  Screen,
  PixelButton,
} from "./components/World.jsx";
import { Journal } from "./components/Journal.jsx";
import { Match } from "./components/Match.jsx";
import { TailoringReview } from "./components/TailoringReview";
import { Builder } from "./components/Builder.jsx";
import { Library } from "./components/Library.jsx";
import "./style.css";
const apiBase = import.meta.env.VITE_API_URL || "";
const client = new DreamJobClient(apiBase);
const screenInfo: Record<string, string[]> = {
  profile: ["CHARACTER JOURNAL", "MY PROFESSIONAL PROFILE"],
  match: ["QUEST BOARD", "JOB MATCH"],
  builder: ["CRAFTING STATION", "CV BUILDER"],
  library: ["TREASURE CHEST", "MY RESUMES"],
};
function currentScreen() {
  const id = location.hash.slice(1);
  return screenInfo[id] ? id : "home";
}
function legacyBrowserProfile() {
  try {
    const p = profileDraftSchema.safeParse(
      JSON.parse(localStorage.getItem("dream-job-profile") || "null"),
    );
    return p.success && p.data.name ? p.data : null;
  } catch {
    return null;
  }
}
function App() {
  const [screen, setScreen] = useState(currentScreen),
    [profile, setProfile] = useState<any>(emptyProfile),
    [revision, setRevision] = useState(0),
    [job, setJob] = useState(""),
    [sourceJob, setSourceJob] = useState(""),
    [result, setResult] = useState<any>(null),
    [resume, setResume] = useState<any>(emptyProfile),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [items, setItems] = useState<any[]>([]),
    [twoPages, setTwoPages] = useState(false),
    [loaded, setLoaded] = useState(false),
    [legacy, setLegacy] = useState<any>(legacyBrowserProfile),
    [history, setHistory] = useState<any[]>([]),
    [content, setContentState] = useState<ResumeContent | null>(null),
    [contentWarnings, setContentWarnings] = useState<string[]>([]),
    [review, setReview] = useState<SavedResumeV2["review"]>(null);
  const contentRef = useRef<ResumeContent | null>(null);
  const exportOverflow = useRef<A4OverflowError | null>(null);
  function clearValidatedOverflow() {
    const previous = exportOverflow.current;
    if (!previous) return;
    // Never clear an unrelated error merely because the resume happens to fit.
    setError((current) => (current === previous.message ? "" : current));
    exportOverflow.current = null;
  }
  const master = useRef<ProfessionalProfile | null>(null),
    sourceProfile = useRef<ProfessionalProfile | null>(null),
    tailored = useRef<TailoredResume | null>(null),
    proposalProfile = useRef<ProfessionalProfile | null>(null),
    pendingProposal = useRef<ProfessionalProfile | null>(null),
    resumeAnalysis = useRef<JobAnalysis | null>(null);
  const canUse = true,
    mode = "local";
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const handler = () => {
      setScreen(currentScreen());
      setError("");
      setMessage("");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  async function load() {
    const p = await db.professionalProfiles.orderBy("updatedAt").last();
    master.current = p || null;
    sourceProfile.current = p || null;
    if (p) {
      setProfile(toJournal(p));
      setResume(toJournal(p));
      tailored.current = baseResume(p);
      contentRef.current = baseContent(p);
      setContentState(contentRef.current);
      setReview(null);
    }
    setItems(await listItems());
    setHistory(await db.profileVersions.orderBy("version").reverse().toArray());
    setLoaded(true);
    setRevision((v) => v + 1);
  }
  async function listItems() {
    return (await db.resumes.orderBy("createdAt").reverse().toArray()).map(
      (r) => ({
        ...r,
        profile: isResumeV2(r)
          ? contentToJournal(r.profile, r.content)
          : r.manualProfile || resumeToJournal(r.profile, r.resume),
        analysis:
          !isResumeV2(r) && r.analysis
            ? displayAnalysis(r.analysis, r.profile)
            : null,
        _stored: r,
      }),
    );
  }
  function go(id: string) {
    location.hash = id;
    setScreen(id);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function task(label: string, fn: () => Promise<void>) {
    setBusy(label);
    exportOverflow.current = null;
    setError("");
    setMessage("");
    try {
      await fn();
      return true;
    } catch (e) {
      exportOverflow.current = e instanceof A4OverflowError ? e : null;
      setError(e instanceof Error ? e.message : "Operation failed");
      return false;
    } finally {
      setBusy("");
    }
  }
  async function request(path: string, body: any) {
    if (!["/api/profile/import", "/api/profile/propose"].includes(path))
      throw Error("Unsupported operation");
    const text =
      body instanceof FormData
        ? await extractDocumentText(body.get("resume") as File)
        : body.information;
    const context =
      body instanceof FormData
        ? text
        : master.current
          ? JSON.stringify(master.current) +
            "\nRequested profile update (preserve existing facts unless explicitly corrected):\n" +
            text
          : text;
    const data = await client.extractProfile({ text: context });
    pendingProposal.current = data.profile;
    setMessage(data.warnings.join(" "));
    return Response.json({
      ...toJournal(data.profile),
      warnings: data.warnings,
    });
  }
  async function saveProfile(p: any) {
    return task("Saving profile…", async () => {
      if (!p.confirmed)
        throw Error(
          "Review and approve the profile before saving it locally. Unsaved draft remains in the journal.",
        );
      const canonical = fromJournal(
        p,
        proposalProfile.current || master.current || undefined,
      );
      // An accepted extraction updates the current profile, never creates an accidental competing master.
      if (master.current) {
        canonical.id = master.current.id;
        canonical.version = master.current.version;
      }
      const saved = await db.approveProfile(canonical, true);
      master.current = saved;
      proposalProfile.current = null;
      setProfile(toJournal(saved));
      setRevision((v) => v + 1);
      setHistory(
        await db.profileVersions.orderBy("version").reverse().toArray(),
      );
      if (!result && !sourceJob) {
        sourceProfile.current = saved;
        tailored.current = baseResume(saved);
        setResume(toJournal(saved));
        contentRef.current = baseContent(saved);
        setContentState(contentRef.current);
        setReview(null);
      }
      setMessage(
        "Approved profile saved in this browser. Historical resumes are unchanged.",
      );
    });
  }
  async function generate(concise = false) {
    if (concise)
      return refine(
        "Make this resume more concise without losing factual meaning.",
      );
    return task("Tailoring your resume…", async () => {
      if (!master.current)
        throw Error("Approve your professional profile first.");
      const p = structuredClone(master.current);
      const r = await client.tailorResume({
        profile: p,
        jobDescription: job,
        strategy: "evidence",
      });
      sourceProfile.current = p;
      resumeAnalysis.current = null;
      tailored.current = null;
      contentRef.current = r.content;
      setContentState(r.content);
      setContentWarnings(r.warnings);
      setReview(null);
      setResume(contentToJournal(p, r.content));
      setSourceJob(job);
      setTwoPages(false);
      go("builder");
      setMessage(
        "Tailored draft generated. Review every claim before exporting.",
      );
    });
  }
  async function analyze() {
    return task("Analyzing your fit…", async () => {
      if (!master.current)
        throw Error("Approve your professional profile first.");
      const p = structuredClone(master.current);
      const analysis = await client.analyzeJob({
        profile: p,
        jobDescription: job,
      });
      await db.saveAnalysis({
        id: crypto.randomUUID(),
        profile: p,
        jobDescription: job,
        analysis,
        createdAt: new Date().toISOString(),
      });
      setResult(displayAnalysis(analysis, p));
    });
  }
  async function refine(instructions: string) {
    return task("Refining resume…", async () => {
      if (sourceProfile.current && contentRef.current) {
        const r = await client.refineContent({
          profile: sourceProfile.current,
          content: contentRef.current,
          jobDescription: sourceJob || undefined,
          strategy: "evidence",
          instructions,
        });
        contentRef.current = r.content;
        setContentState(r.content);
        setContentWarnings(r.warnings);
        setReview(null);
        setResume(contentToJournal(sourceProfile.current, r.content));
        setMessage(
          "Refined draft ready. Review it again before exporting. Master profile is unchanged.",
        );
        return;
      }
      if (!sourceProfile.current || !tailored.current)
        throw Error("Generate or open a resume first.");
      const r = await client.refineResume({
        profile: sourceProfile.current,
        resume: applyManualText(
          sourceProfile.current,
          tailored.current,
          resume,
        ),
        instructions,
      });
      tailored.current = r;
      setResume(resumeToJournal(sourceProfile.current, r));
      setMessage("Refined draft ready. Master profile is unchanged.");
    });
  }
  async function download(p: any, pages = false) {
    return task("Rendering PDF…", async () => {
      if (contentRef.current && sourceProfile.current) {
        const current = contentRef.current,
          source = sourceProfile.current;
        if (!review || review.digest !== (await contentDigest(source, current)))
          throw Error("Review this tailored resume before exporting.");
        if (contentRef.current !== current || sourceProfile.current !== source)
          throw Error(
            "Resume changed during validation. Review the latest edits and export again.",
          );
        p = contentToJournal(source, current);
      }
      profileSchema.parse(p);
      await printResume(p, pages);
      setMessage("Check the saved PDF and its links before sending it.");
    });
  }
  async function saveVersion(title: string, folder: string) {
    return task("Saving version…", async () => {
      if (sourceProfile.current && contentRef.current) {
        await db.saveResume({
          formatVersion: 2,
          id: crypto.randomUUID(),
          title: title.trim(),
          folder: folder.trim(),
          profile: sourceProfile.current,
          content: contentRef.current,
          jobDescription: sourceJob,
          twoPages,
          createdAt: new Date().toISOString(),
          review,
          warnings: contentWarnings,
        });
        setItems(await listItems());
        setMessage(
          "Independent resume draft saved locally. Review remains separate from profile approval.",
        );
        return;
      }
      if (!sourceProfile.current || !tailored.current)
        throw Error("Approve a profile or generate a resume first.");
      profileSchema.parse(resume);
      await db.saveResume({
        id: crypto.randomUUID(),
        title: title.trim(),
        folder: folder.trim(),
        twoPages,
        jobDescription: sourceJob,
        profile: sourceProfile.current,
        resume: tailored.current,
        analysis: resumeAnalysis.current,
        createdAt: new Date().toISOString(),
        manualProfile: structuredClone(resume),
      });
      setItems(await listItems());
      setMessage("Independent resume version saved locally.");
    });
  }
  async function organize(id: string, patch: any) {
    return task("Organizing…", async () => {
      const source = await db.resumes.get(id);
      if (!source) throw Error("Resume not found");
      const checked = savedResumeSchema.parse({ ...source, ...patch });
      await db.resumes.put(checked);
      setItems(await listItems());
    });
  }
  async function remove(id: string) {
    return task("Deleting version…", async () => {
      await db.resumes.delete(id);
      setItems(await listItems());
    });
  }
  async function duplicate(id: string) {
    return task("Duplicating version…", async () => {
      await db.duplicateResume(id);
      setItems(await listItems());
    });
  }
  function updateContent(next: ResumeContent) {
    if (!sourceProfile.current) return;
    // Empty text is allowed while typing, but approval/save/export enforce schema.
    contentRef.current = next;
    setContentState(next);
    setReview(null);
    try {
      setResume(contentToJournal(sourceProfile.current, next));
    } catch {
      /* Preserve incomplete editor input until corrected. */
    }
  }
  function approveContent(checked: boolean) {
    if (!checked) {
      setReview(null);
      return;
    }
    return task("Recording resume review…", async () => {
      if (!sourceProfile.current || !contentRef.current)
        throw Error("Open a resume first.");
      const p = sourceProfile.current,
        c = validateContent(contentRef.current, p),
        key = JSON.stringify(contentRef.current);
      const guarded = guardContent(c, p);
      if (JSON.stringify(guarded.content) !== JSON.stringify(c))
        throw Error(
          "A draft edit failed focused factuality checks. Compare with the approved source or update My Profile before approval.",
        );
      const digest = await contentDigest(p, c);
      if (
        key === JSON.stringify(contentRef.current) &&
        p === sourceProfile.current
      )
        setReview({ reviewedAt: new Date().toISOString(), digest });
    });
  }
  function openVersion(item: any) {
    return task("Opening resume…", async () => {
      const r = savedResumeSchema.parse(item._stored);
      sourceProfile.current = r.profile;
      resumeAnalysis.current = isResumeV2(r) ? null : r.analysis;
      tailored.current = isResumeV2(r) ? null : r.resume;
      contentRef.current = isResumeV2(r) ? r.content : null;
      setContentState(contentRef.current);
      setContentWarnings(isResumeV2(r) ? r.warnings : []);
      setReview(
        isResumeV2(r) &&
          r.review &&
          r.review.digest === (await contentDigest(r.profile, r.content))
          ? r.review
          : null,
      );
      setResume(structuredClone(item.profile));
      setSourceJob(r.jobDescription);
      setJob(r.jobDescription);
      setResult(item.analysis);
      setTwoPages(r.twoPages);
      go("builder");
      setMessage(
        "Historical snapshot opened. Save as a new version to keep edits.",
      );
    });
  }
  function account() {
    window.open(client.signInUrl(), "_blank", "noopener,noreferrer");
  }
  async function exportBackup() {
    return task("Exporting backup…", async () => {
      const data = await db.exportBackup();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "dream-job-backup-v2.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await task("Importing backup…", async () => {
      if (file.size > 32 * 1024 * 1024)
        throw Error("Backup must be at most 32 MB.");
      const raw = JSON.parse(await file.text());
      const parsed = backupSchema.parse(raw);
      if (
        !window.confirm(
          `Import ${parsed.professionalProfiles.length} profiles and ${parsed.resumes.length} resumes? Existing IDs cancel the entire import.`,
        )
      )
        return;
      await db.importBackup(parsed);
      await load();
      setMessage("Backup imported.");
    });
  }
  async function restoreProfile(key: string) {
    if (!key) return;
    const p = await db.profileVersions.get(key);
    if (!p) return;
    proposalProfile.current = {
      ...p,
      version: master.current?.version || p.version,
    };
    setProfile({ ...toJournal(p), confirmed: false });
    setRevision((v) => v + 1);
    setMessage(
      "Historical profile loaded for review. Approve and save to create a new version.",
    );
  }
  return (
    <div className="shell">
      <header className="top">
        <button
          className="brand pixel"
          onClick={() => go("home")}
          aria-label="dream job home"
        >
          dream job ✦
        </button>
        <nav className="nav" aria-label="Main navigation">
          {[
            ["home", "Home"],
            ...destinations.map(([id, label]) => [id, label]),
          ].map(([id, label]) => (
            <PixelButton
              key={id}
              aria-current={screen === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              {label}
            </PixelButton>
          ))}
        </nav>
      </header>
      <div className="session-bar">
        <span className="session-mode">
          Local browser workspace · AI requests require Cloudflare Access
        </span>
        {apiBase && (
          <PixelButton onClick={account}>
            Open Cloudflare Access sign-in
          </PixelButton>
        )}
      </div>
      <main>
        {error && (
          <div className="error" role="alert">
            {error}
            <button
              className="edit"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}
        {message && (
          <div className="status" role="status">
            {message}
          </div>
        )}
        {screen === "profile" && canUse && loaded && legacy && (
          <div className="note">
            <p>
              A profile from the previous browser editor is available. Load it
              into your journal to review it before saving. Your stored profile
              is unchanged until you save.
            </p>
            <PixelButton
              onClick={() => {
                setProfile({ ...legacy, confirmed: false });
                setRevision((v) => v + 1);
                setLegacy(null);
                setMessage(
                  "Previous browser profile loaded for review. Confirm and save to keep it in your private workspace.",
                );
              }}
            >
              Review previous browser profile
            </PixelButton>
          </div>
        )}
        {screen === "profile" && (
          <div className="panel actions">
            <PixelButton onClick={exportBackup}>
              Export local backup
            </PixelButton>
            <label className="form-field">
              Import backup (adds records; conflicts cancel import)
              <input
                type="file"
                accept="application/json,.json"
                onChange={importBackup}
              />
            </label>
            <label className="form-field">
              Restore profile version for review
              <select
                defaultValue=""
                onChange={(e) => restoreProfile(e.target.value)}
              >
                <option value="">Choose a historical version</option>
                {history.map((p) => (
                  <option key={p.versionKey} value={p.versionKey}>
                    Version {p.version} · {p.updatedAt}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Data is stored in this browser. Export a backup before clearing
              browser data or changing the frontend origin. AI requests send the
              submitted information to the Worker and OpenAI.
            </p>
          </div>
        )}
        {screen === "home" ? (
          <World go={go} />
        ) : (
          <Screen
            id={screen}
            eyebrow={screenInfo[screen][0]}
            title={screenInfo[screen][1]}
          >
            {!loaded ? (
              <div className="panel" role="status">
                Opening your career journal…
              </div>
            ) : (
              <>
                {screen === "profile" && (
                  <Journal
                    key={revision}
                    onAcceptProposal={() => {
                      proposalProfile.current = pendingProposal.current;
                    }}
                    profile={profile}
                    onSave={saveProfile}
                    canUse={canUse}
                    busy={!!busy}
                    request={request}
                    notify={setMessage}
                  />
                )}{" "}
                {screen === "match" && (
                  <Match
                    profile={profile}
                    job={job}
                    setJob={setJob}
                    result={result}
                    generate={generate}
                    analyze={analyze}
                    busy={busy}
                    canUse={canUse}
                    go={go}
                  />
                )}{" "}
                {screen === "builder" && (
                  <Builder
                    onRefine={refine}
                    onLayoutValidated={clearValidatedOverflow}
                    resume={resume}
                    setResume={setResume}
                    requiresReview={!!content}
                    reviewed={!!review}
                    reviewPanel={
                      content && sourceProfile.current ? (
                        <TailoringReview
                          profile={sourceProfile.current}
                          content={content}
                          update={updateContent}
                          reviewed={!!review}
                          approve={approveContent}
                          busy={!!busy}
                          warnings={contentWarnings}
                        />
                      ) : null
                    }
                    twoPages={twoPages}
                    setTwoPages={setTwoPages}
                    busy={busy}
                    canUse={canUse}
                    download={download}
                    onSaveVersion={saveVersion}
                    sourceJob={sourceJob}
                    concise={() => generate(true)}
                    go={go}
                  />
                )}{" "}
                {screen === "library" && (
                  <Library
                    items={items}
                    onOpen={openVersion}
                    onDownload={download}
                    onOrganize={organize}
                    onDelete={remove}
                    onDuplicate={duplicate}
                    canUse={canUse}
                    busy={busy}
                    go={go}
                  />
                )}
              </>
            )}
            <div className="back-world">
              <PixelButton onClick={() => go("home")}>
                ← Back to Cloud World
              </PixelButton>
            </div>
          </Screen>
        )}
      </main>
      <footer className="footer">
        dream job · your story, your next chapter{" "}
        <span aria-hidden="true">✦</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
