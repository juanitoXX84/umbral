import { useState } from "react";
import { Redirect, router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { FamilyMap } from "@/components/FamilyMap";
import { RadiusPicker } from "@/components/RadiusPicker";
import { Button, Notice, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { readCurrentLocation } from "@/lib/sensors";
import { colors, type } from "@/lib/theme";
import type { Zone } from "@/lib/types";

export default function ZoneScreen() {
  const { user, home, setHome } = useAuth();
  const [radius, setRadius] = useState(home?.zone?.radius ?? 150);
  const [draft, setDraft] = useState<Zone | null>(home?.zone ?? null);
  const [focus, setFocus] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  if (!user) return <Redirect href="/" />;
  if (!home) return <Redirect href="/hogar" />;
  if (home.role !== "central") return <Redirect href="/proteccion" />;

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

  async function save() {
    if (!draft) {
      setError("Toca el mapa para marcar dónde está la casa.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.setZone({ zoneLat: draft.lat, zoneLng: draft.lng, zoneRadius: draft.radius });
      setHome(result.home);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la zona.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={type.label}>Casa</Text>
        <Text style={styles.title}>{home.zone ? "Mover la zona" : "Marcar la zona"}</Text>
      </View>
      <Text style={styles.copy}>Toca el mapa donde está la casa. Quien salga de ese círculo se marca como fuera.</Text>
      <FamilyMap
        members={home.members}
        events={[]}
        zone={home.zone}
        selectedId={null}
        onSelect={() => {}}
        placing
        draft={draft}
        focus={focus}
        label={home.name}
        onPlace={(lat, lng) => {
          setDraft({ lat, lng, radius });
          setError("");
        }}
        height={380}
      />
      <RadiusPicker value={radius} onChange={chooseRadius} />
      <Button label={locating ? "Buscando…" : "Usar donde estoy"} tone="quiet" disabled={locating} onPress={useHere} />
      {error ? <Notice>{error}</Notice> : null}
      <Button label={busy ? "Guardando" : "Guardar zona"} disabled={busy || locating} onPress={save} />
      <Button label="Cancelar" tone="quiet" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 6, marginTop: 8 },
  title: { ...type.display, fontSize: 36 },
  copy: { ...type.body, color: colors.muted, fontSize: 16, lineHeight: 22 },
});
