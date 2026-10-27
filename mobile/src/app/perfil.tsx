import { useEffect, useState } from "react";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Field, Notice, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getServer } from "@/lib/storage";
import { colors, type } from "@/lib/theme";
import { syncSessionToWatch, watchSyncCopy } from "@/lib/wearSync";

export default function Profile() {
  const { user, home, signOut, refresh } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [localPhoto, setLocalPhoto] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [watch, setWatch] = useState("");
  const [linking, setLinking] = useState(false);

  async function linkWatch() {
    setLinking(true);
    setWatch("");
    const result = await syncSessionToWatch();
    setWatch(watchSyncCopy[result]);
    setLinking(false);
  }

  useEffect(() => {
    getServer().then(setServer);
  }, []);

  const photo = localPhoto || (user?.photoUrl && server ? `${server}${user.photoUrl}` : "");

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setLocalPhoto(asset.uri);
    setUploading(true);
    setError("");
    setSaved("");
    try {
      await api.uploadPhoto(asset.uri);
      await refresh();
      setSaved("Foto lista. Así te verán en el mapa.");
    } catch (err) {
      setLocalPhoto("");
      setError(err instanceof Error ? err.message : "No se pudo guardar la foto.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api.updateProfile({
        name: name.trim(),
        email: email.trim(),
        ...(password ? { password, currentPassword } : {}),
      });
      setPassword("");
      setCurrentPassword("");
      await refresh();
      setSaved("Cambios guardados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    Alert.alert(
      home?.role === "central" ? "Cerrar el hogar" : "Salir del hogar",
      home?.role === "central" ? "Se borra la casa y el historial." : "Dejarás de aparecer en el mapa.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Salir",
          style: "destructive",
          onPress: async () => {
            await api.leaveHome();
            await refresh();
            router.replace("/hogar");
          },
        },
      ]
    );
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>Volver</Text></Pressable>
      <View style={styles.top}>
        <Text style={type.label}>{home?.role === "central" ? "Central" : "Miembro"}</Text>
        <Text style={styles.title}>Perfil</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={pickPhoto} disabled={uploading} style={styles.photoButton}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <View style={styles.photoEmpty}><Text style={styles.photoMark}>+</Text></View>}
        <Text style={styles.photoCopy}>{uploading ? "Subiendo la foto…" : "Toca para poner tu foto. Sale en el mapa."}</Text>
      </Pressable>
      <Field label="Nombre" value={name} onChangeText={setName} placeholder="Tu nombre" />
      <Field label="Correo" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="tu@correo.com" />
      <Field label="Contraseña actual" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} placeholder="Solo si cambias la contraseña" />
      <Field label="Contraseña nueva" secureTextEntry value={password} onChangeText={setPassword} placeholder="Déjala vacía si no la cambias" />
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Text style={styles.saved}>{saved}</Text> : null}
      <Button label={busy ? "Guardando" : "Guardar"} disabled={busy || uploading} onPress={save} />
      <Button label={linking ? "Enviando al reloj…" : "Vincular reloj"} tone="quiet" disabled={linking} onPress={linkWatch} />
      {watch ? <Text style={styles.watch}>{watch}</Text> : null}
      <Button label="Cerrar sesión" tone="quiet" onPress={async () => { await signOut(); router.replace("/"); }} />
      {home ? <Button label={home.role === "central" ? "Cerrar el hogar" : "Salir del hogar"} tone="danger" onPress={leave} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { ...type.medium, color: colors.copper, marginTop: 8 },
  top: { gap: 6 },
  title: { ...type.display, fontSize: 40 },
  photoButton: { flexDirection: "row", alignItems: "center", gap: 16 },
  photo: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.raised },
  photoEmpty: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  photoMark: { ...type.display, fontSize: 32, color: colors.copper },
  photoCopy: { ...type.body, color: colors.muted, flex: 1, fontSize: 15, lineHeight: 21 },
  saved: { ...type.body, color: colors.sage, fontSize: 15 },
  watch: { ...type.body, color: colors.muted, fontSize: 14, lineHeight: 20 },
});
