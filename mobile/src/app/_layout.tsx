import { useEffect } from "react";
import { Stack } from "expo-router";
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold } from "@expo-google-fonts/manrope";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { quietDevMenu } from "@/lib/devMenu";
import "@/lib/locationTask";
import { AuthProvider } from "@/lib/auth";
import { ProtectionProvider } from "@/lib/protection";
import { RealtimeProvider } from "@/lib/realtime";
import { colors } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});
quietDevMenu();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <AuthProvider>
      <RealtimeProvider>
        <ProtectionProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="registro" />
            <Stack.Screen name="hogar" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="cuenta/[id]" options={{ animation: "fade", gestureEnabled: false }} />
            <Stack.Screen name="evento/[id]" />
            <Stack.Screen name="zona" />
            <Stack.Screen name="plan" />
            <Stack.Screen name="perfil" />
          </Stack>
        </ProtectionProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}
