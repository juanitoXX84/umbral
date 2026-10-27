import { useEffect, useRef, useState } from "react";
import { Redirect, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FamilyMap } from "@/components/FamilyMap";
import { RadiusPicker } from "@/components/RadiusPicker";
import { Button, Field, Notice, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { readCurrentLocation } from "@/lib/sensors";
import { colors, type } from "@/lib/theme";
import type { Zone } from "@/lib/types";

export default function HomeSetup() {
  const { user, home, setHome } = useAuth();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [radius, setRadius] = useState(150);
  const [draft, setDraft] = useState<Zone | null>(null);
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [focus, setFocus] = useState(0);

  useEffect(() => {
    if (mode !== "create") return;
    let gone = false;
    readCurrentLocation()
      .then((position) => {
        if (gone) return;
        setDraft((current) => current ?? { lat: position.coords.latitude, lng: position.coords.longitude, radius: radiusRef.current });
        setFocus((current) => current + 1);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [mode]);

  if (!user) return <Redirect href="/" />;
  if (home) return <Redirect href={home.role === "central" ? "/mapa" : "/proteccion"} />;

  function chooseRadius(next: number) {
    setRadius(next);
    setDraft((current) => (current ? { ...current, radius: next } : current));
  }

  async function useHere() {
    setLocating(true);
    setError("");
    try {
      const position = await readCurrentLocation();
      setDraft({ lat: position.coords.latitude, lng: position.coords.longitude, radius });
      setFocus((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude leer la ubicación.");
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (mode === "create" && !draft) {
        setError("Toca el mapa para marcar dónde está la casa.");
        return;
      }
      const result = mode === "create"
        ? await api.createHome({
            name: name.trim(),
            zoneLat: draft?.lat,
            zoneLng: draft?.lng,
            zoneRadius: draft?.radius,
          })
        : await api.joinHome(code.trim());
      setHome(result.home);
      router.replace(result.home.role === "central" ? "/mapa" : "/proteccion");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar al hogar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={styles.title}>Tu hogar</Text>
        <Text style={styles.copy}>La central abre la casa y marca su zona. Los demás entran con el código.</Text>
      </View>
      <View style={styles.switch}>
        <Pressable onPress={() => setMode("create")} style={[styles.chip, mode === "create" && styles.chipOn]}>
          <Text style={[styles.chipText, mode === "create" && styles.chipTextOn]}>Soy la central</Text>
        </Pressable>
        <Pressable onPress={() => setMode("join")} style={[styles.chip, mode === "join" && styles.chipOn]}>
          <Text style={[styles.chipText, mode === "join" && styles.chipTextOn]}>Me invitaron</Text>
        </Pressable>
      </View>
      {mode === "create" ? (
        <>
          <Field label="Nombre del hogar" value={name} onChangeText={setName} placeholder="Casa Ortega" />
          <Text style={styles.copy}>El punto empieza donde estás. Arrástralo o toca el mapa para dejar la casa donde quieras.</Text>
          <FamilyMap
            members={[]}
            events={[]}
            zone={null}
            selectedId={null}
            onSelect={() => {}}
            placing
            draft={draft}
            focus={focus}
            label={name.trim() || "Tu casa"}
            onPlace={(lat, lng) => {
              setDraft({ lat, lng, radius });
              setError("");
            }}
            height={340}
          />
          <RadiusPicker value={radius} onChange={chooseRadius} />
          <Button label={locating ? "Buscando…" : "Usar donde estoy"} tone="quiet" disabled={locating} onPress={useHere} />
        </>
      ) : (
        <Field label="Código" autoCapitalize="characters" value={code} onChangeText={setCode} placeholder="ABC123" />
      )}
      {error ? <Notice>{error}</Notice> : null}
      <Button label={busy ? "Guardando" : "Continuar"} disabled={busy} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 8, marginTop: 12 },
  title: { ...type.display, fontSize: 42 },
  copy: { ...type.body, color: colors.muted, fontSize: 16, lineHeight: 22 },
  switch: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: "center",
  },
  chipOn: { backgroundColor: colors.copper, borderColor: colors.copper },
  chipText: { ...type.medium, color: colors.muted, fontSize: 14 },
  chipTextOn: { color: colors.ink },
});
