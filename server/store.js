import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import initialProfile from "../shared/profile.json" with { type: "json" };
export function createStore({
  demo = false,
  file = process.env.DEMO_STORE_PATH || ".local/demo-store.json",
} = {}) {
  let queue = Promise.resolve();
  const local = async (fn, write = false) => {
    const operation = queue.then(async () => {
      let db = {};
      try {
        db = JSON.parse(await readFile(file, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const result = await fn(db);
      if (write) {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file + ".tmp", JSON.stringify(db), { mode: 0o600 });
        await rename(file + ".tmp", file);
      }
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  };
  const account = (db, uid) =>
    (db[uid] ??= { profile: structuredClone(initialProfile), resumes: [] });
  const userRef = (uid) => getFirestore().collection("users").doc(uid);
  const record = (uid) => userRef(uid).collection("resumes");
  const limitError = () =>
    Object.assign(
      Error(
        "Your collection is full (100 versions). Delete a version before saving another.",
      ),
      { status: 409 },
    );
  return {
    async getProfile(uid) {
      if (demo) return local((db) => account(db, uid).profile);
      const doc = await userRef(uid).get();
      return doc.data()?.profile || initialProfile;
    },
    async saveProfile(uid, profile) {
      if (demo)
        return local((db) => (account(db, uid).profile = profile), true);
      await userRef(uid).set({ profile }, { merge: true });
      return profile;
    },
    async listResumes(uid) {
      if (demo)
        return local((db) =>
          account(db, uid).resumes.toSorted((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          ),
        );
      const docs = await record(uid)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
      return docs.docs.map((d) => d.data());
    },
    async saveResume(uid, data) {
      const item = {
        ...data,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      if (demo)
        return local((db) => {
          const a = account(db, uid);
          if (a.resumes.length >= 100) throw limitError();
          a.resumes.push(item);
          return item;
        }, true);
      await getFirestore().runTransaction(async (tx) => {
        const user = await tx.get(userRef(uid));
        const count = user.data()?.resumeCount || 0;
        if (count >= 100) throw limitError();
        tx.set(userRef(uid), { resumeCount: count + 1 }, { merge: true });
        tx.create(record(uid).doc(item.id), item);
      });
      return item;
    },
    async updateResume(uid, id, patch) {
      if (demo)
        return local((db) => {
          const item = account(db, uid).resumes.find((r) => r.id === id);
          if (!item) return null;
          Object.assign(item, patch);
          return item;
        }, true);
      const ref = record(uid).doc(id);
      return getFirestore().runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists) return null;
        tx.update(ref, patch);
        return { ...doc.data(), ...patch };
      });
    },
    async deleteResume(uid, id) {
      if (demo)
        return local((db) => {
          const a = account(db, uid);
          const n = a.resumes.length;
          a.resumes = a.resumes.filter((r) => r.id !== id);
          return n !== a.resumes.length;
        }, true);
      return getFirestore().runTransaction(async (tx) => {
        const ref = record(uid).doc(id),
          doc = await tx.get(ref),
          user = await tx.get(userRef(uid));
        if (!doc.exists) return false;
        tx.delete(ref);
        tx.set(
          userRef(uid),
          { resumeCount: Math.max(0, (user.data()?.resumeCount || 0) - 1) },
          { merge: true },
        );
        return true;
      });
    },
  };
}
