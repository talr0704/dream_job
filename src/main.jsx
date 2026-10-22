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
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-sans/latin-800.css";
import { profileSchema, resumeProfile } from "../shared/model.js";
import { emptyProfile, profileDraftSchema } from "../shared/workspace.js";
import {
  destinations,
  World,
  Screen,
  PixelButton,
} from "./components/World.jsx";
import { Journal } from "./components/Journal.jsx";
import { Match } from "./components/Match.jsx";
import { Builder } from "./components/Builder.jsx";
import { Library } from "./components/Library.jsx";
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
const screenInfo = {
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
    const parsed = profileDraftSchema.safeParse(
      JSON.parse(localStorage.getItem("dream-job-profile")),
    );
    return parsed.success && parsed.data.name ? parsed.data : null;
  } catch {
    return null;
  }
}
function App() {
  const [screen, setScreen] = useState(currentScreen),
    [profile, setProfile] = useState(emptyProfile),
    [revision, setRevision] = useState(0),
    [job, setJob] = useState(""),
    [sourceJob, setSourceJob] = useState(""),
    [result, setResult] = useState(null),
    [resume, setResume] = useState(emptyProfile),
    [user, setUser] = useState(null),
    [mode, setMode] = useState("offline"),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [items, setItems] = useState([]),
    [twoPages, setTwoPages] = useState(false),
    [loaded, setLoaded] = useState(false),
    [legacy, setLegacy] = useState(legacyBrowserProfile);
  const requestIdentity = useRef(0);
  const canUse = mode === "demo" || (mode === "authenticated" && !!user);
  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), []);
  useEffect(() => {
    fetch(apiBase + "/api/health")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => setMode(d.mode))
      .catch(() => setMode("offline"));
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
  function go(id) {
    if (id === screen) return;
    location.hash = id;
    setScreen(id);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      document.getElementById(id + "-title")?.focus(),
    );
  }
  async function request(path, body, method = "POST") {
    const token = user ? await user.getIdToken() : null;
    const multipart = body instanceof FormData;
    const response = await fetch(apiBase + path, {
      method,
      headers: {
        ...(!multipart ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body !== undefined
        ? { body: multipart ? body : JSON.stringify(body) }
        : {}),
    });
    if (!response.ok) {
      let data;
      try {
        data = await response.json();
      } catch {}
      throw Error(
        data?.details
          ? data.details
              .map((i) => i.path.join(".") + ": " + i.message)
              .join("; ")
          : data?.error ||
              "Backend unavailable. Check your connection or deployment configuration.",
      );
    }
    return response;
  }
  useEffect(() => {
    const id = ++requestIdentity.current;
    setLoaded(false);
    setProfile(emptyProfile);
    setResume(emptyProfile);
    setItems([]);
    setResult(null);
    setSourceJob("");
    setJob("");
    setError("");
    if (!canUse) return;
    Promise.all([
      request("/api/profile", {}).then((r) => r.json()),
      request("/api/resumes", undefined, "GET").then((r) => r.json()),
    ])
      .then(([p, collection]) => {
        if (id !== requestIdentity.current) return;
        const valid = profileDraftSchema.parse(p);
        setProfile(valid);
        setResume(valid);
        setItems(collection);
        setRevision((v) => v + 1);
        setLoaded(true);
      })
      .catch((e) => {
        if (id === requestIdentity.current) setError(e.message);
      });
    return () => {
      requestIdentity.current++;
    };
  }, [mode, user?.uid]);
  async function task(label, fn) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy("");
    }
  }
  async function saveProfile(p) {
    return task("Saving profile…", async () => {
      const response = await request("/api/profile", p, "PUT");
      const saved = await response.json();
      setProfile(saved);
      setRevision((v) => v + 1);
      setMessage("Journal saved. Existing saved resumes are unchanged.");
      if (!result && !sourceJob) setResume(saved);
    });
  }
  async function generate(concise = false) {
    return task(
      concise ? "Creating concise version…" : "Analyzing your fit…",
      async () => {
        const source = concise ? resume : profile;
        const description = concise ? sourceJob : job;
        const response = await request("/api/generate", {
          profile: source,
          jobDescription: description,
          concise,
        });
        const data = await response.json();
        setResult(data);
        setResume(resumeProfile(source, data));
        setSourceJob(description);
        setTwoPages(false);
        setMessage(
          data.demo
            ? "Local demo: profile preview generated. Job fit has not been assessed."
            : "Tailored draft generated. Review all claims in CV Builder before sharing.",
        );
      },
    );
  }
  async function download(p, pages = false) {
    return task("Rendering PDF…", async () => {
      profileSchema.parse(p);
      const response = await request("/api/pdf", {
        profile: p,
        twoPages: pages,
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored-resume.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function saveVersion(title, folder) {
    return task("Saving version…", async () => {
      const response = await request("/api/resumes", {
        twoPages,
        title: title.trim(),
        folder: folder.trim(),
        jobDescription: sourceJob,
        profile: resume,
        analysis: result,
      });
      const saved = await response.json();
      setItems((list) => [saved, ...list]);
      setMessage(
        "New version saved to My Resumes. Earlier versions remain unchanged.",
      );
    });
  }
  async function organize(id, patch) {
    return task("Organizing…", async () => {
      const response = await request("/api/resumes/" + id, patch, "PATCH");
      const saved = await response.json();
      setItems((list) => list.map((i) => (i.id === id ? saved : i)));
      setMessage("Collection updated.");
    });
  }
  async function remove(id) {
    return task("Deleting version…", async () => {
      await request("/api/resumes/" + id, undefined, "DELETE");
      setItems((list) => list.filter((i) => i.id !== id));
      setMessage("Saved version deleted.");
    });
  }
  function openVersion(item) {
    setResume(structuredClone(item.profile));
    setSourceJob(item.jobDescription);
    setJob(item.jobDescription);
    setResult(item.analysis);
    setTwoPages(item.twoPages || false);
    go("builder");
    setMessage(
      "Historical version opened. Save as a new version to keep your edits.",
    );
  }
  async function account() {
    try {
      if (user) await signOut(auth);
      else await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(e.message);
    }
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
          {mode === "demo"
            ? "Local demo · no AI"
            : mode === "offline"
              ? "Offline · backend not connected"
              : user
                ? "Secure session · " + user.email
                : "Sign in for your private workspace"}
        </span>
        {auth && (
          <PixelButton onClick={account}>
            {user ? "Sign out" : "Sign in with Google"}
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
        {mode === "demo" && screen !== "home" && (
          <p className="mode-note">
            Local demo: editing, saved versions, and PDF export work. AI
            analysis and profile extraction require the live backend.
          </p>
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
        {screen === "home" ? (
          <World go={go} />
        ) : (
          <Screen
            id={screen}
            eyebrow={screenInfo[screen][0]}
            title={screenInfo[screen][1]}
          >
            {!canUse ? (
              <div className="panel">
                <h2>Your private career adventure</h2>
                <p>
                  {mode === "offline"
                    ? "Start the backend to load your profile and saved resumes."
                    : "Sign in with an authorized Google account to load your private workspace."}
                </p>
                {auth && !user && (
                  <PixelButton onClick={account}>
                    Sign in with Google
                  </PixelButton>
                )}
              </div>
            ) : !loaded ? (
              <div className="panel" role="status">
                Opening your career journal…
              </div>
            ) : (
              <>
                {screen === "profile" && (
                  <Journal
                    key={revision}
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
                    busy={busy}
                    canUse={canUse}
                    go={go}
                  />
                )}{" "}
                {screen === "builder" && (
                  <Builder
                    resume={resume}
                    setResume={setResume}
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
createRoot(document.getElementById("root")).render(<App />);
