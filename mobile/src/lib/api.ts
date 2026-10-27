import { Platform } from "react-native";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import { deleteItem, getItem, getServer, setItem } from "@/lib/storage";
import type { AppEvent, Home, User } from "@/lib/types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getItem("token");
  const server = await getServer();
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${server}${path}`, {
      ...options,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("No encuentro el servidor. Revisa que esté encendido y la dirección.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar.");
  }
  return data as T;
}

export const api = {
  register: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<{ user: User; home: Home | null }>("/api/me"),
  updateProfile: (body: { name: string; email: string; password?: string; currentPassword?: string }) =>
    request<{ user: User }>("/api/me", { method: "PATCH", body: JSON.stringify(body) }),
  createHome: (body: { name: string; zoneLat?: number; zoneLng?: number; zoneRadius?: number }) =>
    request<{ home: Home }>("/api/homes", { method: "POST", body: JSON.stringify(body) }),
  setZone: (body: { zoneLat: number; zoneLng: number; zoneRadius: number }) =>
    request<{ home: Home }>("/api/homes/zone", { method: "POST", body: JSON.stringify(body) }),
  joinHome: (code: string) =>
    request<{ home: Home }>("/api/homes/join", { method: "POST", body: JSON.stringify({ code }) }),
  leaveHome: () => request<{ ok: boolean }>("/api/homes/leave", { method: "POST" }),
  setProtection: (armed: boolean) =>
    request<{ home: Home }>("/api/protection", { method: "POST", body: JSON.stringify({ armed }) }),
  presence: (body: Record<string, unknown>) =>
    request<{ ok: boolean }>("/api/presence", { method: "POST", body: JSON.stringify(body) }),
  createEvent: (body: { type: string; lat?: number | null; lng?: number | null }) =>
    request<{ event: AppEvent }>("/api/events", { method: "POST", body: JSON.stringify(body) }),
  cancelEvent: (id: string) => request<{ event: AppEvent }>(`/api/events/${id}/cancel`, { method: "POST" }),
  event: (id: string) => request<{ event: AppEvent }>(`/api/events/${id}`),
  events: () => request<{ events: AppEvent[] }>("/api/events"),
  resolveEvent: (id: string) => request<{ event: AppEvent }>(`/api/events/${id}/resolve`, { method: "POST" }),
  checkout: (body: { plan: "nube"; number: string; exp: string; cvc: string; mode: "prueba" | "cobro" }) =>
    request<{ home: Home; mailSent: boolean }>("/api/billing/checkout", { method: "POST", body: JSON.stringify(body) }),
  cancelPlan: () => request<{ home: Home }>("/api/billing/cancel", { method: "POST" }),
  resendReceipt: () => request<{ home: Home; mailSent: boolean }>("/api/billing/receipt", { method: "POST" }),
  registerPush: (token: string) =>
    request<{ ok: boolean }>("/api/push-token", {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS }),
    }),
  async uploadPhoto(uri: string) {
    if (Platform.OS === "web") {
      const form = new FormData();
      const photo = await filePart(uri, "foto.jpg", "image/jpeg");
      if (!photo) throw new Error("Elige una foto.");
      form.append("photo", photo.blob, photo.name);
      return request<{ user: User }>("/api/me/photo", { method: "POST", body: form });
    }
    const server = await getServer();
    const token = await getItem("token");
    const lower = uri.toLowerCase();
    const mime = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
    let result;
    try {
      result = await uploadAsync(`${server}/api/me/photo`, uri, {
        httpMethod: "POST",
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: "photo",
        mimeType: mime,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      throw new Error(`No pude subir la foto a ${server}. ${detail}`.trim());
    }
    const data = JSON.parse(result.body || "{}");
    if (result.status < 200 || result.status >= 300) {
      throw new Error(data.error || `El servidor respondió ${result.status}.`);
    }
    return data as { user: User };
  },
  async raiseEvent(id: string, files: { audio?: string | null; video?: string | null }) {
    if (Platform.OS === "web") return raiseOnWeb(id, files);
    let event: AppEvent | null = null;
    const failures: string[] = [];
    if (files.audio) {
      try {
        event = (await uploadOne(id, files.audio, "audio", "audio/m4a")).event;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : "No se pudo subir el audio.");
      }
    }
    if (files.video) {
      try {
        event = (await uploadOne(id, files.video, "video", "video/mp4")).event;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : "No se pudo subir el video.");
      }
    }
    if (!files.audio && !files.video) return request<{ event: AppEvent }>(`/api/events/${id}/raise`, { method: "POST" });
    if (event?.audioUrl || event?.videoUrl) return { event };
    throw new Error(failures[0] || "No se pudo guardar el clip.");
  },
};

async function uploadOne(id: string, uri: string, field: "audio" | "video", mime: string) {
  const server = await getServer();
  const token = await getItem("token");
  let result;
  try {
    result = await uploadAsync(`${server}/api/events/${id}/raise`, uri, {
      httpMethod: "POST",
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: field,
      mimeType: mime,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    throw new Error(`No pude subir el archivo a ${server}. ${detail}`.trim());
  }
  const data = JSON.parse(result.body || "{}");
  if (result.status < 200 || result.status >= 300) {
    throw new Error(data.error || `El servidor respondió ${result.status}.`);
  }
  return data as { event: AppEvent };
}

async function raiseOnWeb(id: string, files: { audio?: string | null; video?: string | null }) {
  const form = new FormData();
  const audio = await filePart(files.audio, "alerta.m4a", "audio/m4a");
  const video = await filePart(files.video, "alerta.mp4", "video/mp4");
  if (audio) form.append("audio", audio.blob, audio.name);
  if (video) form.append("video", video.blob, video.name);
  if (!audio && !video) return request<{ event: AppEvent }>(`/api/events/${id}/raise`, { method: "POST" });
  return request<{ event: AppEvent }>(`/api/events/${id}/raise`, { method: "POST", body: form });
}

async function filePart(uri: string | null | undefined, name: string, type: string) {
  if (!uri) return null;
  if (Platform.OS === "web") {
    const blob = await fetch(uri).then((response) => response.blob());
    return { blob, name };
  }
  return { blob: { uri, name, type } as unknown as Blob, name };
}

export async function saveSession(token: string) {
  await setItem("token", token);
}

export async function clearSession() {
  await deleteItem("token");
}
