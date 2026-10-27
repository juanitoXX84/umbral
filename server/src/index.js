import express from "express";
import cors from "cors";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { Server } from "socket.io";
import { db, uploadDir } from "./db.js";
import { hashPassword, verifyPassword, signToken, verifyToken } from "./auth.js";
import { gmailReady, sendAlertMail, sendPlanReceipt } from "./mail.js";
import { pushToUsers } from "./notify.js";

const PORT = Number(process.env.PORT || 4000);
const HOUR48 = 48 * 60 * 60 * 1000;
const EVENT_TYPES = new Set(["fall", "impact", "struggle", "manual", "sos"]);
const EVENT_COPY = {
  fall: "Posible caída",
  impact: "Impacto fuerte",
  struggle: "Forcejeo",
  manual: "Alerta de prueba",
  sos: "Pidió ayuda desde el reloj",
};

function storedName(file) {
  const raw = String(file.originalname || "").split(".").pop()?.toLowerCase();
  const known = ["m4a", "mp4", "mp3", "webm", "3gp", "aac", "wav", "mov", "caf", "jpg", "jpeg", "png", "webp", "heic"];
  let ext = known.includes(raw) ? raw : "";
  if (ext === "jpeg") ext = "jpg";
  if (!ext && file.mimetype?.includes("png")) ext = "png";
  else if (!ext && file.mimetype?.includes("webp")) ext = "webp";
  else if (!ext && file.mimetype?.includes("jpeg")) ext = "jpg";
  else if (!ext && String(file.mimetype || "").startsWith("image/")) ext = "jpg";
  else if (!ext && file.mimetype?.includes("mp4")) ext = "mp4";
  else if (!ext && file.mimetype?.includes("webm")) ext = "webm";
  else if (!ext) ext = "m4a";
  return `${crypto.randomUUID()}.${ext}`;
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => cb(null, storedName(file)),
});
const upload = multer({ storage, limits: { fileSize: 40 * 1024 * 1024 } });
const uploadAlert = upload.fields([
  { name: "audio", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadDir));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

function bad(res, message, code = 400) {
  return res.status(code).json({ error: message });
}

function nowIso() {
  return new Date().toISOString();
}

function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return code;
}

function parseSensors(raw) {
  const empty = { accel: null, gyro: null, proximity: null, light: null, heading: null, headingAccuracy: null };
  if (!raw) return empty;
  try {
    const value = JSON.parse(raw);
    return {
      accel: value.accel ?? null,
      gyro: value.gyro ?? null,
      proximity: value.proximity ?? null,
      light: value.light ?? null,
      heading: typeof value.heading === "number" ? value.heading : null,
      headingAccuracy: typeof value.headingAccuracy === "number" ? value.headingAccuracy : null,
    };
  } catch {
    return empty;
  }
}

function mergeSensors(current, body) {
  return {
    accel: numberOr(body?.accel, current.accel),
    gyro: numberOr(body?.gyro, current.gyro),
    proximity: body?.proximity === "cerca" || body?.proximity === "lejos" ? body.proximity : current.proximity,
    light: numberOr(body?.light, current.light),
    heading: numberOr(body?.heading, current.heading),
    headingAccuracy: numberOr(body?.headingAccuracy, current.headingAccuracy),
  };
}

function readZone(body) {
  if (body?.zoneLat == null || body?.zoneLng == null || body.zoneLat === "" || body.zoneLng === "") return null;
  const lat = Number(body.zoneLat);
  const lng = Number(body.zoneLng);
  const radius = Number(body.zoneRadius);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const meters = Number.isFinite(radius) ? Math.min(2000, Math.max(40, Math.round(radius))) : 150;
  return { lat, lng, radius: meters };
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    photoUrl: row.photo_path || null,
  };
}

function memberPayload(row) {
  return {
    userId: row.user_id,
    name: row.user_name,
    photoUrl: row.photo_path || null,
    role: row.role,
    protectionArmed: !!row.protection_armed,
    lat: row.last_lat,
    lng: row.last_lng,
    accuracy: row.last_accuracy,
    lastSeen: row.last_seen,
    sensors: parseSensors(row.sensor_json),
  };
}

