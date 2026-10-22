import test from "node:test";
import assert from "node:assert/strict";
import profile from "../shared/profile.json" with { type: "json" };
import {
  profileSchema,
  resultSchema,
  scoreRequirements,
  demoResult,
  validateResult,
  resumeProfile,
  safeURL,
} from "../shared/model.js";
import { renderResume } from "../shared/render.js";
test("profile validates and remains unconfirmed until reviewed", () => {
  assert.equal(profileSchema.parse(profile).confirmed, false);
});
test("explainable weighted scoring", () => {
  assert.equal(
    scoreRequirements([
      { mandatory: true, status: "met" },
      { mandatory: false, status: "partial" },
      { mandatory: true, status: "missing" },
    ]),
    50,
  );
  assert.equal(scoreRequirements([]), 0);
});
test("HTTPS URLs reject scripts, credentials and placeholders", () => {
  for (const u of [
    "javascript:alert(1)",
    "http://real.com",
    "https://example.com",
    "https://user:pass@real.com",
  ])
    assert.equal(safeURL.safeParse(u).success, false);
  assert.equal(safeURL.safeParse("https://github.com/talr0704").success, true);
});
test("generation schema rejects missing and unexpected data", () => {
  assert.equal(resultSchema.safeParse({}).success, false);
  assert.equal(
    resultSchema.safeParse({ ...demoResult(profile), html: "<script/>" })
      .success,
    false,
  );
});
test("source gates reject invented skills, metrics and source references", () => {
  const raw = () => {
    const { score, ...r } = demoResult(profile);
    return r;
  };
  let r = raw();
  r.resume.skills.push("Invented");
  assert.throws(() => validateResult(r, profile), /skill/);
  r = raw();
  r.resume.summary += " Improved outcomes by 978%.";
  assert.throws(() => validateResult(r, profile), /numerical/);
  r = raw();
  r.resume.employment[0].bullets[0].sourceIndex = 999;
  assert.throws(() => validateResult(r, profile), /evidence/);
  r = raw();
  r.resume.projects = [];
  assert.throws(() => validateResult(r, profile), /projects/);
});
test("metadata, URLs, education and dates are preserved", () => {
  const merged = resumeProfile(profile, demoResult(profile));
  for (const key of ["name", "phone", "email", "links", "education"])
    assert.deepEqual(merged[key], profile[key]);
  assert.equal(merged.employment[0].dates, profile.employment[0].dates);
});
test("template escapes hostile text and never emits placeholder links", () => {
  const html = renderResume({ ...profile, name: "<script>alert(1)</script>" });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("[MindplayCode]"));
  assert.ok(html.includes("mailto:tal.rozen01@gmail.com"));
});
