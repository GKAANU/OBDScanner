import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, fonts, fontSize, radius, spacing } from './theme';
import { useOBD } from '../obd/context';
import { extractDataBytes, PID_BY_HEX } from '../obd/pid-registry';

type Props = {
  code: string;
  /** Two-hex chars of the PID inside the DTC (used for Mode 02 freeze frame). */
  pidHex?: string;
  source: 'stored' | 'pending' | 'permanent';
};

const SOURCE_LABEL: Record<Props['source'], string> = {
  stored: 'Saklanan',
  pending: 'Bekleyen',
  permanent: 'Kalıcı',
};

/**
 * Convert a DTC like "P0420" back into its 2-byte hex form ("0420")
 * for use as Mode 02 freeze-frame PID lookup. Mode 02 frames are keyed
 * by DTC, so we encode the DTC into hex.
 */
function dtcToHex(code: string): string | null {
  if (code.length !== 5) return null;
  const typeChar = code[0];
  const typeBits = { P: 0, C: 1, B: 2, U: 3 }[typeChar as 'P' | 'C' | 'B' | 'U'];
  if (typeBits === undefined) return null;
  const d2 = parseInt(code[1], 10);
  if (isNaN(d2) || d2 < 0 || d2 > 3) return null;
  const d3 = parseInt(code[2], 16);
  if (isNaN(d3)) return null;
  const firstByte = (typeBits << 6) | (d2 << 4) | d3;
  const second = code.substring(3, 5);
  if (!/^[0-9A-Fa-f]{2}$/.test(second)) return null;
  return firstByte.toString(16).toUpperCase().padStart(2, '0') + second.toUpperCase();
}

export function DtcCard({ code, source }: Props) {
  const { client, state } = useOBD();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [frame, setFrame] = useState<Array<{ label: string; value: string; pid: string }> | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);

  const onCopyCode = useCallback(async () => {
    await Clipboard.setStringAsync(code);
  }, [code]);

  const loadFreezeFrame = useCallback(async () => {
    if (state !== 'ready') return;
    const hex = dtcToHex(code);
    if (!hex) return;
    setLoading(true);
    setFrameError(null);
    try {
      // Query a handful of common freeze-frame PIDs. ECU returns whatever was
      // captured at the moment of the fault. Each query is sequential to avoid
      // overlapping commands.
      const probes = ['0C', '0D', '05', '04', '0B', '11', '0F', '10'];
      const results: Array<{ label: string; value: string; pid: string }> = [];
      for (const pid of probes) {
        try {
          const raw = await client.send(`02${pid}${hex.substring(0, 2)}`);
          const def = PID_BY_HEX[pid];
          if (!def) continue;
          const bytes = extractDataBytes(raw, `42${pid}`);
          if (!bytes || bytes.length < def.bytes) continue;
          const v = def.parse(bytes.slice(0, def.bytes));
          results.push({
            label: def.label,
            value: typeof v === 'number' ? `${formatNumber(v)} ${def.unit}` : `${v} ${def.unit}`,
            pid,
          });
        } catch {
          // skip this PID
        }
      }
      setFrame(results);
      if (results.length === 0) {
        setFrameError('Bu DTC için anlık görüntü yok.');
      }
    } catch (e) {
      setFrameError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, code, state]);

  const onToggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && frame === null && !loading) {
      void loadFreezeFrame();
    }
  }, [expanded, frame, loading, loadFreezeFrame]);

  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} onLongPress={onCopyCode} style={styles.header}>
        <View style={styles.codeWrap}>
          <Text style={styles.code}>{code}</Text>
          <Text style={styles.source}>{SOURCE_LABEL[source]}</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.body}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Anlık görüntü okunuyor…</Text>
            </View>
          ) : frameError ? (
            <Text style={styles.frameNote}>{frameError}</Text>
          ) : frame && frame.length > 0 ? (
            frame.map((row) => (
              <View key={row.pid} style={styles.frameRow}>
                <Text style={styles.frameLabel}>{row.label}</Text>
                <Text style={styles.frameValue}>{row.value}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.frameNote}>Anlık görüntü mevcut değil.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function formatNumber(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
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