function membersOf(homeId) {
  return db
    .prepare(
      `SELECT m.*, u.name AS user_name, u.photo_path
       FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.home_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(homeId)
    .map(memberPayload);
}

function subscriptionOf(homeId) {
  const row = db.prepare("SELECT * FROM subscriptions WHERE home_id = ?").get(homeId);
  if (!row) {
    return {
      plan: "hogar",
      status: "active",
      last4: null,
      current_period_end: null,
      provider: "included",
      billing_mode: null,
      amount: null,
      auth_code: null,
      payer_user_id: null,
      mail_sent: 0,
    };
  }
  const ended = row.status === "cancelled" && row.current_period_end && Date.parse(row.current_period_end) < Date.now();
  if (!ended) return row;
  db.prepare(
    `UPDATE subscriptions
     SET plan = 'hogar', status = 'active', last4 = NULL, current_period_end = NULL,
         provider = 'included', billing_mode = NULL, amount = NULL, auth_code = NULL,
         payer_user_id = NULL, mail_sent = 0, updated_at = ?
     WHERE home_id = ?`
  ).run(nowIso(), homeId);
  return subscriptionOf(homeId);
}

function homeFor(userId) {
  const mine = db
    .prepare(
      `SELECT m.*, h.name AS home_name, h.invite_code, h.owner_id, h.zone_lat, h.zone_lng, h.zone_radius, u.name AS user_name
       FROM members m
       JOIN homes h ON h.id = m.home_id
       JOIN users u ON u.id = m.user_id
       WHERE m.user_id = ?`
    )
    .get(userId);
  if (!mine) return null;
  const plan = subscriptionOf(mine.home_id);
  return {
    id: mine.home_id,
    name: mine.home_name,
    inviteCode: mine.role === "central" ? mine.invite_code : null,
    role: mine.role,
    protectionArmed: !!mine.protection_armed,
    plan: plan.plan,
    planStatus: plan.status,
    last4: plan.last4,
    periodEnd: plan.current_period_end,
    billingMode: plan.billing_mode || null,
    amount: plan.amount ?? null,
    authCode: plan.auth_code || null,
    payerName: plan.payer_user_id
      ? db.prepare("SELECT name FROM users WHERE id = ?").get(plan.payer_user_id)?.name || null
      : null,
    mailTo: plan.payer_user_id
      ? db.prepare("SELECT email FROM users WHERE id = ?").get(plan.payer_user_id)?.email || null
      : null,
    mailSent: plan.plan === "nube" ? !!plan.mail_sent : false,
    zone:
      mine.zone_lat == null || mine.zone_lng == null
        ? null
        : { lat: mine.zone_lat, lng: mine.zone_lng, radius: mine.zone_radius || 150 },
    members: membersOf(mine.home_id),
  };
}

function membership(userId) {
  return db.prepare("SELECT * FROM members WHERE user_id = ?").get(userId);
}

function requireUser(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload) return bad(res, "La sesión venció. Entra de nuevo.", 401);
  const user = db.prepare("SELECT id, name, email, photo_path FROM users WHERE id = ?").get(payload.id);
  if (!user) return bad(res, "La sesión venció. Entra de nuevo.", 401);
  req.user = publicUser(user);
  next();
}

function emitHome(homeId, event, payload) {
  io.to(`home:${homeId}`).emit(event, payload);
}

function removeUpload(filePath) {
  if (!filePath) return;
  fs.promises.unlink(path.join(uploadDir, path.basename(filePath))).catch(() => {});
}

function purgeExpiredAudio() {
  const rows = db
    .prepare(
      `SELECT id, audio_path, video_path FROM events
       WHERE audio_expires_at IS NOT NULL AND audio_expires_at < ?`
    )
    .all(nowIso());
  for (const row of rows) {
    removeUpload(row.audio_path);
    removeUpload(row.video_path);
    db.prepare(
      "UPDATE events SET audio_path = NULL, video_path = NULL, audio_expires_at = NULL WHERE id = ?"
    ).run(row.id);
  }
}

function presentEvent(row, plan) {
  const age = Date.now() - new Date(row.created_at).getTime();
  const recent = age <= HOUR48;
  if (plan !== "nube" && !recent) return null;
  const keepMedia = plan === "nube" || recent;
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    type: row.type,
    label: EVENT_COPY[row.type] || "Alerta",
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    detail: row.detail,
    audioUrl: keepMedia && row.audio_path ? row.audio_path : null,
    videoUrl: keepMedia && row.video_path ? row.video_path : null,
    hasClip: Boolean(keepMedia && row.video_path),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function userIdsInHome(homeId, exceptUserId) {
  return db
    .prepare("SELECT user_id FROM members WHERE home_id = ? AND user_id != ?")
    .all(homeId, exceptUserId)
    .map((row) => row.user_id);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "umbral" });
});

app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (name.length < 2) return bad(res, "Escribe tu nombre.");
  if (!email.includes("@") || email.length < 5) return bad(res, "El correo no es válido.");
  if (password.length < 6) return bad(res, "La contraseña necesita al menos 6 caracteres.");
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return bad(res, "Ese correo ya tiene una cuenta.");
  const user = { id: crypto.randomUUID(), name, email, photo_path: null };
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(user.id, name, email, await hashPassword(password), nowIso());
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return bad(res, "Correo o contraseña incorrectos.", 401);
  }
  res.json({ token: signToken(row), user: publicUser(row) });
});

app.get("/api/me", requireUser, (req, res) => {
  res.json({ user: req.user, home: homeFor(req.user.id) });
});

app.patch("/api/me", requireUser, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const currentPassword = String(req.body?.currentPassword || "");
  if (name.length < 2) return bad(res, "Escribe tu nombre.");
  if (!email.includes("@") || email.length < 5) return bad(res, "El correo no es válido.");
  const taken = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, req.user.id);
  if (taken) return bad(res, "Ese correo ya tiene una cuenta.");
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (password) {
    if (password.length < 6) return bad(res, "La contraseña necesita al menos 6 caracteres.");
    if (!(await verifyPassword(currentPassword, row.password_hash))) {
      return bad(res, "La contraseña actual no coincide.", 401);
    }
    db.prepare("UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?").run(
      name,
      email,
      await hashPassword(password),
      req.user.id
    );
  } else {
    db.prepare("UPDATE users SET name = ?, email = ? WHERE id = ?").run(name, email, req.user.id);
  }
  const mine = membership(req.user.id);
  if (mine) emitHome(mine.home_id, "home:changed", { homeId: mine.home_id });
  const updated = db.prepare("SELECT id, name, email, photo_path FROM users WHERE id = ?").get(req.user.id);
  res.json({ user: publicUser(updated) });
});

app.post("/api/me/photo", requireUser, (req, res) => {
  upload.single("photo")(req, res, (err) => {
    if (err) return bad(res, "La foto es demasiado grande.");
    if (!req.file) return bad(res, "Elige una foto.");
    if (!String(req.file.mimetype || "").startsWith("image/")) {
      removeUpload(`/uploads/${req.file.filename}`);
      return bad(res, "Ese archivo no es una foto.");
    }
    const previous = db.prepare("SELECT photo_path FROM users WHERE id = ?").get(req.user.id);
    const photoPath = `/uploads/${req.file.filename}`;
    db.prepare("UPDATE users SET photo_path = ? WHERE id = ?").run(photoPath, req.user.id);
    if (previous?.photo_path && previous.photo_path !== photoPath) removeUpload(previous.photo_path);
    const mine = membership(req.user.id);
    if (mine) emitHome(mine.home_id, "home:changed", { homeId: mine.home_id });
    const updated = db.prepare("SELECT id, name, email, photo_path FROM users WHERE id = ?").get(req.user.id);
    res.json({ user: publicUser(updated) });
  });
});

app.post("/api/homes", requireUser, (req, res) => {
  if (membership(req.user.id)) return bad(res, "Ya perteneces a un hogar.");
  const name = String(req.body?.name || "").trim();
  if (name.length < 2) return bad(res, "Ponle un nombre al hogar.");
  const homeId = crypto.randomUUID();
  const created = nowIso();
  let code = inviteCode();
  while (db.prepare("SELECT id FROM homes WHERE invite_code = ?").get(code)) code = inviteCode();
  const zone = readZone(req.body);
  db.prepare(
    `INSERT INTO homes (id, name, invite_code, owner_id, created_at, zone_lat, zone_lng, zone_radius)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(homeId, name, code, req.user.id, created, zone?.lat ?? null, zone?.lng ?? null, zone?.radius ?? null);
  db.prepare(
    `INSERT INTO members (id, home_id, user_id, role, protection_armed, created_at)
     VALUES (?, ?, ?, 'central', 0, ?)`
  ).run(crypto.randomUUID(), homeId, req.user.id, created);
  db.prepare(
    `INSERT INTO subscriptions (home_id, plan, status, provider, updated_at)
     VALUES (?, 'hogar', 'active', 'included', ?)`
  ).run(homeId, created);
  res.json({ home: homeFor(req.user.id) });
});

