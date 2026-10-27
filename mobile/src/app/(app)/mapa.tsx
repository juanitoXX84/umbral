import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FamilyMap } from "@/components/FamilyMap";
import { Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { accelWord, distanceMeters, formatDistance, gyroWord, headingLabel, lightWord, placeOf } from "@/lib/place";
import { useProtection } from "@/lib/protection";
import { readCurrentLocation } from "@/lib/sensors";
import { useRealtime } from "@/lib/realtime";
import type { Reading } from "@/lib/sensors";
import { colors, type } from "@/lib/theme";
import type { Member, Zone } from "@/lib/types";

export default function MapScreen() {
  const { user, home } = useAuth();
  const { reading } = useProtection();
  const { events } = useRealtime();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);

  useEffect(() => {
    let gone = false;
    readCurrentLocation()
      .then((position) => {
        if (!gone) {
          setGps({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        }
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);
  const members = home?.members ?? [];
  const zone = home?.zone ?? null;
  const outside = zone ? members.filter((member) => placeOf(member, zone) === "out") : [];
  const located = members.filter((member) => member.lat != null).length;
  const missing = zone ? members.filter((member) => placeOf(member, zone) === "unknown").length : 0;
  const live = events.find((event) => event.status === "alert" || event.status === "pending");
  const ordered = [...members].sort((a, b) => rank(a, zone) - rank(b, zone));

  function choose(id: string) {
    setSelectedId((current) => (current === id ? null : id));
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <View style={styles.top}>
          <Text style={type.label}>Hogar</Text>
          <Text style={styles.title}>{home?.name}</Text>
        </View>
        <Text style={styles.profile} onPress={() => router.push("/perfil")}>Perfil</Text>
      </View>
      {zone ? (
        <Text style={styles.zoneLine}>
          {outside.length
            ? `${outside.length} fuera de casa`
            : !located
              ? "Nadie comparte ubicación todavía"
              : missing
                ? `${located} en casa`
                : "Todos dentro de la zona"}{" "}
          · {zone.radius} m
        </Text>
      ) : (
        <Text style={styles.zoneLine}>Sin zona marcada</Text>
      )}
      {live ? (
        <Pressable onPress={() => router.push({ pathname: "/evento/[id]", params: { id: live.id } })} style={styles.banner}>
          <Text style={styles.bannerTitle}>{live.status === "pending" ? "Esperando confirmación" : live.label}</Text>
          <Text style={styles.bannerCopy}>{live.userName}</Text>
        </Pressable>
      ) : null}
      <FamilyMap
        members={members}
        events={events}
        zone={zone}
        label={home?.name || "Casa"}
        here={
          reading.lat != null && reading.lng != null
            ? { lat: reading.lat, lng: reading.lng, accuracy: reading.accuracy }
            : gps
        }
        selectedId={selectedId}
        onSelect={choose}
        height={420}
      />
      <Text style={styles.note}>Toca a alguien para ver su información. Tócalo otra vez para ocultarla.</Text>
      <View style={styles.list}>
            {ordered.map((member) => {
              const on = member.userId === selectedId;
              const place = placeOf(member, zone);
              return (
                <View key={member.userId} style={styles.person}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => choose(member.userId)}
                    style={[styles.row, on && styles.rowOn]}
                  >
                    <View style={[styles.dot, dotStyle(member, zone)]} />
                    <View style={styles.copy}>
                      <Text style={styles.name}>{member.name}</Text>
                      <Text style={[styles.meta, place === "out" && styles.out]}>
                        {member.role === "central" ? "Central" : "Miembro"} · {placeLine(member, zone)} · {timeAgo(member.lastSeen)}
                      </Text>
                    </View>
                  </Pressable>
                  {on ? (
                    <MemberSheet
                      member={member}
                      zone={zone}
                      reading={member.userId === user?.id ? reading : null}
                    />
                  ) : null}
                </View>
              );
            })}
      </View>
    </Screen>
  );
}

function MemberSheet({ member, zone, reading }: { member: Member; zone: Zone | null; reading: Reading | null }) {
  const data = reading ?? readingFrom(member);
  const shown = reading ? { ...member, lat: data.lat, lng: data.lng } : member;
  const place = placeOf(shown, zone);
  const fresh = reading != null || (member.lastSeen != null && Date.now() - new Date(member.lastSeen).getTime() < 2500);
  const rows = [
    ["Acelerómetro", data.accel == null ? "sin lectura" : `${data.accel.toFixed(2)} g · ${accelWord(data.accel)}`],
    ["Giroscopio", data.gyro == null ? "sin lectura" : `${data.gyro.toFixed(2)} · ${gyroWord(data.gyro)}`],
    ["Luz", data.light == null ? "sin lectura" : `${Math.round(data.light)} lx · ${lightWord(data.light)}`],
    ["Brújula", data.heading == null ? "sin lectura" : `${headingLabel(data.heading)} · ${Math.round(data.heading)}°`],
    ["Ubicación", data.lat == null || data.lng == null ? "sin permiso" : `${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`],
  ];
  return (
    <View style={styles.sheet}>
      <View style={styles.cardHead}>
        <Text style={styles.sheetName}>{member.name}</Text>
        <Text style={[styles.live, fresh && styles.liveOn]}>{fresh ? "En vivo" : timeAgo(member.lastSeen)}</Text>
      </View>
      <Text style={[styles.place, place === "out" && styles.out, place === "home" && styles.home]}>
        {placeLine(shown, zone)} · {member.protectionArmed ? "Armada" : "En calma"}
      </Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.sensor}>
          <Text style={styles.sensorLabel}>{label}</Text>
          <Text style={styles.sensorValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function readingFrom(member: Member): Reading {
  return {
    accel: member.sensors.accel,
    gyro: member.sensors.gyro,
    heading: member.sensors.heading,
    headingAccuracy: member.sensors.headingAccuracy ?? null,
    light: member.sensors.light,
    lat: member.lat,
    lng: member.lng,
    accuracy: member.accuracy,
  };
}

function rank(member: Member, zone: Zone | null) {
  const place = placeOf(member, zone);
  if (place === "out") return 0;
  if (place === "unknown") return 1;
  return 2;
}

function placeLine(member: Member, zone: Zone | null) {
  const place = placeOf(member, zone);
  if (place === "out" && zone && member.lat != null && member.lng != null) {
    return `Salió · ${formatDistance(distanceMeters(member.lat, member.lng, zone.lat, zone.lng))}`;
  }
  if (place === "home") return "En casa";
  if (place === "unknown") return "Sin ubicación";
  return "Sin zona";
}

function dotStyle(member: Member, zone: Zone | null) {
  const place = placeOf(member, zone);
  if (place === "out") return styles.dotOut;
  if (member.protectionArmed) return styles.dotOn;
  return null;
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  top: { gap: 6, flex: 1 },
  profile: { ...type.medium, color: colors.copper, paddingBottom: 6 },
  title: { ...type.display, fontSize: 36 },
  zoneLine: { ...type.medium, color: colors.copper, fontSize: 14 },
  banner: { backgroundColor: colors.dangerSoft, borderRadius: 16, padding: 14, gap: 2 },
  bannerTitle: { ...type.medium, color: colors.danger },
  bannerCopy: { ...type.body, color: colors.text },
  note: { ...type.body, color: colors.muted, fontSize: 14, lineHeight: 20 },
  list: { gap: 10 },
  person: { gap: 8 },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: colors.raised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  rowOn: { borderColor: colors.copper },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.faint },
  dotOn: { backgroundColor: colors.copper },
  dotOut: { backgroundColor: colors.danger },
  copy: { gap: 2, flex: 1 },
  name: { ...type.medium, fontSize: 16 },
  meta: { ...type.body, color: colors.muted, fontSize: 13 },
  out: { color: colors.danger },
  home: { color: colors.sage },
  sheet: {
    backgroundColor: colors.raised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sheetName: { ...type.title, fontSize: 22, flex: 1 },
  live: { ...type.medium, color: colors.faint, fontSize: 13 },
  liveOn: { color: colors.sage },
  place: { ...type.body, color: colors.muted, fontSize: 14 },
  sensor: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  sensorLabel: { ...type.body, color: colors.muted, fontSize: 14 },
  sensorValue: { ...type.medium, fontSize: 14, flex: 1, textAlign: "right" },
});
