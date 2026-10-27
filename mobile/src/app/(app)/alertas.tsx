import { useCallback } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/ui";
import { formatWhen, statusLabel } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { colors, type } from "@/lib/theme";

export default function Alerts() {
  const { events, refreshEvents } = useRealtime();

  useFocusEffect(useCallback(() => {
    refreshEvents().catch(() => {});
  }, [refreshEvents]));

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={type.label}>Historial</Text>
        <Text style={styles.title}>Alertas</Text>
      </View>
      {events.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay avisos. El plan Hogar conserva 48 horas. El plan Nube, el archivo completo.</Text>
      ) : (
        events.map((event) => (
          <Pressable key={event.id} style={styles.row} onPress={() => router.push({ pathname: "/evento/[id]", params: { id: event.id } })}>
            <View style={styles.copy}>
              <Text style={styles.label}>{event.label}</Text>
              <Text style={styles.meta}>{event.userName} · {formatWhen(event.createdAt)}</Text>
            </View>
            <Text style={[styles.status, event.status === "alert" && { color: colors.danger }]}>{statusLabel[event.status]}</Text>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 6 },
  title: { ...type.display, fontSize: 36 },
  empty: { ...type.body, color: colors.muted, fontSize: 16, lineHeight: 23 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  copy: { gap: 4, flex: 1 },
  label: { ...type.medium, fontSize: 16 },
  meta: { ...type.body, color: colors.muted, fontSize: 13 },
  status: { ...type.medium, color: colors.faint, fontSize: 13 },
});
