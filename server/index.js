import express from "express";
import initialProfile from "../shared/profile.json" with { type: "json" };
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { profileSchema, demoResult } from "../shared/model.js";
import { generate } from "./ai.js";
import { exportPDF, closeBrowser } from "./pdf.js";
const demo = process.env.LOCAL_DEMO === "true";
if (!demo) initializeApp({ credential: applicationDefault() });
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
const origins = (process.env.ALLOWED_ORIGIN || "http://localhost:5173").split(
  ",",
);
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "160kb" }));
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, mode: demo ? "demo" : "authenticated" }),
);
app.use("/api", async (req, res, next) => {
  if (demo) {
    req.userId = "local-demo";
    return next();
  }
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return res.status(401).json({ error: "Sign in to continue." });
    const user = await getAuth().verifyIdToken(token, true);
    const allowed = (process.env.ALLOWED_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase());
    if (!user.email_verified || !allowed.includes(user.email?.toLowerCase()))
      return res.status(403).json({ error: "This account is not authorized." });
    req.userId = user.uid;
    next();
  } catch {
    res.status(401).json({ error: "Authentication expired. Sign in again." });
  }
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.userId,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Hourly limit reached. Try again later." },
  }),
);
app.post("/api/profile", (_req, res) => res.json(initialProfile));
app.use(["/api/generate", "/api/pdf"], async (req, res, next) => {
  if (demo) return next();
  try {
    const hour = Math.floor(Date.now() / 3600000);
    const ref = getFirestore()
      .collection("usage")
      .doc(req.userId + "-" + hour);
    const allowed = await getFirestore().runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const used = snapshot.data()?.count || 0;
      if (used >= 20) return false;
      tx.set(ref, {
        count: used + 1,
        expiresAt: Timestamp.fromMillis((hour + 2) * 3600000),
      });
      return true;
    });
    if (!allowed)
      return res.status(429).json({ error: "Hourly usage limit reached." });
    next();
  } catch {
    res
      .status(503)
      .json({
        error: "Usage protection unavailable. Check Firestore configuration.",
      });
  }
});
const generationInput = z
  .object({
    profile: profileSchema,
    jobDescription: z.string().trim().min(40).max(18000),
    concise: z.boolean().default(false),
  })
  .strict();
app.post("/api/generate", async (req, res, next) => {
  try {
    const { profile, jobDescription, concise } = generationInput.parse(
      req.body,
    );
    if (!profile.confirmed)
      return res
        .status(400)
        .json({ error: "Confirm your profile facts first." });
    const result = demo
      ? demoResult(profile)
      : await generate(profile, jobDescription, concise);
    res.json({ ...result, demo });
  } catch (e) {
    next(e);
  }
});
app.post("/api/pdf", async (req, res, next) => {
  try {
    const { profile, twoPages } = z
      .object({ profile: profileSchema, twoPages: z.boolean().default(false) })
      .strict()
      .parse(req.body);
    if (!profile.confirmed)
      return res
        .status(400)
        .json({ error: "Confirm your profile facts first." });
    res
      .type("application/pdf")
      .attachment("tailored-resume.pdf")
      .send(await exportPDF(profile, twoPages));
  } catch (e) {
    next(e);
  }
});
app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError)
    return res
      .status(400)
      .json({
        error: "Invalid input",
        details: err.issues.map((i) => ({ path: i.path, message: i.message })),
      });
  if (err.type === "entity.too.large")
    return res.status(413).json({ error: "Input is too large." });
  console.error("Request failed:", err.name, err.status || 500);
  res
    .status(err.status === 422 ? 422 : 502)
    .json({
      error:
        err.status === 422
          ? err.message
          : "The request could not be completed. Check backend configuration or try again.",
    });
});
const server = app.listen(
  process.env.PORT || 3001,
  demo ? "127.0.0.1" : "0.0.0.0",
  (error) => {
    if (error) {
      console.error("API could not start:", error.code);
      process.exit(1);
    }
    console.log(`Resume API started (${demo ? "local demo" : "authenticated"})`);
  },
);

for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    const forceExit = setTimeout(() => process.exit(1), 10000);
    forceExit.unref();
    await closeBrowser();
    server.close(() => process.exit(0));
  });
