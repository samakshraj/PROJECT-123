const { randomBytes, createHash } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");

initializeApp();
const db = getFirestore();
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean));
const lifetimeMs = 90_000;

function cors(req, res) {
  const origin = req.get("Origin");
  if (!origin || !allowedOrigins.has(origin)) return false;
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Max-Age", "600");
  return true;
}
function fail(res, status, message) { return res.status(status).json({ error: message }); }

exports.createDashboardHandoff = onRequest(async (req, res) => {
  if (!cors(req, res)) return fail(res, 403, "Origin not allowed");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  try {
    const bearer = req.get("Authorization") || "";
    if (!bearer.startsWith("Bearer ")) return fail(res, 401, "Missing Firebase token");
    const decoded = await getAuth().verifyIdToken(bearer.slice(7), true);
    const code = randomBytes(32).toString("base64url");
    const digest = createHash("sha256").update(code).digest("hex");
    await db.collection("authHandoffs").doc(digest).create({ uid: decoded.uid, expiresAt: Timestamp.fromMillis(Date.now() + lifetimeMs) });
    return res.json({ code });
  } catch (error) {
    console.error("Could not create sign-in handoff", error);
    return fail(res, 401, "Could not authenticate this handoff");
  }
});

exports.redeemDashboardHandoff = onRequest(async (req, res) => {
  if (!cors(req, res)) return fail(res, 403, "Origin not allowed");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(code)) return fail(res, 400, "Invalid handoff code");
  const digest = createHash("sha256").update(code).digest("hex");
  try {
    const ref = db.collection("authHandoffs").doc(digest);
    const uid = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().expiresAt.toMillis() < Date.now()) {
        if (snap.exists) tx.delete(ref);
        return null;
      }
      const value = snap.data().uid;
      tx.delete(ref);
      return value;
    });
    if (!uid) return fail(res, 401, "Handoff expired or already used");
    const auth = getAuth();
    const record = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, { ...record.customClaims, role: "authenticated" });
    const customToken = await auth.createCustomToken(uid, { role: "authenticated" });
    return res.json({ customToken });
  } catch (error) {
    console.error("Could not redeem sign-in handoff", error);
    return fail(res, 500, "Could not complete sign-in");
  }
});