app.post("/api/homes/zone", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return bad(res, "Primero entra a un hogar.", 404);
  if (mine.role !== "central") return bad(res, "Solo la central marca la zona.", 403);
  const zone = readZone(req.body);
  if (!zone) return bad(res, "Toca el mapa para marcar la casa.");
  db.prepare("UPDATE homes SET zone_lat = ?, zone_lng = ?, zone_radius = ? WHERE id = ?").run(
    zone.lat,
    zone.lng,
    zone.radius,
    mine.home_id
  );
  emitHome(mine.home_id, "home:changed", { homeId: mine.home_id });
  res.json({ home: homeFor(req.user.id) });
});

app.post("/api/homes/join", requireUser, (req, res) => {
  if (membership(req.user.id)) return bad(res, "Ya perteneces a un hogar.");
  const code = String(req.body?.code || "").trim().toUpperCase();
  const home = db.prepare("SELECT * FROM homes WHERE invite_code = ?").get(code);
  if (!home) return bad(res, "Ese código no corresponde a ningún hogar.");
  db.prepare(
    `INSERT INTO members (id, home_id, user_id, role, protection_armed, created_at)
     VALUES (?, ?, ?, 'member', 0, ?)`
  ).run(crypto.randomUUID(), home.id, req.user.id, nowIso());
  emitHome(home.id, "home:changed", { homeId: home.id });
  res.json({ home: homeFor(req.user.id) });
});

