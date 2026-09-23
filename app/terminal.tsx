import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { copyText } from '../src/ui/clipboard';
import { StatusBar as ConnStatusBar } from '../src/ui/StatusBar';
import { useOBD } from '../src/obd/context';
import { terminalPolicy, userMessage } from '../src/obd/protocol';
import { colors, fonts, fontSize, radius, spacing } from '../src/ui/theme';

type Entry = {
  id: string;
  command: string;
  response: string;
  ok: boolean;
  ts: string;
};

const MAX_HISTORY = 50;

export default function TerminalScreen() {
  const { state, client } = useOBD();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  const nextId = useRef(0);

  const execute = useCallback(
    async (cmd: string) => {
      setBusy(true);
      const id = `${++nextId.current}`;
      try {
        // Raw terminal: no automatic STOPPED / BUS INIT recovery.
        const raw = await client.send(cmd, { recover: false });
        pushEntry(setHistory, { id, command: cmd, response: raw, ok: true, ts: timeNow() });
      } catch (e) {
        pushEntry(setHistory, { id, command: cmd, response: userMessage(e), ok: false, ts: timeNow() });
      } finally {
        setBusy(false);
      }
    },
    [client]
  );

  const send = useCallback(() => {
    const cmd = input.trim();
    if (!cmd || busy || state !== 'ready') return;
    const reject = (msg: string) =>
      pushEntry(setHistory, { id: `${++nextId.current}`, command: cmd, response: msg, ok: false, ts: timeNow() });

    switch (terminalPolicy(cmd)) {
      case 'block-monitor':
        setInput('');
        reject('İzleme komutları (ATMA, ATMR, ATMT …) desteklenmiyor: adaptörü kilitler.');
        return;
      case 'block-write':
        setInput('');
        reject('Otova sadece okuma yapar. Bu servis araca yazar veya test çalıştırır, gönderilmedi.');
        return;
      case 'confirm-clear':
        Alert.alert(
          'Hata kodlarını sil?',
          'Hata kodlarını silmek arızayı çözmez, sadece lambayı söndürür. Altta yatan sorun sürerse kod tekrar gelecek.',
          [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Sil',
              style: 'destructive',
              onPress: () => {
                setInput('');
                void execute(cmd);
              },
            },
          ]
        );
        return;
      default:
        setInput('');
        void execute(cmd);
    }
  }, [input, busy, state, execute]);

  const onCopyEntry = useCallback(async (e: Entry) => {
    const text = `> ${e.command}\n${e.response}`;
    await copyText(text);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ConnStatusBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.h1}>Terminal</Text>
          <Text style={styles.sub}>
            Serbest AT veya OBD komutu gönder. Sadece okuma servisleri gönderilir; Mode 04 onay ister.
          </Text>

          {state !== 'ready' ? (
            <Text style={styles.notice}>Önce Tanı sekmesinden bağlan.</Text>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="010C, ATRV, 03 …"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType="ascii-capable"
              style={styles.input}
              onSubmitEditing={send}
              editable={state === 'ready' && !busy}
            />
            <Pressable
              onPress={send}
              disabled={busy || state !== 'ready' || !input.trim()}
              style={[
                styles.sendBtn,
                (busy || state !== 'ready' || !input.trim()) && styles.sendBtnDisabled,
              ]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendLabel}>Gönder</Text>}
            </Pressable>
          </View>

          <View style={{ gap: spacing.s }}>
            {history.map((e) => (
              <View key={e.id} style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryCmd}>{e.command}</Text>
                  <Text style={styles.entryTs}>{e.ts}</Text>
                </View>
                <Text style={[styles.entryResp, !e.ok && styles.entryRespErr]}>{e.response}</Text>
                <Pressable onPress={() => void onCopyEntry(e)} style={styles.copyMini}>
                  <Text style={styles.copyMiniLabel}>Bunu kopyala</Text>
                </Pressable>
              </View>
            ))}
            {history.length === 0 ? (
              <Text style={styles.empty}>Henüz komut göndermedin.</Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function timeNow(): string {
  return new Date().toLocaleTimeString('tr-TR');
}

function pushEntry(setter: React.Dispatch<React.SetStateAction<Entry[]>>, e: Entry) {
  setter((prev) => [e, ...prev].slice(0, MAX_HISTORY));
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.l, gap: spacing.l, paddingBottom: spacing.xxxl },
  h1: {
    color: colors.body,
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.xxxl,
  },
  sub: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
    marginTop: -spacing.s,
  },
  notice: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    color: colors.body,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    fontFamily: 'GeistMono_500Medium',
    fontSize: fontSize.l,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: radius.m,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 90,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendLabel: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.m,
  },
  entry: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    padding: spacing.m,
    gap: spacing.s,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryCmd: {
    color: colors.value,
    fontFamily: 'GeistMono_600SemiBold',
    fontSize: fontSize.m,
  },
  entryTs: {
    color: colors.muted,
    fontFamily: 'GeistMono_400Regular',
    fontSize: fontSize.xs,
  },
  entryResp: {
    color: colors.body,
    fontFamily: 'GeistMono_400Regular',
    fontSize: fontSize.s,
  },
  entryRespErr: {
    color: colors.error,
  },
  copyMini: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    backgroundColor: colors.cardElevated,
    borderRadius: radius.s,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyMiniLabel: {
    color: colors.mutedStrong,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
  },
  empty: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
    fontStyle: 'italic',
  },
});
