import * as LocalAuthentication from "expo-local-authentication";
import { Alert, Platform } from "react-native";

export async function confirmIdentity(reason: string) {
  try {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hardware && (await LocalAuthentication.isEnrolledAsync());
    if (hardware && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        cancelLabel: "Cancelar",
        fallbackLabel: "Usar clave",
      });
      return result.success;
    }
  } catch {
    // Fall through to an explicit confirmation when the sensor is unavailable.
  }

  if (Platform.OS === "web") return true;

  return new Promise<boolean>((resolve) => {
    Alert.alert("Confirmar", "Este teléfono no tiene huella registrada. ¿Continuar de todas formas?", [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: "Continuar", onPress: () => resolve(true) },
    ]);
  });
}

export async function biometricLabel() {
  try {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    if (!hardware) return "sin sensor";
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled ? "lista" : "sin registrar";
  } catch {
    return "sin sensor";
  }
}