app.post("/api/homes/leave", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return bad(res, "No perteneces a un hogar.", 404);
  const home = db.prepare("SELECT * FROM homes WHERE id = ?").get(mine.home_id);
  if (home.owner_id === req.user.id) {
    const clips = db.prepare("SELECT audio_path, video_path FROM events WHERE home_id = ?").all(home.id);
    for (const clip of clips) {
      removeUpload(clip.audio_path);
      removeUpload(clip.video_path);
    }
    db.prepare("DELETE FROM events WHERE home_id = ?").run(home.id);
    db.prepare("DELETE FROM cameras WHERE home_id = ?").run(home.id);
    db.prepare("DELETE FROM subscriptions WHERE home_id = ?").run(home.id);
    db.prepare("DELETE FROM members WHERE home_id = ?").run(home.id);
    db.prepare("DELETE FROM homes WHERE id = ?").run(home.id);
    emitHome(home.id, "home:closed", { homeId: home.id });
  } else {
    db.prepare("DELETE FROM members WHERE user_id = ?").run(req.user.id);
    emitHome(home.id, "home:changed", { homeId: home.id });
  }
  res.json({ ok: true });
});

app.post("/api/protection", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return bad(res, "Primero entra a un hogar.", 404);
  const armed = req.body?.armed ? 1 : 0;
  db.prepare("UPDATE members SET protection_armed = ? WHERE user_id = ?").run(armed, req.user.id);
  const member = membersOf(mine.home_id).find((item) => item.userId === req.user.id);
  emitHome(mine.home_id, "member:update", member);
  res.json({ home: homeFor(req.user.id) });
});

