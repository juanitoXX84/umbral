import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { pushLive } from "@/lib/live";
import { useAuth } from "@/lib/auth";
import { syncBackgroundLocation } from "@/lib/locationTask";
import { watchSensors, type Reading } from "@/lib/sensors";
import type { EventType } from "@/lib/types";

type ProtectionState = {
  reading: Reading;
  busy: boolean;
  setPreview: (next: boolean) => void;
  arm: () => Promise<void>;
  disarm: () => Promise<void>;
  trigger: (type: EventType) => Promise<void>;
};

const empty: Reading = {
  accel: null,
  gyro: null,
  heading: null,
  headingAccuracy: null,
  light: null,
  lat: null,
  lng: null,
  accuracy: null,
};

const ProtectionContext = createContext<ProtectionState | null>(null);

export function ProtectionProvider({ children }: { children: React.ReactNode }) {
  const { home, setHome } = useAuth();
  const [reading, setReading] = useState<Reading>(empty);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const readingRef = useRef(reading);
  const armedRef = useRef(false);
  const lockUntil = useRef(0);
  readingRef.current = reading;
  armedRef.current = !!home?.protectionArmed;
  const watching = !!home && (home.protectionArmed || preview || foreground);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!watching) return;
    return watchSensors(
      setReading,
      (type) => {
        if (!armedRef.current || Date.now() < lockUntil.current) return;
        lockUntil.current = Date.now() + 45000;
        void openEvent(type);
      },
      () => armedRef.current
    );
  }, [watching, home?.id]);

  useEffect(() => {
    syncBackgroundLocation(!!home?.protectionArmed);
  }, [home?.protectionArmed]);

  useEffect(() => {
    if (!watching) return;
    const payload = () => {
      const current = readingRef.current;
      return {
        lat: current.lat,
        lng: current.lng,
        accuracy: current.accuracy,
        accel: current.accel,
        gyro: current.gyro,
        light: current.light,
        heading: current.heading,
        headingAccuracy: current.headingAccuracy,
      };
    };
    pushLive(payload());
    const live = setInterval(() => pushLive(payload()), 600);
    const timer = armedRef.current
      ? setInterval(() => api.presence(payload()).catch(() => {}), 4000)
      : null;
    if (armedRef.current) api.presence(payload()).catch(() => {});
    return () => {
      clearInterval(live);
      if (timer) clearInterval(timer);
    };
  }, [watching, home?.protectionArmed, home?.id]);

  async function openEvent(type: EventType) {
    try {
      const current = readingRef.current;
      const { event } = await api.createEvent({ type, lat: current.lat, lng: current.lng });
      router.push({ pathname: "/cuenta/[id]", params: { id: event.id } });
    } catch {
      lockUntil.current = 0;
    }
  }

  async function arm() {
    setBusy(true);
    try {
      const result = await api.setProtection(true);
      setHome(result.home);
    } finally {
      setBusy(false);
    }
  }

  async function disarm() {
    setBusy(true);
    try {
      const result = await api.setProtection(false);
      setHome(result.home);
    } finally {
      setBusy(false);
    }
  }

  async function trigger(type: EventType) {
    if (Date.now() < lockUntil.current) return;
    lockUntil.current = Date.now() + 45000;
    await openEvent(type);
  }

  return (
    <ProtectionContext.Provider value={{ reading, busy, setPreview, arm, disarm, trigger }}>
      {children}
    </ProtectionContext.Provider>
  );
}

export function useProtection() {
  const value = useContext(ProtectionContext);
  if (!value) throw new Error("Protection missing");
  return value;
}
