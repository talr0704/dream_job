import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import profile from "../shared/profile.json" with { type: "json" };
import {
  emptyProfile,
  profileDraftSchema,
  resumeSnapshotSchema,
  profileChanges,
} from "../shared/workspace.js";
import { createStore } from "../server/store.js";
import { PDFDocument } from "pdf-lib";
import { extractFile } from "../server/import.js";
import { exportPDF, closeBrowser } from "../server/pdf.js";
const confirmed = { ...profile, confirmed: true };
const snapshot = {
  title: "Frontend developer",
  folder: "Applications",
  jobDescription:
    "Seeking a JavaScript developer with React and Firebase experience.",
  profile: confirmed,
  analysis: null,
};
test("incomplete profiles remain drafts; confirmation requires facts and changes are explicit", () => {
  assert.ok(profileDraftSchema.safeParse(emptyProfile).success);
  assert.equal(
    profileDraftSchema.safeParse({ ...emptyProfile, confirmed: true }).success,
    false,
  );
  assert.equal(
    profileDraftSchema.safeParse({
      ...profile,
      employment: [profile.employment[0], profile.employment[0]],
    }).success,
    false,
  );
  assert.deepEqual(
    profileChanges(profile, { ...profile, headline: "New title" }),
    ["headline"],
  );
  assert.equal(
    resumeSnapshotSchema.safeParse({ ...snapshot, profile }).success,
    false,
  );
});
test("private profile and immutable resume snapshots survive store recreation and remain user scoped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dream-job-store-"));
  try {
    const file = join(dir, "data.json");
    const store = createStore({ demo: true, file });
    await store.saveProfile("alice", confirmed);
    const saved = await store.saveResume("alice", snapshot);
    await store.saveProfile("alice", {
      ...confirmed,
      headline: "Updated current profile",
    });
    const fresh = createStore({ demo: true, file });
    assert.equal(
      (await fresh.getProfile("alice")).headline,
      "Updated current profile",
    );
    assert.deepEqual((await fresh.listResumes("alice"))[0].profile, confirmed);
    assert.deepEqual(await fresh.listResumes("bob"), []);
    assert.equal(
      await fresh.updateResume("bob", saved.id, {
        title: "Unauthorized",
        folder: "",
      }),
      null,
    );
    assert.equal(await fresh.deleteResume("bob", saved.id), false);
    const updated = await fresh.updateResume("alice", saved.id, {
      title: "New label",
      folder: "Interviews",
    });
    assert.deepEqual(updated.profile, confirmed);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(await fresh.deleteResume("alice", saved.id), true);
    assert.deepEqual(await fresh.listResumes("alice"), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("PDF and DOCX imports extract real text and reject invalid, scanned and oversized content", async () => {
  try {
    const pdf = await exportPDF(confirmed);
    const text = await extractFile({ originalname: "resume.pdf", buffer: pdf });
    assert.match(text, /tal rozen/);
    const blankPDF = await PDFDocument.create();
    blankPDF.addPage();
    await assert.rejects(
      extractFile({
        originalname: "scan.pdf",
        buffer: Buffer.from(await blankPDF.save()),
      }),
      /no readable text/,
    );
    const docx = zipSync({
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      "word/document.xml": strToU8(
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Verified professional background with JavaScript development.</w:t></w:r></w:p></w:body></w:document>',
      ),
    });
    assert.match(
      await extractFile({
        originalname: "resume.docx",
        buffer: Buffer.from(docx),
      }),
      /Verified professional/,
    );
    await assert.rejects(
      extractFile({
        originalname: "resume.pdf",
        buffer: Buffer.from("not a PDF"),
      }),
      /File content/,
    );
    await assert.rejects(
      extractFile({
        originalname: "resume.docx",
        buffer: Buffer.from(
          zipSync({ "huge.xml": new Uint8Array(9 * 1024 * 1024) }),
        ),
      }),
      /safe import limit/,
    );
  } finally {
    await closeBrowser();
  }
});
test("profile, inventory and AI proposal API routes validate requests and persist independently", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dream-job-api-"));
  const api = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: "3014",
      LOCAL_DEMO: "true",
      DEMO_STORE_PATH: join(dir, "store.json"),
    },
    stdio: "ignore",
  });
  const request = (path, body, method = "POST") =>
    fetch("http://127.0.0.1:3014/api" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch("http://127.0.0.1:3014/api/health")).ok) break;
      } catch {}
      await delay(100);
    }
    assert.equal((await request("/profile", emptyProfile, "PUT")).status, 200);
    assert.deepEqual(
      await (await request("/profile", {})).json(),
      emptyProfile,
    );
    assert.equal(
      (await request("/profile", { ...emptyProfile, confirmed: true }, "PUT"))
        .status,
      400,
    );
    const savedResponse = await request("/resumes", snapshot);
    assert.equal(savedResponse.status, 201);
    const saved = await savedResponse.json();
    await request("/profile", { ...confirmed, name: "Edited profile" }, "PUT");
    assert.equal(
      (await (await request("/resumes", undefined, "GET")).json())[0].profile
        .name,
      confirmed.name,
    );
    assert.equal(
      (await request("/resumes/" + saved.id, { profile: confirmed }, "PATCH"))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "/resumes/" + saved.id,
          { title: "Interview copy", folder: "Interview" },
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/profile/propose", {
          profile: emptyProfile,
          information: "I have developed JavaScript applications.",
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await request("/profile/propose", {
          profile: emptyProfile,
          information: "short",
        })
      ).status,
      400,
    );
    const badFile = new FormData();
    badFile.append("resume", new Blob(["not a resume"]), "resume.pdf");
    assert.equal(
      (
        await fetch("http://127.0.0.1:3014/api/profile/import", {
          method: "POST",
          body: badFile,
        })
      ).status,
      422,
    );
    assert.equal(
      (await request("/resumes/" + saved.id, undefined, "DELETE")).status,
      200,
    );
    assert.deepEqual(
      await (await request("/resumes", undefined, "GET")).json(),
      [],
    );
  } finally {
    api.kill();
    await once(api, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});
