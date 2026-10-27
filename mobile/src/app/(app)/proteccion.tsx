import { useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import * as Haptics from "expo-haptics";
import { StyleSheet, Text, View } from "react-native";
import { Ring } from "@/components/Ring";
import { SensorGrid } from "@/components/SensorGrid";
import { Button, Screen } from "@/components/ui";
import { confirmIdentity, biometricLabel } from "@/lib/biometric";
import { useAuth } from "@/lib/auth";
import { useProtection } from "@/lib/protection";
import { useRealtime } from "@/lib/realtime";
import { colors, type } from "@/lib/theme";
import { router } from "expo-router";

export default function Protection() {
  const { home } = useAuth();
  const { reading, busy, setPreview, arm, disarm, trigger } = useProtection();
  const { events } = useRealtime();
  const [finger, setFinger] = useState("revisando");
  const live = events.find((event) => event.status === "pending" || event.status === "alert");

  useFocusEffect(
    useCallback(() => {
      setPreview(true);
      return () => setPreview(false);
    }, [setPreview])
  );

  useEffect(() => {
    biometricLabel().then(setFinger);
  }, []);

  async function toggle() {
    const ok = await confirmIdentity(home?.protectionArmed ? "Confirma para desarmar" : "Confirma con tu huella");
    if (!ok) return;
    if (home?.protectionArmed) await disarm();
    else {
      await arm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }

  const armed = !!home?.protectionArmed;

  return (
    <Screen>
      <View style={styles.topRow}>
        <View style={styles.top}>
          <Text style={type.label}>Umbral</Text>
          <Text style={styles.title}>{home?.name}</Text>
        </View>
        <Text style={styles.profile} onPress={() => router.push("/perfil")}>Perfil</Text>
      </View>
      {live ? (
        <Text style={styles.banner} onPress={() => router.push({ pathname: "/evento/[id]", params: { id: live.id } })}>
          {live.status === "pending" ? "Alguien tiene una cuenta abierta" : `${live.userName} necesita atención`}
        </Text>
      ) : null}
      <Ring armed={armed} hot={!!live}>
        <Text style={styles.state}>{armed ? "Armada" : "En calma"}</Text>
        <Text style={styles.quiet}>{armed ? "Escuchando el teléfono" : "La casa no te sigue"}</Text>
      </Ring>
      <Button label={busy ? "Un momento" : armed ? "Desarmar" : "Armar protección"} disabled={busy} onPress={toggle} />
      <Text style={styles.finger}>Huella {finger}. El micrófono sigue cerrado.</Text>
      <SensorGrid reading={reading} />
      <Button
        label="Probar una alerta"
        tone="quiet"
        onPress={() => trigger("manual")}
        disabled={!armed}
      />
      {home?.role === "member" ? (
        <Button
          label={home.plan === "nube" ? "Plan del hogar · Nube" : "Plan del hogar · Normal"}
          tone="quiet"
          onPress={() => router.push("/plan")}
        />
      ) : null}
      <Text style={styles.note}>
        Una caída, un impacto o un forcejeo abren la misma cuenta. Si no la cancelas, Umbral guarda un video y el audio.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  top: { gap: 6, flex: 1 },
  profile: { ...type.medium, color: colors.copper, paddingBottom: 6 },
  title: { ...type.display, fontSize: 36 },
  state: { ...type.display, fontSize: 28, textAlign: "center" },
  quiet: { ...type.body, color: colors.muted, fontSize: 13, textAlign: "center" },
  finger: { ...type.body, color: colors.muted, textAlign: "center", fontSize: 14 },
  note: { ...type.body, color: colors.faint, fontSize: 14, lineHeight: 20 },
  banner: {
    ...type.medium,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    padding: 14,
    overflow: "hidden",
  },
});
