import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, fonts, fontSize, radius, spacing } from './theme';
import type { FreezeFrame } from '../obd/client';
import { formatValue } from '../utils/format';

export type FreezeFrameState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; frame: FreezeFrame }
  | { status: 'error'; message: string };

type Props = {
  code: string;
  source: 'stored' | 'pending' | 'permanent';
  /** Freeze frame 00 as read from the ECU (shared by all cards). */
  freezeFrame: FreezeFrameState;
  /** Ask the parent to read freeze frame 00 (no-op if already loaded). */
  onRequestFreezeFrame: () => void;
};

const SOURCE_LABEL: Record<Props['source'], string> = {
  stored: 'Saklanan',
  pending: 'Bekleyen',
  permanent: 'Kalıcı',
};

export function DtcCard({ code, source, freezeFrame, onRequestFreezeFrame }: Props) {
  const [expanded, setExpanded] = useState(false);

  const onCopyCode = useCallback(async () => {
    await Clipboard.setStringAsync(code);
  }, [code]);

  const onToggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && freezeFrame.status === 'idle') onRequestFreezeFrame();
  }, [expanded, freezeFrame.status, onRequestFreezeFrame]);

  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} onLongPress={onCopyCode} style={styles.header}>
        <View style={styles.codeWrap}>
          <Text style={styles.code}>{code}</Text>
          <Text style={styles.source}>{SOURCE_LABEL[source]}</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded ? <View style={styles.body}>{renderFrame(code, freezeFrame)}</View> : null}
    </View>
  );
}

function renderFrame(code: string, ff: FreezeFrameState): React.ReactNode {
  if (ff.status === 'idle' || ff.status === 'loading') {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Anlık görüntü okunuyor…</Text>
      </View>
    );
  }
  if (ff.status === 'error') return <Text style={styles.frameNote}>{ff.message}</Text>;

  const { frame } = ff;
  if (!frame.dtc) return <Text style={styles.frameNote}>ECU’da kayıtlı anlık görüntü yok.</Text>;

  const matches = frame.dtc === code;
  return (
    <>
      <Text style={styles.frameNote}>
        {matches
          ? 'Bu kod kaydedildiği andaki değerler (anlık görüntü 00):'
          : `ECU’daki anlık görüntü ${frame.dtc} koduyla kaydedilmiş, bu koda ait değil. O anki değerler:`}
      </Text>
      {frame.values.length === 0 ? (
        <Text style={styles.frameNote}>Anlık görüntüde okunabilir değer yok.</Text>
      ) : (
        frame.values.map(({ def, value }) => {
          const text = formatValue(value, def.unit);
          return (
            <Pressable
              key={def.id}
              style={styles.frameRow}
              onLongPress={() => {
                void Clipboard.setStringAsync(`${def.label}: ${text}`);
              }}
            >
              <Text style={styles.frameLabel}>{def.label}</Text>
              <Text style={styles.frameValue}>{text}</Text>
            </Pressable>
          );
        })
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
  },
  codeWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.m,
  },
  code: {
    color: colors.value,
    fontFamily: 'GeistMono_600SemiBold',
    fontSize: fontSize.xl,
    letterSpacing: 0.5,
  },
  source: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  chevron: {
    color: colors.muted,
    fontSize: fontSize.l,
  },
  body: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.m,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.m,
    gap: spacing.s,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  loadingText: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  frameNote: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  frameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  frameLabel: {
    color: colors.body,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
    flex: 1,
  },
  frameValue: {
    color: colors.value,
    fontFamily: 'GeistMono_500Medium',
    fontSize: fontSize.m,
  },
});
