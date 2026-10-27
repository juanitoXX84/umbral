import { useEffect, useRef, useState } from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, Text, View } from "react-native";
import { Ring } from "@/components/Ring";
import { Button, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { presentAlert } from "@/lib/notify";
import { recordClip } from "@/lib/record";
import { colors, type } from "@/lib/theme";

export default function Countdown() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { home } = useAuth();
  const clipSeconds = home?.plan === "nube" ? 20 : 8;
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [left, setLeft] = useState(10);
  const [phase, setPhase] = useState<"count" | "mic" | "saving" | "sent" | "error">("count");
  const [micLeft, setMicLeft] = useState(clipSeconds);
  const [label, setLabel] = useState("Alerta");
  const [canFilm, setCanFilm] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const started = useRef(false);
  const capturing = useRef(false);
  const cancelled = useRef(false);
  const [, requestCamera] = useCameraPermissions();
  const [, requestMicrophone] = useMicrophonePermissions();

  useEffect(() => {
    if (!id) return;
    api.event(id).then((result) => setLabel(result.event.label)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (phase !== "count" || !id) return;
    if (left <= 0) {
      void beginCapture();
      return;
    }
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, phase, id]);

  useEffect(() => {
    if (phase !== "mic" || !id || capturing.current) return;
    if (canFilm && !cameraReady) return;
    capturing.current = true;
    const eventId = id;

    void (async () => {
      await activateKeepAwakeAsync("umbral-clip").catch(() => {});
      presentAlert("Umbral está grabando", `Se graban ${clipSeconds} segundos. El audio sigue aunque dejes la aplicación.`).catch(() => {});
      setMicLeft(clipSeconds);
      const audioPromise = recordClip(clipSeconds, (seconds) => setMicLeft(seconds)).catch(() => null);
      const videoPromise = canFilm
        ? (cameraRef.current?.recordAsync({ maxDuration: clipSeconds }) ?? Promise.resolve(undefined)).catch(() => undefined)
        : Promise.resolve(undefined);

      const audio = await audioPromise;
      try {
        cameraRef.current?.stopRecording();
      } catch {
        // The recording already stopped when it reached its duration or the camera closed.
      }
      const video = await Promise.race([
        videoPromise,
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 4000)),
      ]);
      await deactivateKeepAwake("umbral-clip").catch(() => {});
      if (cancelled.current) return;

      setPhase("saving");
      try {
        const result = await api.raiseEvent(eventId, { audio, video: video?.uri ?? null });
        if (!result.event.audioUrl && !result.event.videoUrl) {
          setSaveError("La alerta se envió, pero el teléfono no entregó el audio ni el video.");
          setPhase("error");
          return;
        }
        setPhase("sent");
        presentAlert(
          "Umbral",
          result.event.videoUrl ? "El video de la alerta ya está. Ábrelo para guardarlo en el teléfono." : "Tu hogar ya tiene el clip.",
          { eventId }
        ).catch(() => {});
        setTimeout(() => router.back(), 1200);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "No se pudo guardar el clip.");
        setPhase("error");
      }
    })();
  }, [phase, canFilm, cameraReady, id, clipSeconds]);

  async function cancel() {
    if (!id || cancelled.current) return;
    cancelled.current = true;
    try {
      cameraRef.current?.stopRecording();
    } catch {
      // Nothing was recording yet.
    }
    await api.cancelEvent(id).catch(() => {});
    router.back();
  }

  async function beginCapture() {
    if (!id || started.current || cancelled.current) return;
    started.current = true;
    const camera = await requestCamera();
    const microphone = await requestMicrophone();
    setCanFilm(!!camera.granted && !!microphone.granted);
    setPhase("mic");
  }

  const filming = phase === "mic" && canFilm;

  return (
    <Screen scroll={false}>
      {filming ? (
        <CameraView
          ref={cameraRef}
          mode="video"
          facing="back"
          mute={false}
          style={styles.camera}
          onCameraReady={() => setCameraReady(true)}
        />
      ) : (
        <View style={styles.fill}>
          <Ring armed hot>
            <Text style={styles.number}>{phase === "count" ? left : phase === "mic" ? micLeft : "·"}</Text>
          </Ring>
        </View>
      )}
      <View style={styles.copyBlock}>
        <Text style={styles.title}>
          {phase === "error"
            ? "No se guardó"
            : phase === "saving"
              ? "Guardando"
              : phase === "sent"
                ? "Clip guardado"
                : phase === "mic"
                  ? filming
                    ? "Grabando"
                    : "Grabando audio"
                  : "¿Sigues bien?"}
        </Text>
        <Text style={styles.copy}>
          {phase === "error"
            ? saveError
            : phase === "mic"
              ? filming
                ? "Puedes salir de Umbral. El audio sigue y el video guarda lo que la cámara alcance a filmar."
                : "Puedes salir de Umbral. El micrófono sigue grabando."
              : phase === "sent"
                ? "Ábrelo en Alertas para verlo y escucharlo."
                : phase === "saving"
                  ? "Subiendo el archivo a tu casa."
                  : `${label}. Si no respondes, Umbral graba ${clipSeconds} segundos de audio y video.`}
        </Text>
        {filming ? <Text style={styles.timer}>{micLeft}</Text> : null}
      </View>
      <View style={[styles.actions, { marginBottom: insets.bottom + 72 }]}>
        {phase === "count" ? <Button label="Estoy bien" tone="danger" onPress={cancel} /> : null}
        {phase === "error" ? <Button label="Volver" tone="quiet" onPress={() => router.back()} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "center" },
  camera: { flex: 1, borderRadius: 16, overflow: "hidden" },
  copyBlock: { gap: 8, paddingTop: 18 },
  actions: { marginTop: 8 },
  number: { ...type.display, fontSize: 72, lineHeight: 78, textAlign: "center" },
  timer: { ...type.display, fontSize: 42, textAlign: "center" },
  title: { ...type.display, fontSize: 34, textAlign: "center" },
  copy: { ...type.body, color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: "center" },
});
