import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

export type WatchSyncResult = "sent" | "queued" | "cleared" | "unavailable" | "unsupported";

type NativeWearSync = {
  sendSession(token: string): Promise<"sent" | "queued" | "unavailable">;
  clearSession(): Promise<"cleared" | "unavailable">;
};

const native = Platform.OS === "android" ? requireOptionalNativeModule<NativeWearSync>("UmbralWearSync") : null;

export function watchSyncSupported() {
  return native != null;
}

export async function sendSessionToWatch(token: string): Promise<WatchSyncResult> {
  if (!native) return "unsupported";
  return native.sendSession(token);
}

export async function clearWatchSession(): Promise<WatchSyncResult> {
  if (!native) return "unsupported";
  return native.clearSession();
}
