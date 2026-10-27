const base = process.env.UMBRAL_URL || "http://127.0.0.1:4000";

async function call(path, { method = "GET", token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${base}${path}`, { method, headers, body: payload });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `${method} ${path} -> ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const stamp = Date.now();
const ana = await call("/api/auth/register", {
  method: "POST",
  body: { name: "Ana Ortega", email: `ana.${stamp}@umbral.test`, password: "secreto" },
});
const home = await call("/api/homes", {
  method: "POST",
  token: ana.token,
  body: { name: "Casa Ortega", zoneLat: 19.4326, zoneLng: -99.1332, zoneRadius: 150 },
});
assert(home.home.role === "central", "ana should be central");
assert(home.home.inviteCode, "home needs a code");
assert(home.home.zone?.radius === 150, "home zone");

const luis = await call("/api/auth/register", {
  method: "POST",
  body: { name: "Luis Ortega", email: `luis.${stamp}@umbral.test`, password: "secreto" },
});
const joined = await call("/api/homes/join", { method: "POST", token: luis.token, body: { code: home.home.inviteCode } });
assert(joined.home.role === "member", "luis should be a member");
assert(joined.home.zone?.radius === 150, "member sees the zone");
let blocked = false;
try {
  await call("/api/homes/zone", {
    method: "POST",
    token: luis.token,
    body: { zoneLat: 19.5, zoneLng: -99.2, zoneRadius: 80 },
  });
} catch {
  blocked = true;
}
assert(blocked, "member cannot move the zone");
const moved = await call("/api/homes/zone", {
  method: "POST",
  token: ana.token,
  body: { zoneLat: 19.44, zoneLng: -99.14, zoneRadius: 80 },
});
assert(moved.home.zone?.radius === 80, "central can move the zone");

await call("/api/protection", { method: "POST", token: luis.token, body: { armed: true } });
await call("/api/presence", {
  method: "POST",
  token: luis.token,
  body: { lat: 19.4326, lng: -99.1332, accuracy: 12, accel: 1.02, gyro: 0.2, proximity: "lejos", light: 40 },
});

const pending = await call("/api/events", {
  method: "POST",
  token: luis.token,
  body: { type: "fall", lat: 19.43, lng: -99.13 },
});
await call(`/api/events/${pending.event.id}/cancel`, { method: "POST", token: luis.token });

const raised = await call("/api/events", {
  method: "POST",
  token: luis.token,
  body: { type: "impact", lat: 19.44, lng: -99.14 },
});
const alert = await call(`/api/events/${raised.event.id}/raise`, { method: "POST", token: luis.token });
assert(alert.event.status === "alert", "event should be raised");

const list = await call("/api/events", { token: ana.token });
assert(list.events.some((event) => event.id === alert.event.id), "central should see the alert");

let rejected = false;
try {
  await call("/api/billing/checkout", {
    method: "POST",
    token: ana.token,
    body: { plan: "nube", mode: "cobro", number: "4242424242424241", exp: "12/30", cvc: "123" },
  });
} catch {
  rejected = true;
}
assert(rejected, "a card that fails the check must be rejected");

let practiceRejected = false;
try {
  await call("/api/billing/checkout", {
    method: "POST",
    token: ana.token,
    body: { plan: "nube", mode: "prueba", number: "5555555555554444", exp: "12/30", cvc: "123" },
  });
} catch {
  practiceRejected = true;
}
assert(practiceRejected, "practice mode only accepts the demo card");

const demo = await call("/api/billing/checkout", {
  method: "POST",
  token: ana.token,
  body: { plan: "nube", mode: "prueba", number: "4242 4242 4242 4242", exp: "12/30", cvc: "123" },
});
assert(demo.home.plan === "nube" && demo.home.billingMode === "prueba", "practice charge should activate nube");
assert(demo.home.last4 === "4242" && demo.home.authCode, "practice receipt should keep last four and a folio");

const cancelled = await call("/api/billing/cancel", { method: "POST", token: ana.token });
assert(cancelled.home.plan === "nube" && cancelled.home.planStatus === "cancelled", "cancel keeps nube until the period ends");

const paid = await call("/api/billing/checkout", {
  method: "POST",
  token: ana.token,
  body: { plan: "nube", mode: "cobro", number: "5555 5555 5555 4444", exp: "12/30", cvc: "123" },
});
assert(paid.home.plan === "nube" && paid.home.planStatus === "active", "a valid card should be charged");
assert(paid.home.billingMode === "cobro" && paid.home.last4 === "4444" && paid.home.amount === 149, "receipt should keep the charge");
assert(paid.home.payerName === "Ana Ortega", "the receipt names who paid for the home");
assert(typeof paid.mailSent === "boolean", "checkout reports whether the email went out");

const shared = await call("/api/me", { token: luis.token });
assert(shared.home.plan === "nube", "everyone in the home shares the paid plan");
let second = false;
try {
  await call("/api/billing/checkout", {
    method: "POST",
    token: luis.token,
    body: { plan: "nube", mode: "cobro", number: "5555 5555 5555 4444", exp: "12/30", cvc: "123" },
  });
} catch {
  second = true;
}
assert(second, "another person in the home does not pay again");

const clip = await call(`/api/events/${alert.event.id}`, { token: ana.token });
assert(clip.event.audioUrl == null && clip.event.videoUrl == null, "an alert without files has no media");

const stored = await call("/api/events", {
  method: "POST",
  token: luis.token,
  body: { type: "manual", lat: 19.4, lng: -99.1 },
});
const form = new FormData();
form.append("audio", new Blob([Buffer.from("audio")]), "alerta.m4a");
form.append("video", new Blob([Buffer.from("video")]), "alerta.mp4");
const withClip = await call(`/api/events/${stored.event.id}/raise`, { method: "POST", token: luis.token, form });
assert(withClip.event.audioUrl?.endsWith(".m4a"), "audio should be stored");
assert(withClip.event.videoUrl?.endsWith(".mp4"), "video should be stored");
assert(withClip.event.hasClip === true, "the alert should point at the saved video");

await call(`/api/events/${stored.event.id}/resolve`, { method: "POST", token: ana.token });
const renamed = await call("/api/me", {
  method: "PATCH",
  token: ana.token,
  body: { name: "Ana Rivas", email: `ana.${stamp}@umbral.test` },
});
assert(renamed.user.name === "Ana Rivas", "name should change");
assert(renamed.user.photoUrl == null, "new account has no photo");
const photo = new FormData();
photo.append("photo", new Blob([Buffer.from("image")], { type: "image/jpeg" }), "foto.jpg");
const withPhoto = await call("/api/me/photo", { method: "POST", token: ana.token, form: photo });
assert(withPhoto.user.photoUrl?.endsWith(".jpg"), "photo should be stored");
const seen = await call("/api/me", { token: luis.token });
assert(seen.home.members.some((member) => member.photoUrl?.endsWith(".jpg")), "the home sees the photo");

console.log("umbral ok");