app.post("/api/presence", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return bad(res, "Primero entra a un hogar.", 404);
  if (!mine.protection_armed) return bad(res, "La protección está en calma.");
  const body = req.body || {};
  const current = parseSensors(mine.sensor_json);
  const sensors = mergeSensors(current, body);
  db.prepare(
    `UPDATE members
     SET last_lat = COALESCE(?, last_lat),
         last_lng = COALESCE(?, last_lng),
         last_accuracy = COALESCE(?, last_accuracy),
         last_seen = ?,
         sensor_json = ?
     WHERE user_id = ?`
  ).run(
    numberOr(body.lat, null),
    numberOr(body.lng, null),
    numberOr(body.accuracy, null),
    nowIso(),
    JSON.stringify(sensors),
    req.user.id
  );
  const member = membersOf(mine.home_id).find((item) => item.userId === req.user.id);
  emitHome(mine.home_id, "member:update", member);
  res.json({ ok: true });
});

app.post("/api/events", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return bad(res, "Primero entra a un hogar.", 404);
  const type = String(req.body?.type || "");
  if (!EVENT_TYPES.has(type)) return bad(res, "Tipo de alerta desconocido.");
  const created = nowIso();
  const eventId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO events
      (id, home_id, user_id, type, status, lat, lng, detail, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
  ).run(
    eventId,
    mine.home_id,
    req.user.id,
    type,
    numberOr(req.body?.lat, null),
    numberOr(req.body?.lng, null),
    EVENT_COPY[type],
    created,
    created
  );
  const event = eventById(eventId, mine.home_id);
  emitHome(mine.home_id, "alert:pending", event);
  res.json({ event });
});

app.post("/api/events/:id/cancel", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  if (!mine || !row || row.home_id !== mine.home_id) return bad(res, "No encontramos esa alerta.", 404);
  if (row.user_id !== req.user.id) return bad(res, "Solo quien la abrió puede cancelarla.", 403);
  if (row.status !== "pending") return res.json({ event: eventById(row.id, row.home_id) });
  db.prepare("UPDATE events SET status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
  const event = eventById(row.id, row.home_id);
  emitHome(row.home_id, "alert:cancelled", event);
  res.json({ event });
});

app.post("/api/events/:id/raise", requireUser, uploadAlert, (req, res) => {
  const mine = membership(req.user.id);
  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  if (!mine || !row || row.home_id !== mine.home_id) return bad(res, "No encontramos esa alerta.", 404);
  if (row.user_id !== req.user.id) return bad(res, "Solo quien la abrió puede confirmarla.", 403);
  if (row.status !== "pending" && row.status !== "alert") {
    return res.json({ event: eventById(row.id, row.home_id) });
  }

  const files = req.files || {};
  const audioFile = files.audio?.[0];
  const videoFile = files.video?.[0];
  const plan = subscriptionOf(row.home_id).plan;
  const audioPath = audioFile ? `/uploads/${audioFile.filename}` : row.audio_path;
  const videoPath = videoFile ? `/uploads/${videoFile.filename}` : row.video_path;
  const hasMedia = Boolean(audioPath || videoPath);
  const expires = plan === "nube" || !hasMedia ? null : row.audio_expires_at || new Date(Date.now() + HOUR48).toISOString();
  const fresh = row.status === "pending";
  db.prepare(
    `UPDATE events
     SET status = 'alert', audio_path = ?, video_path = ?, audio_expires_at = ?, clip_stored = ?, updated_at = ?
     WHERE id = ?`
  ).run(audioPath, videoPath, expires, videoPath ? 1 : 0, nowIso(), row.id);
  const event = eventById(row.id, row.home_id);
  emitHome(row.home_id, "alert:raised", event);
  if (fresh) {
    const others = userIdsInHome(row.home_id, req.user.id);
    pushToUsers(db, others, {
      title: "Umbral",
      body: videoPath
        ? `${req.user.name} necesita atención. Abre el aviso para guardar el video.`
        : `${req.user.name} necesita atención`,
      data: { eventId: row.id },
    });
    if (plan === "nube") {
      const house = db.prepare("SELECT name FROM homes WHERE id = ?").get(row.home_id);
      const recipients = db
        .prepare("SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.home_id = ?")
        .all(row.home_id)
        .map((item) => item.email);
      const place = row.lat != null && row.lng != null ? `${row.lat},${row.lng}` : "";
      sendAlertMail({
        recipients,
        homeName: house?.name || "tu hogar",
        personName: req.user.name,
        label: EVENT_COPY[row.type] || "Alerta",
        place,
        hasVideo: Boolean(videoPath),
      }).catch(() => {});
    }
  }
  res.json({ event });
});

