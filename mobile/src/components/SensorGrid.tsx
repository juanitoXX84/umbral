import { StyleSheet, Text, View } from "react-native";
import { Compass } from "@/components/Compass";
import type { Reading } from "@/lib/sensors";
import { colors, type } from "@/lib/theme";

function accelWord(value: number | null) {
  if (value == null) return "sin lectura";
  if (value < 1.25) return "quieto";
  if (value < 2.2) return "en movimiento";
  return "golpe";
}

function gyroWord(value: number | null) {
  if (value == null) return "sin lectura";
  if (value < 0.45) return "estable";
  if (value < 2) return "girando";
  return "brusco";
}

function lightWord(value: number | null) {
  if (value == null) return "sin lectura";
  if (value < 5) return "oscuro";
  if (value < 80) return "penumbra";
  return "claro";
}

function Card({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.card}>
      <Text style={type.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

export function SensorGrid({ reading }: { reading: Reading }) {
  const place =
    reading.lat != null && reading.lng != null
      ? `${reading.lat.toFixed(4)}, ${reading.lng.toFixed(4)}`
      : "sin permiso";

  return (
    <View style={styles.grid}>
      <Card label="Acelerómetro" value={reading.accel == null ? "—" : `${reading.accel.toFixed(2)} g`} hint={accelWord(reading.accel)} />
      <Card label="Giroscopio" value={reading.gyro == null ? "—" : `${reading.gyro.toFixed(2)}`} hint={gyroWord(reading.gyro)} />
      <Card label="Luz" value={reading.light == null ? "—" : `${Math.round(reading.light)} lx`} hint={lightWord(reading.light)} />
      <Compass heading={reading.heading} accuracy={reading.headingAccuracy} />
      <View style={styles.wide}>
        <Text style={type.label}>Ubicación</Text>
        <Text style={styles.value}>{place}</Text>
        <Text style={styles.hint}>
          {reading.accuracy != null ? `precisión ${Math.round(reading.accuracy)} m` : "se envía con la protección armada"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.raised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
    minWidth: 140,
  },
  wide: {
    width: "100%",
    backgroundColor: colors.raised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  value: { ...type.title, fontSize: 22 },
  hint: { ...type.body, color: colors.muted, fontSize: 13 },
});
