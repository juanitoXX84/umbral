import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

export function defaultServer() {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host && host !== "localhost" && host !== "127.0.0.1") return `http://${host}:4000`;
  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  return "http://localhost:4000";
}

export async function getItem(key: string) {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getServer() {
  return (await getItem("server")) || defaultServer();
}
