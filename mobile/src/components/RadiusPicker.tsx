import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@/lib/theme";

export const ZONE_RADII = [80, 150, 300, 600];

export function RadiusPicker({ value, onChange }: { value: number; onChange: (meters: number) => void }) {
  return (
    <View style={styles.row}>
      {ZONE_RADII.map((meters) => {
        const on = meters === value;
        return (
          <Pressable key={meters} accessibilityRole="button" onPress={() => onChange(meters)} style={[styles.chip, on && styles.on]}>
            <Text style={[styles.text, on && styles.textOn]}>{meters} m</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
    alignItems: "center",
  },
  on: { backgroundColor: colors.copper, borderColor: colors.copper },
  text: { ...type.medium, color: colors.muted, fontSize: 13 },
  textOn: { color: colors.ink },
});
