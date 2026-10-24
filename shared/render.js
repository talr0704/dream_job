import { templateCSS } from "./template-css.js";
export const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const e = escapeHTML;
const links = (items) =>
  items
    .map(
      (l) =>
        `<a href="${e(l.url)}" target="_blank" rel="noopener noreferrer">${e(l.label)}</a>`,
    )
    .join(" · ");
const section = (name, html) =>
  `<section class="section"><div class="section-label">${name}</div><div class="content">${html}</div></section>`;
export function renderResume(p, { pages = "one" } = {}) {
  return `<article class="paper" id="paper" data-pages="${pages === "two" ? "two" : "one"}"><header class="header"><h1 class="name">${e(p.name)}</h1><p class="role">${e(p.headline)}</p><div class="contact"><span>${e(p.phone)}</span>${p.email ? ` | <a href="mailto:${e(p.email)}">${e(p.email)}</a>` : ""}${p.location ? " | " + e(p.location) : ""}${p.links.length ? " | " + links(p.links) : ""}</div></header><main class="body">${section("Summary", `<p>${e(p.summary)}</p>`)}${section("Skills", `<p>${p.skills.map(e).join(" | ")}</p>`)}${section("Experience", p.employment.map((j) => `<div class="job-header"><div class="job-title">${e(j.title)}</div><div class="job-meta"><strong>${e(j.company)}</strong><span>${e(j.dates)}</span></div></div><ul class="bullets">${j.bullets.map((b) => `<li>${e(b)}</li>`).join("")}</ul>`).join("") + p.projects.map((p) => `<div class="project"><strong>${e(p.name)}${p.links.length ? " · " + links(p.links) : ""}</strong><p>${e(p.description)}</p></div>`).join(""))}${p.certifications?.length ? section("Certifications", p.certifications.map((c) => `<p><strong>${e(c.name)}</strong> · ${e(c.issuer)} ${e(c.dates)}${c.url ? " · " + links([{ label: c.name, url: c.url }]) : ""}</p>`).join("")) : ""}${p.languages?.length ? section("Languages", `<p>${p.languages.map((l) => e(l.name) + (l.proficiency ? " · " + e(l.proficiency) : "")).join(" | ")}</p>`) : ""}${section("Education", p.education.map((d) => `<div class="education"><div><strong>${e(d.degree)}</strong><small>${e(d.dates)}</small></div><div class="school"><strong>${e(d.school)}</strong></div></div>`).join(""))}</main></article>`;
}
// This function is shared by browser preview and Chromium PDF generation.
export function fitPaper() {
  const paper = document.querySelector(".paper");
  const body = paper.querySelector(".body");
  const limit = (paper.getBoundingClientRect().width * 297) / 210;
  const used = () =>
    body.getBoundingClientRect().bottom - paper.getBoundingClientRect().top;
  for (const key of ["section", "bullet", "project"])
    paper.style.setProperty("--extra-" + key, "0px");
  for (const mode of ["comfortable", "balanced", "compact"]) {
    paper.dataset.density = mode;
    if (used() <= limit - 16) break;
  }
  if (used() < limit - 16) {
    const sections = paper.querySelectorAll(".section").length,
      bullets = paper.querySelectorAll(".bullets li:not(:last-child)").length,
      projects = paper.querySelectorAll(".project:not(:last-child)").length;
    const available = limit - 16 - used();
    const extra = Math.min(
      12,
      available / (sections * 2 + bullets * 0.65 + projects * 0.8),
    );
    paper.style.setProperty("--extra-section", extra + "px");
    const bullet = Math.min(
      9,
      Math.max(0, available - extra * sections * 2) /
        (bullets + projects * 1.3 || 1),
    );
    paper.style.setProperty("--extra-bullet", bullet + "px");
    paper.style.setProperty(
      "--extra-project",
      Math.min(12, bullet * 1.3) + "px",
    );
  }
  return {
    overflow: used() > limit + 1,
    height: used(),
    limit,
    density: paper.dataset.density,
  };
}
export function resumeDocument(p, options) {
  return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><style>${templateCSS}</style></head><body>${renderResume(p, options)}</body></html>`;
}