app.post("/api/events/:id/resolve", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  if (!mine || !row || row.home_id !== mine.home_id) return bad(res, "No encontramos esa alerta.", 404);
  if (mine.role !== "central") return bad(res, "La central cierra la alerta.", 403);
  db.prepare("UPDATE events SET status = 'resolved', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
  const event = eventById(row.id, row.home_id);
  emitHome(row.home_id, "alert:resolved", event);
  res.json({ event });
});

app.get("/api/events", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return res.json({ events: [] });
  purgeExpiredAudio();
  const plan = subscriptionOf(mine.home_id).plan;
  const rows = db
    .prepare(
      `SELECT e.*, u.name AS user_name
       FROM events e JOIN users u ON u.id = e.user_id
       WHERE e.home_id = ?
       ORDER BY e.created_at DESC
       LIMIT 100`
    )
    .all(mine.home_id);
  res.json({ events: rows.map((row) => presentEvent(row, plan)).filter(Boolean) });
});

app.get("/api/events/:id", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return bad(res, "No encontramos esa alerta.", 404);
  purgeExpiredAudio();
  const event = eventById(req.params.id, mine.home_id);
  if (!event) return bad(res, "No encontramos esa alerta.", 404);
  res.json({ event });
});

app.get("/api/billing", requireUser, (req, res) => {
  const home = homeFor(req.user.id);
  if (!home) return bad(res, "Primero entra a un hogar.", 404);
  res.json({
    plan: home.plan,
    status: home.planStatus,
    last4: home.last4,
    periodEnd: home.periodEnd,
    billingMode: home.billingMode,
    amount: home.amount,
    authCode: home.authCode,
    price: home.plan === "nube" ? 149 : 0,
    currency: "MXN",
  });
});

