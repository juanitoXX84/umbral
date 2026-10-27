import { Redirect, Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { colors, type } from "@/lib/theme";

const labels: Record<string, string> = {
  mapa: "Mapa",
  alertas: "Alertas",
  proteccion: "Anillo",
  casa: "Casa",
};

export default function AppLayout() {
  const { ready, user, home } = useAuth();
  const insets = useSafeAreaInsets();
  if (!ready) return <View style={styles.blank} />;
  if (!user) return <Redirect href="/" />;
  if (!home) return <Redirect href="/hogar" />;

  const order = home.role === "central" ? ["mapa", "alertas", "proteccion", "casa"] : ["proteccion", "alertas"];

  return (
    <Tabs
      initialRouteName={home.role === "central" ? "mapa" : "proteccion"}
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {order.map((name) => {
            const route = state.routes.find((item) => item.name === name);
            if (!route) return null;
            const focused = state.routes[state.index]?.name === name;
            return (
              <Pressable key={name} style={styles.tab} onPress={() => navigation.navigate(name)}>
                <Text style={[styles.label, focused && styles.labelOn]}>{labels[name]}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <Tabs.Screen name="mapa" />
      <Tabs.Screen name="alertas" />
      <Tabs.Screen name="proteccion" />
      <Tabs.Screen name="casa" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: "row",
    backgroundColor: colors.raised,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8 },
  label: { ...type.medium, color: colors.faint, fontSize: 13 },
  labelOn: { color: colors.copper },
});
