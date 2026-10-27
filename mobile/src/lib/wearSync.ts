import { clearWatchSession, sendSessionToWatch, type WatchSyncResult } from "../../modules/umbral-wear-sync";
import { getItem } from "@/lib/storage";

export type WatchSync = WatchSyncResult | "no-session" | "failed";

export async function syncSessionToWatch(): Promise<WatchSync> {
  const token = await getItem("token");
  if (!token) return "no-session";
  try {
    return await sendSessionToWatch(token);
  } catch {
    return "failed";
  }
}

export async function unlinkWatch(): Promise<WatchSync> {
  try {
    return await clearWatchSession();
  } catch {
    return "failed";
  }
}

export const watchSyncCopy: Record<WatchSync, string> = {
  sent: "El reloj recibió tu sesión.",
  queued: "No hay un reloj conectado. La sesión llega cuando se conecte.",
  cleared: "El reloj cerró la sesión.",
  unavailable: "Este teléfono no tiene la app de Wear OS o Google Play Services.",
  unsupported: "Esta versión de Umbral no puede hablar con el reloj. Usa la build de desarrollo, no Expo Go.",
  "no-session": "Primero inicia sesión.",
  failed: "No se pudo enviar la sesión al reloj.",
};
