import React, { useState } from "react";
import { PixelButton, Dialog, Field } from "./World.jsx";
export function Library({
  items,
  onOpen,
  onDownload,
  onOrganize,
  onDelete,
  canUse,
  busy,
  go,
}) {
  const [query, setQuery] = useState(""),
    [collection, setCollection] = useState(""),
    [organizing, setOrganizing] = useState(null),
    [title, setTitle] = useState(""),
    [folder, setFolder] = useState(""),
    [removing, setRemoving] = useState(null);
  const filtered = items.filter(
    (i) =>
      (!collection || i.folder === collection) &&
      (i.title + " " + i.jobDescription + " " + i.folder)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <p className="lead">
        Your resume collection. Every version keeps its own story, profile
        facts, and job description.
      </p>
      <div className="panel inventory-tools">
        <Field label="Search resumes" value={query} onChange={setQuery} />
        <label className="form-field">
          Collection
          <select
            aria-label="Collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          >
            <option value="">All collections</option>
            {[...new Set(items.map((i) => i.folder).filter(Boolean))].map(
              (f) => (
                <option key={f}>{f}</option>
              ),
            )}
          </select>
        </label>
        <p>{items.length} / 100 saved versions</p>
      </div>
      {!items.length ? (
        <div className="panel collection-empty">
          <div className="quest-glyph" aria-hidden="true">
            ▣
          </div>
          <h2>Your treasure chest is waiting</h2>
          <p>
            Save a version from CV Builder to keep it here. Historical resumes
            stay unchanged when you update your profile.
          </p>
          <PixelButton onClick={() => go("builder")}>
            Visit CV Builder →
          </PixelButton>
        </div>
      ) : !filtered.length ? (
        <p className="note">No resumes match this search.</p>
      ) : (
        <div className="inventory">
          {filtered.map((item) => (
            <article className="resume-slot" key={item.id}>
              <div className="slot-glyph" aria-hidden="true">
                ▤
              </div>
              <span className="collection-label">
                {item.folder || "Unsorted"}
              </span>
              <h2>{item.title}</h2>
              <p>
                {new Date(item.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p>{item.profile.headline}</p>
              <details>
                <summary>Associated job description</summary>
                <p className="source-job">
                  {item.jobDescription ||
                    "No job description · Profile version"}
                </p>
              </details>
              <div className="actions">
                <PixelButton onClick={() => onOpen(item)}>
                  Open & edit
                </PixelButton>
                <PixelButton
                  disabled={!canUse || !!busy}
                  onClick={() =>
                    onDownload(item.profile, item.twoPages || false)
                  }
                >
                  Download PDF
                </PixelButton>
                <button
                  className="edit"
                  onClick={() => {
                    setOrganizing(item);
                    setTitle(item.title);
                    setFolder(item.folder);
                  }}
                >
                  Organize
                </button>
                <button
                  className="edit danger"
                  onClick={() => setRemoving(item)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {organizing && (
        <Dialog title="Organize resume" onClose={() => setOrganizing(null)}>
          <Field
            label="Version name"
            value={title}
            onChange={setTitle}
            maxLength={120}
          />
          <Field
            label="Collection name"
            value={folder}
            onChange={setFolder}
            maxLength={80}
          />
          <PixelButton
            disabled={!title.trim() || !!busy}
            onClick={async () => {
              if (await onOrganize(organizing.id, { title, folder }))
                setOrganizing(null);
            }}
          >
            Save organization
          </PixelButton>
        </Dialog>
      )}
      {removing && (
        <Dialog title="Delete saved version?" onClose={() => setRemoving(null)}>
          <p>
            Delete “{removing.title}”? This removes only this saved snapshot.
            Your profile and other versions stay intact.
          </p>
          <div className="actions">
            <PixelButton
              disabled={!!busy}
              onClick={async () => {
                if (await onDelete(removing.id)) setRemoving(null);
              }}
            >
              Delete this version
            </PixelButton>
            <PixelButton onClick={() => setRemoving(null)}>
              Keep version
            </PixelButton>
          </div>
        </Dialog>
      )}
    </>
  );
}
