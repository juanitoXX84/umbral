import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

export function gmailReady() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export async function sendPlanReceipt({ to, buyerName, homeName, folio, periodEnd, demo }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !to) return false;
  const when = new Date(periodEnd).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  try {
    await transport.sendMail({
      from: `Umbral <${user}>`,
      to,
      subject: demo ? `Umbral: demostración del plan Nube en ${homeName}` : `Umbral: ${homeName} pasó a plan Nube`,
      text: [
        `Hola ${buyerName},`,
        "",
        demo
          ? `Este correo muestra cómo queda el pago. No se cobró dinero.`
          : `Registramos el pago de $149.00 MXN del plan Nube para todo el hogar ${homeName}.`,
        "Las demás personas de la casa no necesitan pagar.",
        `Folio ${folio}.`,
        `Vigente hasta ${when}.`,
        "",
        "Umbral",
      ].join("\n"),
    });
    return true;
  } catch (err) {
    console.error("gmail", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function sendAlertMail({ recipients, homeName, personName, label, place, hasVideo }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const list = [...new Set((recipients || []).filter(Boolean))];
  if (!user || !pass || list.length === 0) return false;
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  try {
    await transport.sendMail({
      from: `Umbral <${user}>`,
      to: list.join(", "),
      subject: `Umbral: ${label} en ${homeName}`,
      text: [
        `${personName} necesita atención en ${homeName}.`,
        `Aviso: ${label}.`,
        place ? `Ubicación: https://maps.google.com/?q=${place}` : "Sin ubicación en este aviso.",
        hasVideo
          ? "El plan Nube guardó 20 segundos de audio y video. Ábrelo en Alertas para verlo y descargarlo al teléfono."
          : "El aviso quedó guardado en el historial de Nube.",
        "",
        "Umbral",
      ].join("\n"),
    });
    return true;
  } catch (err) {
    console.error("gmail", err instanceof Error ? err.message : err);
    return false;
  }
}

