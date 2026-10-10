import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOBD } from '../../../src/obd/context';
import { terminalPolicy, userMessage } from '../../../src/obd/protocol';
import { copyText } from '../../../src/ui/clipboard';
import { useToast } from '../../../src/ui/toast';
import { Icon } from '../../../src/ui/icons';
import { ConfirmModal } from '../../../src/ui/primitives';
import { SubHeader } from '../../../src/ui/SubHeader';
import { usePro, useProGate, type ProFeature } from '../../../src/pro/entitlement';
import { Button, Card, Screen } from '../../../src/ui/primitives';
import { colors, fonts } from '../../../src/ui/theme';

type Entry = { id: string; command: string; response: string; ok: boolean; ts: string };

const MAX_HISTORY = 50;

/** One-tap commands. The terminal is the one screen where raw commands are expected. */
const QUICK_COMMANDS = ['ATRV', '0100', '03', '0A', '010C', '0131', '0902'] as const;

const CLEAR_BODY =
  'Hata kodlarını silmek arızayı çözmez, sadece lambayı söndürür. Altta yatan sorun sürerse kod tekrar gelecek.';

function timeNow(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

function TerminalScreenInner() {
  const { state, client, adapterVersion } = useOBD();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmCmd, setConfirmCmd] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const nextId = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const push = useCallback((e: Omit<Entry, 'id' | 'ts'>) => {
    const entry: Entry = { ...e, id: `${++nextId.current}`, ts: timeNow() };
    setHistory((prev) => [...prev, entry].slice(-MAX_HISTORY));
  }, []);

  const execute = useCallback(
    async (cmd: string) => {
      setBusy(true);
      try {
        // Raw terminal: no automatic STOPPED / BUS INIT recovery; logged to Bağlantı günlüğü.
        const raw = await client.send(cmd, { recover: false, trace: true });
        push({ command: cmd, response: raw.trim() || '(boş cevap)', ok: true });
      } catch (e) {
        push({ command: cmd, response: userMessage(e), ok: false });
      } finally {
        setBusy(false);
      }
    },
    [client, push]
  );

  const submit = useCallback(
    (raw: string) => {
      const cmd = raw.trim().toUpperCase();
      if (!cmd || busy || state !== 'ready') return;
      setInput('');
      switch (terminalPolicy(cmd)) {
        case 'block-monitor':
          push({ command: cmd, response: 'İzleme komutları (ATMA, ATMR, ATMT …) desteklenmiyor: adaptörü kilitler.', ok: false });
          return;
        case 'block-write':
          push({ command: cmd, response: 'Otova sadece okuma yapar. Bu servis araca yazar veya test çalıştırır, gönderilmedi.', ok: false });
          return;
        case 'confirm-clear':
          setConfirmCmd(cmd);
          return;
        default:
          void execute(cmd);
      }
    },
    [busy, state, execute, push]
  );

  const onCopy = useCallback(
    async (e: Entry) => {
      const text = `> ${e.command}\n${e.response}`;
      if (await copyText(text)) {
        toast('Kopyalandı', text);
        setFlashId(e.id);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashId(null), 1900);
      }
    },
    [toast]
  );

  const ready = state === 'ready';
  const canSend = ready && !busy && !!input.trim();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <SubHeader
            title="Terminal"
            sub={`İleri düzey · ${adapterVersion ?? 'ELM327'} · son ${history.length}/${MAX_HISTORY} komut`}
          />
          {!ready ? <Text style={styles.notice}>Komut göndermek için önce Bağlantı ayarlarından bağlan.</Text> : null}

          <ScrollView
            ref={scrollRef}
            style={styles.log}
            contentContainerStyle={styles.logContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {history.length === 0 ? <Text style={styles.empty}>Henüz komut göndermedin.</Text> : null}
            {history.map((e, i) => {
              const flashed = flashId === e.id;
              return (
                <View key={e.id} style={[styles.entry, i > 0 && styles.entryBorder]}>
                  <View style={styles.entryHead}>
                    <Text style={styles.prompt}>&gt;</Text>
                    <Text style={styles.cmd}>{e.command}</Text>
                    <Text style={styles.ts}>{e.ts}</Text>
                    <Pressable onPress={() => void onCopy(e)} hitSlop={6}>
                      <Text style={[styles.copyBtn, { color: flashed ? colors.ok : colors.blue }]}>
                        {flashed ? 'Kopyalandı' : 'Bunu kopyala'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.resp, !e.ok && { color: colors.error }]} selectable>
                    {e.response}
                  </Text>
                </View>
              );
            })}
            {busy ? <ActivityIndicator color={colors.blue} style={{ marginVertical: 10 }} /> : null}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
            {QUICK_COMMANDS.map((c) => (
              <Pressable
                key={c}
                onPress={() => submit(c)}
                disabled={!ready || busy}
                style={({ pressed }) => [styles.quick, (!ready || busy) && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.quickText}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.inputRow}>
            <View style={styles.inputBox}>
              <Text style={styles.inputPrompt}>&gt;</Text>
              <TextInput
                value={input}
                onChangeText={(v) => setInput(v.toUpperCase())}
                placeholder="AT veya OBD komutu"
                placeholderTextColor={colors.faint}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                keyboardType="ascii-capable"
                returnKeyType="send"
                onSubmitEditing={() => submit(input)}
                editable={ready}
                style={styles.input}
              />
            </View>
            <Pressable onPress={() => submit(input)} disabled={!canSend} style={[styles.send, !canSend && { opacity: 0.5 }]}>
              <Icon name="arrowUp" size={16} color="#fff" stroke={2} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={confirmCmd != null}
        title="Kodlar silinsin mi?"
        body={CLEAR_BODY}
        note="Hazırlık monitörleri de sıfırlanır; muayeneden önce birkaç gün normal sürüş gerekir. Kalıcı kodlar silinmez."
        confirmLabel="Kodları sil"
        onCancel={() => setConfirmCmd(null)}
        onConfirm={() => {
          const cmd = confirmCmd;
          setConfirmCmd(null);
          if (cmd) void execute(cmd);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 12 },
  notice: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 8 },
  log: {
    flex: 1,
    marginTop: 12,
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
  },
  logContent: { paddingHorizontal: 14, paddingVertical: 4 },
  empty: { color: colors.faint, fontFamily: fonts.body, fontSize: 13, paddingVertical: 14 },
  entry: { paddingVertical: 10 },
  entryBorder: { borderTopWidth: 1, borderTopColor: '#1f1c19' },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prompt: { color: colors.faint, fontFamily: fonts.monoMedium, fontSize: 13 },
  cmd: { color: colors.text, fontFamily: fonts.monoMedium, fontSize: 13, flex: 1 },
  ts: { color: colors.faint, fontFamily: fonts.mono, fontSize: 11 },
  copyBtn: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  resp: { color: colors.amber, fontFamily: fonts.mono, fontSize: 12.5, lineHeight: 19, marginTop: 5, marginLeft: 16 },
  quickRow: { flexGrow: 0, marginTop: 10 },
  quick: { height: 30, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: '#171513', justifyContent: 'center' },
  quickText: { color: colors.text2, fontFamily: fonts.monoMedium, fontSize: 12 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: '#171513',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
  },
  inputPrompt: { color: colors.faint, fontFamily: fonts.monoMedium, fontSize: 14 },
  input: { flex: 1, color: colors.text, fontFamily: fonts.monoMedium, fontSize: 14, paddingVertical: 0 },
  send: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
});

export default function TerminalScreen() {
  const { isPro } = usePro();
  if (!isPro)
    return (
      <ProLocked
        title="Terminal"
        body="ELM327 adaptörüne doğrudan AT ve OBD komutu gönder, ham cevabı gör ve kopyala. İleri düzey kullanıcılar için."
        feature="terminal"
      />
    );
  return <TerminalScreenInner />;
}

/** Shown instead of the feature for free users. */
function ProLocked({ title, body, feature }: { title: string; body: string; feature: ProFeature }) {
  const gate = useProGate();
  return (
    <Screen>
      <SubHeader title={title} />
      <Card hero style={lockStyles.card}>
        <View style={lockStyles.tag}>
          <Text style={lockStyles.tagText}>Pro</Text>
        </View>
        <Text style={lockStyles.body}>{body}</Text>
        <Button label="Pro'ya geç" onPress={() => gate(feature)} style={{ marginTop: 16 }} />
      </Card>
    </Screen>
  );
}

const lockStyles = StyleSheet.create({
  card: { marginTop: 18, padding: 20 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.amberBg },
  tagText: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
  body: { color: colors.text2, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 12 },
});
