import { useEffect, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, Field, Notice, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getServer, setItem } from "@/lib/storage";
import { colors, type } from "@/lib/theme";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [showServer, setShowServer] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getServer().then(setServer);
  }, []);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (server.trim()) await setItem("server", server.trim().replace(/\/$/, ""));
      const session = await api.login({ email: email.trim(), password });
      const home = await signIn(session.token);
      router.replace(home ? (home.role === "central" ? "/mapa" : "/proteccion") : "/hogar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={styles.title}>Entrar</Text>
        <Text style={styles.copy}>La central y cada miembro usan la misma puerta.</Text>
      </View>
      <Field label="Correo" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
      <Text style={styles.link} onPress={() => setShowServer((value) => !value)}>
        Servidor
      </Text>
      {showServer ? (
        <Field
          label="Dirección"
          autoCapitalize="none"
          value={server}
          onChangeText={setServer}
          onEndEditing={() => setItem("server", server.trim())}
        />
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <Button label={busy ? "Entrando" : "Entrar"} disabled={busy} onPress={submit} />
      <Button label="Volver" tone="quiet" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 8, marginTop: 12 },
  title: { ...type.display, fontSize: 42 },
  copy: { ...type.body, color: colors.muted, fontSize: 16, lineHeight: 22 },
  link: { ...type.medium, color: colors.copper, fontSize: 14 },
});
