import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Notice, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatWhen, statusLabel } from "@/lib/format";
import { getServer } from "@/lib/storage";
import type { AppEvent } from "@/lib/types";
import { colors, type } from "@/lib/theme";

function SavedVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
  });
  return <VideoView player={player} style={styles.video} nativeControls contentFit="cover" />;
}

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { home } = useAuth();
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [server, setServer] = useState("");
  const [saved, setSaved] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getServer().then(setServer);
    if (!id) return;
    api.event(id).then((result) => setEvent(result.event)).catch(() => {});
  }, [id]);

  const audio = event?.audioUrl && server ? `${server}${event.audioUrl}` : null;
  const video = event?.videoUrl && server ? `${server}${event.videoUrl}` : null;

  async function download() {
    if (!video || !event || saving) return;
    setSaving(true);
    setSaved("");
    setFailed(false);
    try {
      const { saveVideoToDevice } = await import("@/lib/saveVideo");
      const wrote = await saveVideoToDevice(video, event.id);
      setSaved(wrote ? "El video quedó en la carpeta que elegiste." : "No se eligió una carpeta.");
    } catch (err) {
      setFailed(true);
      setSaved(err instanceof Error ? err.message : "No se pudo guardar el video.");
    } finally {
      setSaving(false);
    }
  }

  async function resolve() {
    if (!event) return;
    const result = await api.resolveEvent(event.id);
    setEvent(result.event);
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>Volver</Text></Pressable>
      <View style={styles.top}>
        <Text style={type.label}>{event ? statusLabel[event.status] : "Alerta"}</Text>
        <Text style={styles.title}>{event?.label ?? "Cargando"}</Text>
        {event ? <Text style={styles.copy}>{event.userName} · {formatWhen(event.createdAt)}</Text> : null}
      </View>
      {event?.lat != null && event.lng != null ? (
        <Text style={styles.place}>{event.lat.toFixed(4)}, {event.lng.toFixed(4)}</Text>
      ) : null}
      {video ? <SavedVideo url={video} /> : null}
      {video ? (
        <Text style={styles.copy}>
          {home?.plan === "nube"
            ? "Plan Nube: este video se queda y puedes guardarlo en el teléfono."
            : "Plan Normal: este video se borra a las 48 horas."}
        </Text>
      ) : null}
      {video ? <Button label={saving ? "Guardando…" : "Guardar video en el teléfono"} disabled={saving} onPress={download} /> : null}
      {saved && failed ? <Notice>{saved}</Notice> : null}
      {saved && !failed ? <Text style={styles.ok}>{saved}</Text> : null}
      {event && event.status === "alert" && !audio && !video ? (
        <Text style={styles.copy}>Esta alerta se envió sin audio ni video.</Text>
      ) : null}
      {home?.role === "central" && event && event.status !== "resolved" && event.status !== "cancelled" ? (
        <Button label="Cerrar alerta" tone="quiet" onPress={resolve} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { ...type.medium, color: colors.copper, marginTop: 8 },
  top: { gap: 8 },
  title: { ...type.display, fontSize: 40 },
  copy: { ...type.body, color: colors.muted, lineHeight: 22 },
  place: { ...type.medium, color: colors.copper, fontSize: 16 },
  ok: { ...type.body, color: colors.sage, fontSize: 15, lineHeight: 21 },
  video: { height: 280, borderRadius: 16, backgroundColor: "#000" },
});
