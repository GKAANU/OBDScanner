import React, { useCallback, useState } from 'react';
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
import * as Clipboard from 'expo-clipboard';
import { StatusBar as ConnStatusBar } from '../src/ui/StatusBar';
import { useOBD } from '../src/obd/context';
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

  const send = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || busy || state !== 'ready') return;
    setBusy(true);
    setInput('');
    try {
      // Raw terminal: no automatic STOPPED / BUS INIT recovery.
      const raw = await client.send(cmd, { recover: false });
      pushEntry(setHistory, {
        id: `${Date.now()}`,
        command: cmd,
        response: raw,
        ok: true,
        ts: new Date().toLocaleTimeString(),
      });
    } catch (e) {
      pushEntry(setHistory, {
        id: `${Date.now()}`,
        command: cmd,
        response: e instanceof Error ? e.message : String(e),
        ok: false,
        ts: new Date().toLocaleTimeString(),
      });
    } finally {
      setBusy(false);
    }
  }, [input, busy, state, client]);

  const onCopyEntry = useCallback(async (e: Entry) => {
    const text = `> ${e.command}\n${e.response}`;
    await Clipboard.setStringAsync(text);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ConnStatusBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.h1}>Terminal</Text>
          <Text style={styles.sub}>
            Serbest AT veya OBD komutu gönder. Sadece okuma; Mode 04 hariç hiçbir komut araca yazmaz.
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
              onSubmitEditing={() => void send()}
              editable={state === 'ready' && !busy}
            />
            <Pressable
              onPress={() => void send()}
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
