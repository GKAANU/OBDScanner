import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { StatusBar as ConnStatusBar } from '../src/ui/StatusBar';
import { CopyButton } from '../src/ui/CopyButton';
import { PidRow } from '../src/ui/PidRow';
import { useOBD } from '../src/obd/context';
import {
  PID_REGISTRY,
  PID_BY_ID,
  parsePidResponse,
  type PIDDef,
} from '../src/obd/pid-registry';
import { detectOBDError } from '../src/obd/parsers';
import { colors, fonts, fontSize, radius, spacing } from '../src/ui/theme';
import { formatLiveSnapshot } from '../src/utils/format';

type RowState = {
  value: number | string | null;
  rawHex: string | null;
  min: number | null;
  max: number | null;
  unsupported?: boolean;
};

export default function LiveScreen() {
  const { state, client, selectedLivePids, setSelectedLivePids } = useOBD();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const pollingRef = useRef(false);
  const focusedRef = useRef(false);

  // Reset min/max for newly selected pids.
  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      for (const id of selectedLivePids) {
        if (!next[id]) next[id] = { value: null, rawHex: null, min: null, max: null };
      }
      // Drop deselected.
      for (const id of Object.keys(next)) {
        if (!selectedLivePids.includes(id)) delete next[id];
      }
      return next;
    });
  }, [selectedLivePids]);

  const startPolling = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    while (pollingRef.current && focusedRef.current && state === 'ready') {
      const ids = selectedLivePids;
      if (ids.length === 0) {
        await delay(200);
        continue;
      }
      for (const id of ids) {
        if (!pollingRef.current || !focusedRef.current) break;
        const def = PID_BY_ID[id];
        if (!def) continue;
        try {
          const raw = await client.livePid(def.pid);
          const err = detectOBDError(raw);
          if (err === 'NO_DATA' || err === 'UNKNOWN_COMMAND') {
            setRows((prev) => ({
              ...prev,
              [id]: { ...(prev[id] ?? blank()), value: null, unsupported: true, rawHex: raw.trim() },
            }));
            continue;
          }
          const parsed = parsePidResponse(def, raw);
          setRows((prev) => {
            const cur = prev[id] ?? blank();
            const num = typeof parsed === 'number' ? parsed : null;
            const min = num != null ? (cur.min == null ? num : Math.min(cur.min, num)) : cur.min;
            const max = num != null ? (cur.max == null ? num : Math.max(cur.max, num)) : cur.max;
            return {
              ...prev,
              [id]: {
                value: parsed,
                rawHex: raw.trim().replace(/\s+/g, ' '),
                min,
                max,
                unsupported: false,
              },
            };
          });
        } catch {
          // Skip on error; keep last value.
        }
      }
      // Tiny breathing room so the JS thread can paint.
      await delay(40);
    }
    pollingRef.current = false;
  }, [client, selectedLivePids, state]);

  // Pause on blur, resume on focus (per CLAUDE.md §9: no background timers).
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (state === 'ready') void startPolling();
      return () => {
        focusedRef.current = false;
        pollingRef.current = false;
      };
    }, [startPolling, state])
  );

  // Re-kick polling when state flips to ready.
  useEffect(() => {
    if (state === 'ready' && focusedRef.current) {
      void startPolling();
    } else {
      pollingRef.current = false;
    }
  }, [state, startPolling]);

  const snapshotText = useMemo(() => {
    const items = selectedLivePids
      .map((id) => {
        const def = PID_BY_ID[id];
        const r = rows[id];
        if (!def) return null;
        return { label: def.label, value: r?.value ?? null, unit: def.unit };
      })
      .filter(Boolean) as Array<{ label: string; value: number | string | null; unit: string }>;
    return formatLiveSnapshot(items);
  }, [rows, selectedLivePids]);

  const togglePid = (id: string) => {
    if (selectedLivePids.includes(id)) {
      setSelectedLivePids(selectedLivePids.filter((x) => x !== id));
    } else {
      setSelectedLivePids([...selectedLivePids, id]);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ConnStatusBar />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Canlı</Text>
            <Text style={styles.sub}>
              Seçili PID’ler sırayla okunur. Bir değere uzun bas → kopyala.
            </Text>
          </View>
        </View>

        {state !== 'ready' ? (
          <Text style={styles.notice}>Önce Tanı sekmesinden bağlan.</Text>
        ) : selectedLivePids.length === 0 ? (
          <Text style={styles.notice}>PID seçilmedi. Aşağıdan ekle.</Text>
        ) : null}

        <View style={styles.actionsRow}>
          <Pressable onPress={() => setPickerOpen(true)} style={styles.pickBtn}>
            <Text style={styles.pickBtnLabel}>PID seç</Text>
          </Pressable>
          <CopyButton text={snapshotText} label="Tümünü kopyala" variant="ghost" />
        </View>

        <View style={{ gap: spacing.s }}>
          {selectedLivePids.map((id) => {
            const def = PID_BY_ID[id];
            if (!def) return null;
            const r = rows[id] ?? blank();
            return (
              <PidRow
                key={id}
                def={def}
                value={r.unsupported ? 'desteklenmiyor' : r.value}
                rawHex={r.rawHex ?? undefined}
                min={r.min ?? undefined}
                max={r.max ?? undefined}
              />
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Hangi PID’ler okunsun</Text>
              <Pressable onPress={() => setPickerOpen(false)}>
                <Text style={styles.sheetClose}>Kapat</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              {groupBy(PID_REGISTRY, 'group').map((group) => (
                <View key={group.label} style={{ marginBottom: spacing.m }}>
                  <Text style={styles.groupTitle}>{groupLabelTR(group.label)}</Text>
                  {group.items.map((p) => (
                    <View key={p.id} style={styles.pickRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickLabel}>{p.label}</Text>
                        <Text style={styles.pickMeta}>
                          PID {p.pid} · {p.unit}
                        </Text>
                      </View>
                      <Switch
                        value={selectedLivePids.includes(p.id)}
                        onValueChange={() => togglePid(p.id)}
                        thumbColor={selectedLivePids.includes(p.id) ? colors.accent : '#666'}
                        trackColor={{ false: '#333', true: colors.accentSoft }}
                      />
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function blank(): RowState {
  return { value: null, rawHex: null, min: null, max: null };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function groupBy(
  list: PIDDef[],
  key: 'group'
): Array<{ label: string; items: PIDDef[] }> {
  const map = new Map<string, PIDDef[]>();
  for (const p of list) {
    const arr = map.get(p[key]) ?? [];
    arr.push(p);
    map.set(p[key], arr);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function groupLabelTR(g: string): string {
  switch (g) {
    case 'engine':
      return 'Motor';
    case 'fuel':
      return 'Yakıt';
    case 'emissions':
      return 'Emisyon';
    case 'electrical':
      return 'Elektrik';
    case 'o2':
      return 'O2 sensörleri';
    default:
      return g;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.l, gap: spacing.l, paddingBottom: spacing.xxxl },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  h1: {
    color: colors.body,
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.xxxl,
  },
  sub: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
  },
  notice: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    flexWrap: 'wrap',
  },
  pickBtn: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s + 2,
    borderRadius: radius.m,
  },
  pickBtnLabel: {
    color: colors.body,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.s,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    padding: spacing.l,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  sheetTitle: {
    color: colors.body,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xl,
  },
  sheetClose: {
    color: colors.accent,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.m,
  },
  groupTitle: {
    color: colors.muted,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.s,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickLabel: {
    color: colors.body,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
  },
  pickMeta: {
    color: colors.muted,
    fontFamily: 'GeistMono_400Regular',
    fontSize: fontSize.xs,
  },
});
