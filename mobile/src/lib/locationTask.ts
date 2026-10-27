import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getItem } from "@/lib/storage";

export const LOCATION_TASK = "umbral-location";

if (Platform.OS !== "web") {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const locations = (data as { locations?: Location.LocationObject[] }).locations;
    const place = locations?.[0];
    if (!place) return;
    const token = await getItem("token");
    const server = await getItem("server");
    if (!token || !server) return;
    await fetch(`${server}/api/presence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lat: place.coords.latitude,
        lng: place.coords.longitude,
        accuracy: place.coords.accuracy,
      }),
    }).catch(() => {});
  });
}

export async function syncBackgroundLocation(armed: boolean) {
  if (Platform.OS === "web" || isRunningInExpoGo()) return;
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (armed && !started) {
      const permission = await Location.requestBackgroundPermissionsAsync();
      if (!permission.granted) return;
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 20000,
        distanceInterval: 25,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Umbral",
          notificationBody: "Protección armada",
        },
      });
    }
    if (!armed && started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // Foreground updates keep the map current when background location is unavailable.
  }
}
