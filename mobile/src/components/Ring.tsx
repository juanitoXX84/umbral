import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/lib/theme";

export function Ring({
  armed,
  hot,
  children,
}: {
  armed: boolean;
  hot?: boolean;
  children?: React.ReactNode;
}) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(1);
  const color = hot ? colors.danger : armed ? colors.copper : colors.faint;

  useEffect(() => {
    spin.value = 0;
    spin.value = withRepeat(withTiming(360, { duration: hot ? 2800 : armed ? 14000 : 26000, easing: Easing.linear }), -1);
    pulse.value = withRepeat(withTiming(hot ? 1.045 : 1.02, { duration: hot ? 700 : 2200 }), -1, true);
  }, [armed, hot, pulse, spin]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View style={[styles.wrap, pulseStyle]}>
      <Animated.View style={[styles.absolute, spinStyle]}>
        <Svg width={248} height={248} viewBox="0 0 248 248">
          <Circle cx="124" cy="124" r="108" stroke={colors.line} strokeWidth="1" fill="none" />
          <Circle
            cx="124"
            cy="124"
            r="108"
            stroke={color}
            strokeWidth={hot ? 3 : 2}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={armed || hot ? "150 530" : "28 652"}
          />
          <Circle cx="124" cy="124" r="86" stroke={colors.line} strokeWidth="1" fill={colors.raised} />
        </Svg>
      </Animated.View>
      <View style={styles.center}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 248, height: 248, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  absolute: { position: "absolute" },
  center: { width: 150, alignItems: "center", gap: 4 },
});
