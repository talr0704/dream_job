import React, { useEffect, useRef } from "react";
export const destinations = [
  ["profile", "My Profile", "♟", "Your story, your character", "#f6b6db"],
  ["match", "Job Match", "✦", "Discover your strengths", "#a6e9ee"],
  ["builder", "CV Builder", "▤", "Craft your next chapter", "#ffe1a0"],
  ["library", "My Resumes", "▣", "Keep every version safe", "#bcebcf"],
];
export function PixelButton({ children, className = "", ...props }) {
  return (
    <button className={"btn " + className} {...props}>
      {children}
    </button>
  );
}
export function Scenery() {
  return (
    <div className="sky" aria-hidden="true">
      <div className="cloud c1" />
      <div className="cloud c2" />
      <div className="cloud c3" />
      <div className="cloud c4" />
      <div className="star s1">✦</div>
      <div className="star s2">✧</div>
      <div className="star s3">♥</div>
      <div className="sun" />
      <div className="distant-hills" />
      <div className="city city-back" />
      <div className="city" />
      <div className="city-windows" />
    </div>
  );
}
export function World({ go }) {
  const scene = useRef();
  return (
    <section
      className="scene"
      ref={scene}
      onPointerMove={(e) => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          "--parallax",
          ((e.clientX - rect.left) / rect.width - 0.5) * 10 + "px",
        );
      }}
      onPointerLeave={(e) =>
        e.currentTarget.style.setProperty("--parallax", "0px")
      }
      aria-labelledby="world-title"
    >
      <Scenery />
      <div className="home-content">
        <div className="eyebrow">✦ YOUR CAREER ADVENTURE ✦</div>
        <h1 className="hero-title" id="world-title">
          dream
          <br />
          job
        </h1>
        <div className="hero-copy">Your future is waiting in the clouds.</div>
        <div className="islands">
          {destinations.map(([id, title, icon, copy, bg]) => (
            <button
              className="island"
              style={{ "--bg": bg }}
              onClick={() => go(id)}
              key={id}
            >
              <div className="glyph" aria-hidden="true">
                {icon}
              </div>
              <strong>{title}</strong>
              <span>{copy}</span>
              <i className="platform-texture" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
export function Screen({ id, eyebrow, title, children }) {
  return (
    <section
      className={"screen active screen-" + id}
      aria-labelledby={id + "-title"}
    >
      <div className="eyebrow">✦ {eyebrow} ✦</div>
      <h1 className="section-title pixel" id={id + "-title"} tabIndex={-1}>
        {title}
      </h1>
      {children}
    </section>
  );
}
export function Dialog({ title, children, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    const focus = () =>
      dialog.querySelector("input,textarea,button,select")?.focus();
    focus();
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const items = [
          ...dialog.querySelectorAll("button,input,textarea,select,a[href]"),
        ].filter((n) => !n.disabled);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="dialog-header">
          <h2 id="dialog-title">{title}</h2>
          <button className="edit" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Field({ label, value, onChange, multiline = false, ...props }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <label className="form-field">
      <span>{label}</span>
      <Tag
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </label>
  );
}
