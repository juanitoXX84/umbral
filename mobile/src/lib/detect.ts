import type { EventType } from "@/lib/types";

type Sample = { accel: number; gyro: number };

export function createDetector(onEvent: (type: EventType) => void) {
  let startedAt = Date.now();
  let lastFire = 0;
  let freeFallAt = 0;
  let struggleSince = 0;
  const gyroWindow: number[] = [];

  return {
    reset() {
      startedAt = Date.now();
      freeFallAt = 0;
      struggleSince = 0;
      gyroWindow.length = 0;
    },
    push(sample: Sample) {
      const now = Date.now();
      if (now - startedAt < 1800) return;
      if (now - lastFire < 30000) return;

      if (sample.accel > 3.2) {
        lastFire = now;
        onEvent("impact");
        return;
      }

      if (sample.accel < 0.4) freeFallAt = now;
      if (freeFallAt && sample.accel > 2.6 && now - freeFallAt < 1200) {
        freeFallAt = 0;
        lastFire = now;
        onEvent("fall");
        return;
      }
      if (freeFallAt && now - freeFallAt > 1200) freeFallAt = 0;

      gyroWindow.push(sample.gyro);
      if (gyroWindow.length > 10) gyroWindow.shift();
      const average = gyroWindow.reduce((sum, value) => sum + value, 0) / gyroWindow.length;
      if (average > 4.5) {
        if (!struggleSince) struggleSince = now;
        if (now - struggleSince > 1500) {
          struggleSince = 0;
          lastFire = now;
          onEvent("struggle");
        }
      } else {
        struggleSince = 0;
      }
    },
  };
}