app.post("/api/billing/checkout", requireUser, async (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return bad(res, "Primero entra a un hogar.", 404);
  const current = subscriptionOf(mine.home_id);
  if (current.plan === "nube" && current.status === "active") {
    return bad(res, "Este hogar ya está en Nube. Las demás personas no necesitan pagar.");
  }

  const testMode = req.body?.mode === "prueba";
  const number = String(req.body?.number || "").replace(/\s|-/g, "");
  const exp = String(req.body?.exp || "").replace(/\s/g, "");
  const cvc = String(req.body?.cvc || "").trim();
  const cardError = cardProblem(number, exp, cvc, testMode);
  if (cardError) return bad(res, cardError);

  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const folio = chargeFolio();
  db.prepare(
    `UPDATE subscriptions
     SET plan = 'nube', status = 'active', last4 = ?, current_period_end = ?,
         provider = ?, billing_mode = ?, amount = ?, auth_code = ?, payer_user_id = ?, mail_sent = ?, updated_at = ?
     WHERE home_id = ?`
  ).run(
    number.slice(-4),
    periodEnd,
    testMode ? "prueba" : "card",
    testMode ? "prueba" : "cobro",
    149,
    folio,
    req.user.id,
    0,
    nowIso(),
    mine.home_id
  );

  const house = db.prepare("SELECT name FROM homes WHERE id = ?").get(mine.home_id);
  const people = db.prepare("SELECT user_id FROM members WHERE home_id = ?").all(mine.home_id).map((row) => row.user_id);
  const notice = `${house.name} pasó a plan Nube. Lo pagó ${req.user.name}. El resto del hogar no paga.`;
  emitHome(mine.home_id, "plan:nube", { homeName: house.name, buyerName: req.user.name, body: notice });
  emitHome(mine.home_id, "home:changed", { homeId: mine.home_id });
  pushToUsers(db, people, { title: "Plan Nube", body: notice, data: { homeId: mine.home_id } }).catch(() => {});
  const mailSent = await sendPlanReceipt({
    to: req.user.email,
    buyerName: req.user.name,
    homeName: house.name,
    folio,
    periodEnd,
    demo: testMode,
  });
  if (mailSent) {
    db.prepare("UPDATE subscriptions SET mail_sent = 1, updated_at = ? WHERE home_id = ?").run(nowIso(), mine.home_id);
  }
  res.json({ home: homeFor(req.user.id), mailSent });
});

app.post("/api/billing/receipt", requireUser, async (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return bad(res, "Primero entra a un hogar.", 404);
  const plan = subscriptionOf(mine.home_id);
  if (plan.plan !== "nube" || !plan.payer_user_id) return bad(res, "Este hogar no tiene un pago para reenviar.");
  if (!gmailReady()) return bad(res, "El servidor no tiene una cuenta de Gmail conectada.");
  const buyer = db.prepare("SELECT name, email FROM users WHERE id = ?").get(plan.payer_user_id);
  const house = db.prepare("SELECT name FROM homes WHERE id = ?").get(mine.home_id);
  const mailSent = await sendPlanReceipt({
    to: buyer?.email,
    buyerName: buyer?.name || "",
    homeName: house?.name || "tu hogar",
    folio: plan.auth_code || "LIN-RECIBO",
    periodEnd: plan.current_period_end,
    demo: plan.billing_mode === "prueba",
  });
  if (!mailSent) return bad(res, "Gmail no aceptó el envío. Revisa la contraseña de aplicación.");
  db.prepare("UPDATE subscriptions SET mail_sent = 1, updated_at = ? WHERE home_id = ?").run(nowIso(), mine.home_id);
  res.json({ home: homeFor(req.user.id), mailSent: true });
});

app.post("/api/billing/cancel", requireUser, (req, res) => {
  const mine = membership(req.user.id);
  if (!mine) return bad(res, "Primero entra a un hogar.", 404);
  const plan = subscriptionOf(mine.home_id);
  if (plan.plan !== "nube" || plan.status !== "active") return bad(res, "No hay un pago del hogar para cancelar.");
  db.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE home_id = ?").run(nowIso(), mine.home_id);
  const house = db.prepare("SELECT name FROM homes WHERE id = ?").get(mine.home_id);
  const people = db.prepare("SELECT user_id FROM members WHERE home_id = ?").all(mine.home_id).map((row) => row.user_id);
  const until = new Date(plan.current_period_end).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
  const notice = `Se canceló el pago de ${house.name}. Nube sigue hasta el ${until} y luego el hogar vuelve a Normal.`;
  emitHome(mine.home_id, "plan:cancel", { body: notice });
  emitHome(mine.home_id, "home:changed", { homeId: mine.home_id });
  pushToUsers(db, people, { title: "Pago cancelado", body: notice, data: { homeId: mine.home_id } }).catch(() => {});
  res.json({ home: homeFor(req.user.id) });
});

