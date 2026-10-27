import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, type } from "@/lib/theme";

export default function House() {
  const { home } = useAuth();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!home?.inviteCode) return;
    await Clipboard.setStringAsync(home.inviteCode);
    setCopied(true);
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={type.label}>Central</Text>
        <Text style={styles.title}>{home?.name}</Text>
      </View>
      <View style={styles.codeCard}>
        <Text style={type.label}>Código de la casa</Text>
        <Text style={styles.code}>{home?.inviteCode}</Text>
        <Text style={styles.copy}>{copied ? "Copiado" : "Compártelo con quien viva contigo."}</Text>
        <Button label="Copiar código" tone="quiet" onPress={copy} />
      </View>
      <Button
        label={home?.zone ? "Mover la zona" : "Marcar la zona"}
        tone="quiet"
        onPress={() => router.push("/zona")}
      />
      <Button label={home?.plan === "nube" ? "Plan del hogar · Nube" : "Plan del hogar · Normal"} tone="quiet" onPress={() => router.push("/plan")} />
      <Button label="Perfil" tone="quiet" onPress={() => router.push("/perfil")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: 6 },
  title: { ...type.display, fontSize: 36 },
  codeCard: {
    backgroundColor: colors.raised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 12,
  },
  code: { ...type.display, fontSize: 40, letterSpacing: 6 },
  copy: { ...type.body, color: colors.muted },
});
