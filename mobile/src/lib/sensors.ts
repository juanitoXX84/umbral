import { Platform } from "react-native";
import { Accelerometer, Gyroscope, LightSensor } from "expo-sensors";
import * as Location from "expo-location";
import { dismissDevMenu } from "@/lib/devMenu";
import { createDetector } from "@/lib/detect";
import type { EventType } from "@/lib/types";

export type Reading = {
  accel: number | null;
  gyro: number | null;
  heading: number | null;
  headingAccuracy: number | null;
  light: number | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
};

const empty = (): Reading => ({
  accel: null,
  gyro: null,
  heading: null,
  headingAccuracy: null,
  light: null,
  lat: null,
  lng: null,
  accuracy: null,
});

function blendHeading(previous: number | null, next: number, accuracy: number) {
  if (previous == null) return next;
  let delta = next - previous;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const gain = accuracy >= 3 ? 0.55 : accuracy >= 2 ? 0.35 : 0.2;
  if (Math.abs(delta) < (accuracy >= 2 ? 0.8 : 2.5)) return previous;
  return (previous + delta * gain + 360) % 360;
}

export async function ensureLocationPermission() {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const next = await Location.requestForegroundPermissionsAsync();
  return next.granted;
}

export async function readCurrentLocation() {
  const ok = await ensureLocationPermission();
  if (!ok) throw new Error("Necesito el permiso de ubicación para marcar donde estás.");
  const last = await Location.getLastKnownPositionAsync().catch(() => null);
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<Location.LocationObject>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), 8000);
      }),
    ]);
  } catch (err) {
    if (last) return last;
    const message = err instanceof Error && err.message !== "timeout" ? err.message : "";
    throw new Error(message || "No llegó la ubicación. Activa el GPS y vuelve a intentar.");
  }
}

export function watchSensors(
  onReading: (reading: Reading) => void,
  onDanger: (type: EventType) => void,
  shouldDetect: () => boolean
) {
  const reading = empty();
  const detector = createDetector(onDanger);
  const subscriptions: { remove: () => void }[] = [];
  let stopped = false;

  const publish = () => {
    if (!stopped) onReading({ ...reading });
  };

  const listen = (sensor: { setUpdateInterval: (ms: number) => void; addListener: (cb: (value: Record<string, number>) => void) => { remove: () => void } }, ms: number, apply: (value: Record<string, number>) => void) => {
    try {
      if (Platform.OS !== "web") sensor.setUpdateInterval(ms);
      subscriptions.push(sensor.addListener(apply));
    } catch {
      // The sensor is absent on this device.
    }
  };

  listen(Accelerometer, 200, ({ x, y, z }) => {
    reading.accel = Math.sqrt(x * x + y * y + z * z);
    if (reading.accel > 2.4) dismissDevMenu();
    if (shouldDetect() && reading.gyro != null) detector.push({ accel: reading.accel, gyro: reading.gyro });
    publish();
  });

  listen(Gyroscope, 200, ({ x, y, z }) => {
    reading.gyro = Math.sqrt(x * x + y * y + z * z);
    if (reading.gyro > 3) dismissDevMenu();
    if (shouldDetect() && reading.accel != null) detector.push({ accel: reading.accel, gyro: reading.gyro });
    publish();
  });

  LightSensor.isAvailableAsync()
    .then((available) => {
      if (!available || stopped) return;
      listen(LightSensor, 500, ({ illuminance }) => {
        reading.light = illuminance;
        publish();
      });
    })
    .catch(() => {});

  ensureLocationPermission()
    .then(async (granted) => {
      if (!granted || stopped) return;
      try {
        const headingWatch = await Location.watchHeadingAsync((update) => {
          const next = update.trueHeading >= 0 ? update.trueHeading : update.magHeading;
          if (next < 0 || Number.isNaN(next)) return;
          reading.heading = blendHeading(reading.heading, next, update.accuracy);
          reading.headingAccuracy = update.accuracy;
          publish();
        });
        if (stopped) headingWatch.remove();
        else subscriptions.push(headingWatch);
      } catch {
        // This phone has no compass.
      }
      const applyPlace = (position: Location.LocationObject) => {
        if (stopped) return;
        reading.lat = position.coords.latitude;
        reading.lng = position.coords.longitude;
        reading.accuracy = position.coords.accuracy;
        publish();
      };
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last) applyPlace(last);
      void readCurrentLocation().then(applyPlace).catch(() => {});
      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 2 },
        applyPlace
      );
      if (stopped) watch.remove();
      else subscriptions.push(watch);
    })
    .catch(() => {});

  return () => {
    stopped = true;
    subscriptions.forEach((subscription) => subscription.remove());
  };
}