app.post("/api/push-token", requireUser, (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (!token.startsWith("ExponentPushToken") && !token.startsWith("ExpoPushToken")) {
    return bad(res, "Token de aviso no válido.");
  }
  db.prepare(
    `INSERT INTO push_tokens (token, user_id, platform, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at`
  ).run(token, req.user.id, String(req.body?.platform || ""), nowIso());
  res.json({ ok: true });
});

io.use((socket, next) => {
  const payload = verifyToken(socket.handshake.auth?.token);
  if (!payload) return next(new Error("unauthorized"));
  socket.userId = payload.id;
  next();
});

io.on("connection", (socket) => {
  const mine = membership(socket.userId);
  if (!mine) return;
  socket.join(`home:${mine.home_id}`);
  let lastWrite = 0;
  socket.on("live", (body) => {
    const row = membership(socket.userId);
    if (!row) return;
    const sensors = mergeSensors(parseSensors(row.sensor_json), body || {});
    const lat = numberOr(body?.lat, row.last_lat);
    const lng = numberOr(body?.lng, row.last_lng);
    const accuracy = numberOr(body?.accuracy, row.last_accuracy);
    const seen = nowIso();
    if (Date.now() - lastWrite > 2000) {
      lastWrite = Date.now();
      db.prepare(
        `UPDATE members
         SET last_lat = ?, last_lng = ?, last_accuracy = ?, last_seen = ?, sensor_json = ?
         WHERE user_id = ?`
      ).run(lat, lng, accuracy, seen, JSON.stringify(sensors), socket.userId);
    }
    const person = db.prepare("SELECT name, photo_path FROM users WHERE id = ?").get(socket.userId);
    emitHome(row.home_id, "member:update", {
      userId: row.user_id,
      name: person?.name || "",
      photoUrl: person?.photo_path || null,
      role: row.role,
      protectionArmed: !!row.protection_armed,
      lat,
      lng,
      accuracy,
      lastSeen: seen,
      sensors,
    });
  });
});

const TEST_APPROVED = "4242424242424242";
const TEST_DECLINED = "4000000000000002";

function chargeFolio() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "LIN-";
  for (let i = 0; i < 6; i += 1) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

function cardProblem(number, exp, cvc, testMode) {
  if (number === TEST_DECLINED) return "El banco rechazó el pago. Prueba con otra tarjeta.";
  if (testMode && number !== TEST_APPROVED) {
    return "Modo prueba: usa 4242 4242 4242 4242 para aprobar, o 4000 0000 0000 0002 para ver un rechazo.";
  }
  if (!luhn(number)) return "Revisa el número de la tarjeta.";
  const [monthRaw, yearRaw] = exp.includes("/") ? exp.split("/") : [exp.slice(0, 2), exp.slice(2)];
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const fullYear = year < 100 ? 2000 + year : year;
  if (!month || month < 1 || month > 12 || !year) return "La fecha de la tarjeta no es válida.";
  const expires = new Date(fullYear, month, 0, 23, 59, 59);
  if (Number.isNaN(expires.getTime()) || expires < new Date()) return "La tarjeta está vencida.";
  if (!/^\d{3,4}$/.test(cvc)) return "El código de seguridad no es válido.";
  return "";
}

function luhn(number) {
  if (!/^\d{13,19}$/.test(number)) return false;
  let sum = 0;
  let alt = false;
  for (let i = number.length - 1; i >= 0; i -= 1) {
    let digit = Number(number[i]);
    if (alt) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function numberOr(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function eventById(id, homeId) {
  purgeExpiredAudio();
  const plan = subscriptionOf(homeId).plan;
  const row = db
    .prepare(
      `SELECT e.*, u.name AS user_name
       FROM events e JOIN users u ON u.id = e.user_id
       WHERE e.id = ? AND e.home_id = ?`
    )
    .get(id, homeId);
  return row ? presentEvent(row, plan) : null;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Umbral escuchando en http://localhost:${PORT}`);
  if (!gmailReady()) console.log("Gmail sin configurar: los recibos no se envían.");
});
