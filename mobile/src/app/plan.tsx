import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Field, Notice, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, type } from "@/lib/theme";

function digits(value: string, max: number) {
  return value.replace(/\D/g, "").slice(0, max);
}

function formatCard(value: string) {
  return digits(value, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExp(value: string) {
  const raw = digits(value, 4);
  if (raw.length <= 2) return raw;
  return `${raw.slice(0, 2)}/${raw.slice(2)}`;
}

function brandOf(value: string) {
  const raw = digits(value, 16);
  if (/^4/.test(raw)) return "Visa";
  if (/^3[47]/.test(raw)) return "American Express";
  if (/^(5[1-5]|2[2-7])/.test(raw)) return "Mastercard";
  return raw ? "Tarjeta" : "";
}

function moneyDate(value: string | null | undefined) {
  if (!value) return "el próximo mes";
  return new Date(value).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function Benefit({ title, why }: { title: string; why: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.dot} />
      <View style={styles.benefit}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.pointText}>{why}</Text>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={styles.receiptValue}>{value}</Text>
    </View>
  );
}

export default function Plan() {
  const { home, setHome } = useAuth();
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(true);
  const nube = home?.plan === "nube";
  const cancelled = nube && home?.planStatus === "cancelled";
  const brand = brandOf(number);

  async function checkout() {
    if (holder.trim().length < 3) {
      setError("Escribe el nombre como aparece en la tarjeta.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.checkout({
        plan: "nube",
        number,
        exp,
        cvc,
        mode: demo ? "prueba" : "cobro",
      });
      setHome(result.home);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cobrar.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const result = await api.cancelPlan();
      setHome(result.home);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    try {
      const result = await api.resendReceipt();
      setHome(result.home);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reenviar el correo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.page}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Volver</Text>
        </Pressable>

        <View style={styles.top}>
          <Text style={type.label}>Plan del hogar</Text>
          <Text style={styles.title}>{home?.name}</Text>
          <Text style={styles.lead}>Un solo pago cubre a todas las personas de la casa. Las demás no vuelven a pagar.</Text>
        </View>

        <View style={[styles.card, !nube && styles.cardOn]}>
          <View style={styles.cardHead}>
            <View style={styles.cardTitles}>
              <Text style={styles.cardName}>Normal</Text>
              <Text style={styles.price}>Gratis</Text>
            </View>
            {!nube ? <Text style={styles.badge}>En uso</Text> : null}
          </View>
          <Text style={styles.why}>Para la protección de todos los días, sin tarjeta.</Text>
          <Benefit title="Alertas en la casa" why="Una caída, un impacto o un forcejeo avisa a todos." />
          <Benefit title="Historial de 48 horas" why="Pasado ese tiempo, el aviso y su video se borran." />
        </View>

        <View style={[styles.card, nube && !cancelled && styles.cardOn]}>
          <View style={styles.cardHead}>
            <View style={styles.cardTitles}>
              <Text style={styles.cardName}>Nube</Text>
              <Text style={styles.price}>$149 <Text style={styles.per}>/ mes</Text></Text>
            </View>
            {nube && !cancelled ? <Text style={styles.badge}>En uso</Text> : null}
            {cancelled ? <Text style={styles.badgeMuted}>Cancelado</Text> : null}
          </View>
          <Text style={styles.why}>Estos son los extras que entran con el pago. Normal no los tiene.</Text>
          <Benefit title="Grabación de 20 segundos" why="En Normal el clip dura 8 segundos. En Nube se graban 20 de audio y video." />
          <Benefit title="Correo en cada alerta" why="Toda la casa recibe un correo con quién fue, qué pasó y un enlace al mapa." />
          <Benefit title="Historial completo" why="El aviso sigue en Alertas. En Normal se borra a las 48 horas." />
          <Benefit title="Clips que no caducan" why="El audio y el video se quedan, y desde el aviso se guardan en el teléfono." />
          <Benefit title="Un pago, toda la casa" why="Lo paga una persona. Las demás entran al mismo plan sin volver a pagar." />
        </View>

        {nube ? (
          <View style={styles.card}>
            <Text style={type.label}>Recibo</Text>
            <Row label="Pagó" value={home?.payerName || "Alguien de la casa"} />
            <Row label="Tarjeta" value={`•••• ${home?.last4 || "----"}`} />
            <Row label="Cargo" value={home?.billingMode === "prueba" ? "Demostración" : "$149.00 MXN"} />
            {home?.authCode ? <Row label="Folio" value={home.authCode} /> : null}
            <Row label="Hasta" value={moneyDate(home?.periodEnd)} />
            <Text style={styles.mail}>
              {home?.mailSent
                ? `El recibo se envió a ${home.mailTo}. Si no aparece, revisa spam.`
                : `El recibo no salió${home?.mailTo ? ` a ${home.mailTo}` : ""}. Falta conectar Gmail en el servidor.`}
            </Text>
            {home?.mailSent ? null : (
              <Pressable onPress={resend} disabled={busy} hitSlop={6} style={styles.textBtn}>
                <Text style={styles.textBtnLabel}>{busy ? "Enviando…" : "Reenviar correo"}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={type.label}>Cómo pagar Nube</Text>
            <View style={styles.choices}>
              <Pressable style={[styles.choice, demo && styles.choiceOn]} onPress={() => setDemo(true)}>
                <Text style={styles.choiceTitle}>Demostración</Text>
                <Text style={styles.choiceCopy}>Para enseñar el pago. No sale dinero.</Text>
              </Pressable>
              <Pressable style={[styles.choice, !demo && styles.choiceOn]} onPress={() => setDemo(false)}>
                <Text style={styles.choiceTitle}>Pago real</Text>
                <Text style={styles.choiceCopy}>$149 al mes por toda la casa.</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              {demo
                ? "Usa 4242 4242 4242 4242 para aprobar, o 4000 0000 0000 0002 para ver un rechazo."
                : "Cualquier tarjeta válida. El recibo llega al correo de quien paga."}
            </Text>
            <View style={styles.formHead}>
              <Text style={type.label}>Tarjeta</Text>
              <Text style={styles.brand}>{brand || "Débito o crédito"}</Text>
            </View>
            <Field label="Nombre en la tarjeta" autoCapitalize="words" value={holder} onChangeText={setHolder} placeholder="Como aparece en el plástico" />
            <Field label="Número" keyboardType="number-pad" value={number} onChangeText={(value) => setNumber(formatCard(value))} placeholder="ACCT-000003" />
            <View style={styles.row}>
              <View style={styles.half}>
                <Field label="Vence" keyboardType="number-pad" value={exp} onChangeText={(value) => setExp(formatExp(value))} placeholder="MM/AA" />
              </View>
              <View style={styles.half}>
                <Field label="CVC" keyboardType="number-pad" secureTextEntry value={cvc} onChangeText={(value) => setCvc(digits(value, 4))} placeholder="123" />
              </View>
            </View>
            {error ? <Notice>{error}</Notice> : null}
            <Button label={busy ? "Cobrando…" : demo ? "Probar el pago" : "Pagar $149"} disabled={busy} onPress={checkout} />
          </View>
        )}

        {nube ? (
          <View style={styles.cancelBox}>
            <Text style={styles.cancelCopy}>
              {cancelled
                ? `Nube sigue para todos hasta el ${moneyDate(home?.periodEnd)}. Luego la casa vuelve a Normal y no se vuelve a cobrar.`
                : `Cancelar detiene el siguiente cobro de toda la casa. Nube sigue hasta el ${moneyDate(home?.periodEnd)} y después vuelve a Normal.`}
            </Text>
            {error ? <Notice>{error}</Notice> : null}
            {cancelled ? null : (
              <Pressable onPress={cancel} disabled={busy} style={styles.cancelBtn}>
                <Text style={styles.cancelLabel}>{busy ? "Cancelando…" : "Cancelar"}</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  back: { ...type.medium, color: colors.copper, marginTop: 4 },
  top: { gap: 6 },
  title: { ...type.display, fontSize: 32 },
  lead: { ...type.body, color: colors.muted, fontSize: 15, lineHeight: 21 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
    padding: 16,
    gap: 8,
  },
  cardOn: { borderColor: colors.copper },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  cardTitles: { gap: 2, flex: 1 },
  cardName: { ...type.display, fontSize: 22 },
  price: { ...type.medium, color: colors.text, fontSize: 16 },
  per: { ...type.body, color: colors.muted, fontSize: 14 },
  badge: {
    ...type.medium,
    color: colors.ink,
    backgroundColor: colors.copper,
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
  },
  badgeMuted: {
    ...type.medium,
    color: colors.muted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
  },
  why: { ...type.body, color: colors.text, fontSize: 15, lineHeight: 21 },
  point: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.copper, marginTop: 7 },
  pointText: { ...type.body, color: colors.muted, fontSize: 14, lineHeight: 20 },
  benefit: { flex: 1, gap: 2 },
  benefitTitle: { ...type.medium, fontSize: 15 },
  choices: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4 },
  choiceOn: { borderColor: colors.copper, backgroundColor: "#2A1D10" },
  choiceTitle: { ...type.medium, fontSize: 15 },
  choiceCopy: { ...type.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  hint: { ...type.body, color: colors.faint, fontSize: 13, lineHeight: 18 },
  formHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  brand: { ...type.medium, color: colors.copper, fontSize: 13 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" },
  receiptLabel: { ...type.body, color: colors.faint, fontSize: 14 },
  receiptValue: { ...type.medium, fontSize: 14, flexShrink: 1, textAlign: "right" },
  mail: { ...type.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  textBtn: { alignSelf: "flex-start" },
  textBtnLabel: { ...type.medium, color: colors.copper, fontSize: 14 },
  cancelBox: { gap: 10, paddingHorizontal: 4 },
  cancelCopy: { ...type.body, color: colors.faint, fontSize: 13, lineHeight: 18 },
  cancelBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelLabel: { ...type.medium, color: colors.danger, fontSize: 14 },
});
