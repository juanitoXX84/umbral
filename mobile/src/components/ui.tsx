import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "@/lib/theme";

export function Screen({
  children,
  scroll = true,
  footer,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: footer ? 24 : insets.bottom + 28 }]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, { paddingTop: insets.top + 16 }]}>{children}</View>
  );

  return (
    <View style={styles.screen}>
      {content}
      {footer ? <View style={{ paddingBottom: insets.bottom + 12, paddingHorizontal: 24 }}>{footer}</View> : null}
    </View>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return <Text style={type.label}>{children}</Text>;
}

export function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        {...props}
        style={[styles.input, props.style]}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "quiet" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "primary" && styles.primary,
        tone === "danger" && styles.danger,
        tone === "quiet" && styles.quiet,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, tone === "quiet" && { color: colors.copper }]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ children }: { children: string }) {
  return <Text style={styles.notice}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 22 },
  field: { gap: 8 },
  input: {
    ...type.body,
    fontSize: 16,
    backgroundColor: colors.raised,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  button: {
    minHeight: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primary: { backgroundColor: colors.copper },
  danger: { backgroundColor: colors.danger },
  quiet: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.45 },
  buttonText: { ...type.title, fontSize: 16, color: colors.ink },
  notice: { ...type.body, color: colors.danger, fontSize: 14, lineHeight: 20 },
});
