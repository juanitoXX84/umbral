import { useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, Field, Notice, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, type } from "@/lib/theme";

export default function Register() {
  const { signIn } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const session = await api.register({ name: name.trim(), email: email.trim(), password });
      await signIn(session.token);
      router.replace("/hogar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.copy}>Después eliges si abres la casa o si entras con un código.</Text>
      </View>
      <Field label="Nombre" value={name} onChangeText={setName} />
      <Field label="Correo" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Notice>{error}</Notice> : null}
      <Button label={busy ? "Creando" : "Continuar"} disabled={busy} onPress={submit} />
      <Button label="Volver" tone="quiet" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 8, marginTop: 12 },
  title: { ...type.display, fontSize: 42 },
  copy: { ...type.body, color: colors.muted, fontSize: 16, lineHeight: 22 },
});
