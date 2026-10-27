import { memo, useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";
import { colors, type } from "@/lib/theme";

const SIZE = 220;
const CENTER = 120;

const marks = Array.from({ length: 72 }, (_, index) => {
  const cardinal = index % 18 === 0;
  const major = index % 6 === 0;
  const rad = (index * 5 * Math.PI) / 180;
  const inner = cardinal ? 86 : major ? 94 : 100;
  return {
    x1: CENTER + Math.sin(rad) * inner,
    y1: CENTER - Math.cos(rad) * inner,
    x2: CENTER + Math.sin(rad) * 108,
    y2: CENTER - Math.cos(rad) * 108,
    stroke: index === 0 ? colors.copper : major ? colors.muted : colors.line,
    width: cardinal ? 2.4 : 1,
  };
});

const labels = [
  { letter: "N", angle: 0, fill: colors.copper, size: 18 },
  { letter: "E", angle: 90, fill: colors.muted, size: 14 },
  { letter: "S", angle: 180, fill: colors.muted, size: 14 },
  { letter: "O", angle: 270, fill: colors.muted, size: 14 },
];

function direction(value: number | null) {
  if (value == null) return "Buscando el norte";
  const names = ["Norte", "Noreste", "Este", "Sureste", "Sur", "Suroeste", "Oeste", "Noroeste"];
  return names[Math.round(value / 45) % 8];
}

function hint(heading: number | null, accuracy: number | null) {
  if (heading == null) return "Acepta la ubicación para orientarla";
  if (accuracy == null || accuracy <= 0) return "Mueve el teléfono en forma de 8";
  if (accuracy === 1) return "Precisión baja. Aléjate de imanes y metal";
  return "La aguja busca el norte. La marca es tu rumbo";
}

function Rose() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 240 240">
      <Circle cx={CENTER} cy={CENTER} r={108} stroke={colors.line} strokeWidth={1} fill={colors.bg} />
      <Circle cx={CENTER} cy={CENTER} r={74} stroke={colors.line} strokeWidth={1} fill="none" />
      {marks.map((mark, index) => (
        <Line key={index} x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} stroke={mark.stroke} strokeWidth={mark.width} />
      ))}
      {labels.map((item) => {
        const rad = (item.angle * Math.PI) / 180;
        return (
          <SvgText
            key={item.letter}
            x={CENTER + Math.sin(rad) * 80}
            y={CENTER - Math.cos(rad) * 80 + 5}
            fill={item.fill}
            fontSize={item.size}
            fontFamily="Manrope_600SemiBold"
            textAnchor="middle"
          >
            {item.letter}
          </SvgText>
        );
      })}
      <Polygon points="120,66 113,118 127,118" fill={colors.copper} />
      <Polygon points="120,174 114,122 126,122" fill={colors.faint} />
      <Circle cx={CENTER} cy={CENTER} r={7} fill={colors.copperDeep} />
      <Circle cx={CENTER} cy={CENTER} r={3} fill={colors.copper} />
    </Svg>
  );
}

export const Compass = memo(
  function Compass({ heading, accuracy }: { heading: number | null; accuracy: number | null }) {
    const turn = useSharedValue(0);
    const shown = useRef(0);
    const ready = useRef(false);

    useEffect(() => {
      if (heading == null) return;
      const target = ((-heading % 360) + 360) % 360;
      if (!ready.current) {
        ready.current = true;
        shown.current = target;
        turn.value = target;
        return;
      }
      const current = ((shown.current % 360) + 360) % 360;
      let delta = target - current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      shown.current += delta;
      turn.value = withTiming(shown.current, { duration: 220, easing: Easing.out(Easing.cubic) });
    }, [heading, turn]);

    const roseStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

    return (
      <View style={styles.card}>
        <Text style={type.label}>Brújula</Text>
        <View style={styles.dial}>
          <View style={styles.marker} />
          <Animated.View style={roseStyle}>
            <Rose />
          </Animated.View>
        </View>
        <Text style={styles.direction}>{direction(heading)}</Text>
        <Text style={styles.degrees}>{heading == null ? "—" : `${Math.round(heading)}°`}</Text>
        <Text style={styles.hint}>{hint(heading, accuracy)}</Text>
      </View>
    );
  },
  (prev, next) => Math.round(prev.heading ?? -1) === Math.round(next.heading ?? -1) && prev.accuracy === next.accuracy
);

const styles = StyleSheet.create({
  card: {
    width: "100%",
    flexBasis: "100%",
    backgroundColor: colors.raised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 4,
    alignItems: "center",
  },
  dial: { width: SIZE, height: SIZE + 8, alignItems: "center", marginTop: 8 },
  marker: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.copper,
    zIndex: 2,
    marginBottom: -4,
  },
  direction: { ...type.title, fontSize: 28, marginTop: 4 },
  degrees: { ...type.medium, color: colors.copper, fontSize: 16 },
  hint: { ...type.body, color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 2 },
});
