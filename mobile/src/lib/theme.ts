export const colors = {
  bg: "#0E0B09",
  raised: "#1A1512",
  line: "#2E2620",
  text: "#F6EFE7",
  muted: "#B8A796",
  faint: "#7D6E61",
  copper: "#FFA94D",
  copperDeep: "#A35F14",
  ink: "#1C1006",
  danger: "#FF5A5F",
  dangerSoft: "#2C1517",
  sage: "#8AD99B",
  sageDeep: "#16241A",
};

export const type = {
  display: { fontFamily: "Manrope_600SemiBold", color: colors.text },
  title: { fontFamily: "Manrope_600SemiBold", color: colors.text },
  body: { fontFamily: "Manrope_400Regular", color: colors.text },
  medium: { fontFamily: "Manrope_500Medium", color: colors.text },
  label: {
    fontFamily: "Manrope_500Medium",
    color: colors.muted,
    letterSpacing: 1.4,
    textTransform: "uppercase" as const,
    fontSize: 11,
  },
};
