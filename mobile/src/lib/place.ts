import type { Member, Zone } from "@/lib/types";

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export type Place = "home" | "out" | "unknown" | "unmarked";

export function placeOf(member: Member, zone: Zone | null): Place {
  if (!zone) return "unmarked";
  if (member.lat == null || member.lng == null) return "unknown";
  return distanceMeters(member.lat, member.lng, zone.lat, zone.lng) <= zone.radius ? "home" : "out";
}

export function headingLabel(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "sin lectura";
  const names = ["Norte", "Noreste", "Este", "Sureste", "Sur", "Suroeste", "Oeste", "Noroeste"];
  const turn = ((value % 360) + 360) % 360;
  return names[Math.round(turn / 45) % 8];
}

export function accelWord(value: number | null) {
  if (value == null) return "sin lectura";
  if (value < 1.25) return "quieto";
  if (value < 2.2) return "en movimiento";
  return "golpe";
}

export function gyroWord(value: number | null) {
  if (value == null) return "sin lectura";
  if (value < 0.45) return "estable";
  if (value < 2) return "girando";
  return "brusco";
}

export function lightWord(value: number | null) {
  if (value == null) return "sin lectura";
  if (value < 5) return "oscuro";
  if (value < 80) return "penumbra";
  return "claro";
}
