import { Redirect, router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, type } from "@/lib/theme";

export default function Welcome() {
  const { ready, user, home } = useAuth();
  if (!ready) return <View style={styles.blank} />;
  if (user && home) return <Redirect href={home.role === "central" ? "/mapa" : "/proteccion"} />;
  if (user) return <Redirect href="/hogar" />;

  return (
    <Screen scroll={false}>
      <View style={styles.hero}>
        <View style={styles.mark} />
        <Text style={styles.word}>Umbral</Text>
        <Text style={styles.lead}>Tu casa se entera{"\n"}si tú no puedes avisar.</Text>
      </View>
      <View style={styles.actions}>
        <Button label="Crear cuenta" onPress={() => router.push("/registro")} />
        <Button label="Ya tengo cuenta" tone="quiet" onPress={() => router.push("/login")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: colors.bg },
  hero: { flex: 1, justifyContent: "flex-end", gap: 16 },
  mark: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: colors.copper,
  },
  word: { ...type.display, fontSize: 64, lineHeight: 68 },
  lead: { ...type.body, color: colors.muted, fontSize: 20, lineHeight: 28 },
  actions: { gap: 10, paddingBottom: 12 },
});
