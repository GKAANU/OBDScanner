import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Icon } from '../../src/ui/icons';
import { useOBD } from '../../src/obd/context';
import { usePro, useProGate } from '../../src/pro/entitlement';
import { PID_BY_ID, PID_REGISTRY, type PIDDef, type PIDGroup } from '../../src/obd/pid-registry';
import { Copyable, useCopy } from '../../src/ui/copy';
import {
  Arc,
  Button,
  Card,
  LinkButton,
  PillButton,
  Screen,
  ScreenTitle,
  Sheet,
  Sparkline,
  Toggle,
} from '../../src/ui/primitives';
import { colors, fonts, tabular } from '../../src/ui/theme';
import { formatLiveSnapshot, formatThousands, formatValue } from '../../src/utils/format';

type RowState = {
  value: number | string | null;
  raw: string | null;
  min: number | null;
  max: number | null;
  hist: number[];
  unsupported?: boolean;
};

const HIST = 24;

const GAUGES: Array<{ id: string; label: string; min: number; max: number; color: string }> = [
  { id: 'RPM', label: 'Devir', min: 0, max: 7000, color: colors.amber },
  { id: 'SPD', label: 'Hız', min: 0, max: 200, color: colors.amber },
  { id: 'ECT', label: 'Soğutma', min: 40, max: 130, color: colors.ok },
];
const GAUGE_IDS = GAUGES.map((g) => g.id);

const GROUP_LABEL: Record<PIDGroup, string> = {
  engine: 'Motor',
  fuel: 'Yakıt',
  emissions: 'Emisyon',
  electrical: 'Elektrik',
  o2: 'O2 sensörleri',
};

/** Display text for a live value: RPM-like integers get thousands dots. */
function show(v: number | string | null): string {
  if (typeof v === 'number' && Math.abs(v) >= 1000) return formatThousands(v);
  return formatValue(v);
}

export default function CanliScreen() {
  const { state, client, selectedLivePids, setSelectedLivePids, connect, config } = useOBD();
  const connected = state === 'ready';
  const copy = useCopy();
  const { isPro } = usePro();
  const gate = useProGate();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [rawOpen, setRawOpen] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [perPidMs, setPerPidMs] = useState<number | null>(null);

  // Free: the three gauges only. Pro: gauges + selected sensors.
  const sensorIds = useMemo(
    () => (isPro ? selectedLivePids.filter((id) => !GAUGE_IDS.includes(id) && PID_BY_ID[id]) : []),
    [selectedLivePids, isPro]
  );
  const pollIds = useMemo(() => [...GAUGE_IDS, ...sensorIds], [sensorIds]);

  // Each started loop owns a generation number; bumping genRef stops it.
  const genRef = useRef(0);
  const focusedRef = useRef(false);
  const idsRef = useRef<string[]>(pollIds);
  const stateRef = useRef(state);
  idsRef.current = pollIds;
  stateRef.current = state;

  // Drop rows that are no longer polled (min/max reset when re-added).
  useEffect(() => {
    setRows((prev) => {
      const next: Record<string, RowState> = {};
      for (const id of pollIds) if (prev[id]) next[id] = prev[id];
      return next;
    });
  }, [pollIds]);

  const stopPolling = useCallback(() => {
    genRef.current++;
  }, []);

  const startPolling = useCallback(() => {
    const gen = ++genRef.current;
    const alive = () => genRef.current === gen && focusedRef.current && stateRef.current === 'ready';
    void (async () => {
      while (alive()) {
        const ids = idsRef.current;
        const t0 = Date.now();
        let reads = 0;
        for (const id of ids) {
          if (!alive()) return;
          if (!idsRef.current.includes(id)) continue;
          try {
            const reading = await client.readPid(id);
            reads++;
            if (!alive()) return;
            const raw = reading.raw.trim().replace(/\s+/g, ' ');
            if (reading.status === 'unsupported') {
              setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? blank()), value: null, raw, unsupported: true } }));
              continue;
            }
            const parsed = reading.status === 'ok' ? reading.value : null;
            setRows((prev) => {
              const cur = prev[id] ?? blank();
              const num = typeof parsed === 'number' ? parsed : null;
              return {
                ...prev,
                [id]: {
                  value: parsed,
                  raw,
                  min: num != null ? (cur.min == null ? num : Math.min(cur.min, num)) : cur.min,
                  max: num != null ? (cur.max == null ? num : Math.max(cur.max, num)) : cur.max,
                  hist: num != null ? [...cur.hist, num].slice(-HIST) : cur.hist,
                  unsupported: false,
                },
              };
            });
          } catch {
            // Keep the last value; back off so a dead link does not spin.
            await delay(250);
          }
        }
        const dt = Date.now() - t0;
        if (reads > 0 && dt > 0) {
          setRate(1000 / dt);
          setPerPidMs(dt / reads);
        }
        // Tiny breathing room so the JS thread can paint.
        await delay(40);
      }
    })();
  }, [client]);

  // Pause on blur, resume on focus (no background timers).
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (stateRef.current === 'ready') startPolling();
      return () => {
        focusedRef.current = false;
        stopPolling();
      };
    }, [startPolling, stopPolling])
  );

  useEffect(() => {
    if (state === 'ready' && focusedRef.current) startPolling();
    else stopPolling();
  }, [state, startPolling, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const snapshotText = useMemo(
    () =>
      formatLiveSnapshot(
        pollIds
          .map((id) => PID_BY_ID[id])
          .filter((d): d is PIDDef => !!d)
          .map((def) => ({ label: def.label, value: rows[def.id]?.value ?? null, unit: def.unit }))
      ),
    [pollIds, rows]
  );

  const togglePid = (id: string) => {
    if (selectedLivePids.includes(id)) setSelectedLivePids(selectedLivePids.filter((x) => x !== id));
    else setSelectedLivePids([...selectedLivePids, id]);
  };

  const hzEstimate = perPidMs ? 1000 / (perPidMs * Math.max(1, pollIds.length)) : null;
  const sub = connected
    ? `${config.demo ? 'Demo · ' : ''}${rate ? `Saniyede ${rate.toFixed(1).replace('.', ',')} kez güncelleniyor` : 'Okunuyor…'}`
    : 'Bağlı değil';

  const pickGroups = useMemo(() => {
    const map = new Map<PIDGroup, PIDDef[]>();
    for (const p of PID_REGISTRY) {
      if (GAUGE_IDS.includes(p.id)) continue;
      const arr = map.get(p.group) ?? [];
      arr.push(p);
      map.set(p.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <Screen>
      <ScreenTitle
        title="Canlı"
        sub={
          <View style={s.subRow}>
            <View style={[s.dot, { backgroundColor: connected ? colors.ok : colors.faint }]} />
            <Text style={s.subText}>{sub}</Text>
          </View>
        }
        right={<PillButton label="Sensör seç" icon="sliders" onPress={() => gate('live-all', () => setPickerOpen(true))} />}
      />

      {!connected ? (
        <Card hero style={s.offCard}>
          <Text style={s.offTitle}>Canlı veri için dongle'ı bağla</Text>
          <Text style={s.offBody}>Bağlıyken devir, hız, sıcaklık ve diğer sensörler saniyede birkaç kez güncellenir.</Text>
          <Button label="Bağlan" onPress={() => router.push('/baglan')} style={s.offBtn} />
          <View style={{ marginTop: 14 }}>
            <LinkButton label="Demo modunu dene" onPress={() => void connect({ demo: true })} />
          </View>
        </Card>
      ) : (
        <>
          <Card hero style={s.gaugeCard}>
            {GAUGES.map((g) => {
              const def = PID_BY_ID[g.id];
              const r = rows[g.id];
              const num = typeof r?.value === 'number' ? r.value : null;
              const p = num != null ? (num - g.min) / (g.max - g.min) : 0;
              return (
                <Copyable
                  key={g.id}
                  text={() => `${def.label}: ${formatValue(rows[g.id]?.value ?? null, def.unit)}`}
                  style={s.gauge}
                  line="none"
                >
                  {(flashed) => (
                    <>
                      <Arc value={p} color={g.color}>
                        <Text style={[s.gaugeVal, tabular]}>{r?.unsupported ? '—' : show(r?.value ?? null)}</Text>
                        <Text style={s.gaugeUnit}>{def.unit}</Text>
                      </Arc>
                      <Text style={[s.gaugeLabel, flashed && { color: colors.ok }]}>{flashed ? 'Kopyalandı' : g.label}</Text>
                    </>
                  )}
                </Copyable>
              );
            })}
          </Card>

          {!isPro ? <LockedSensors onUpgrade={() => gate('live-all')} /> : null}

          <View style={s.grid}>
            {sensorIds.map((id) => {
              const def = PID_BY_ID[id];
              const r = rows[id] ?? blank();
              const open = !!rawOpen[id];
              return (
                <Copyable
                  key={id}
                  text={() => {
                    const cur = rows[id];
                    return `${def.label}: ${formatValue(cur?.value ?? null, def.unit)} (PID ${def.pid}${cur?.raw ? `, ham ${cur.raw}` : ''})`;
                  }}
                  style={s.sensor}
                  restColor={colors.card}
                >
                  <View style={s.sensorHead}>
                    <Text style={s.sensorLabel} numberOfLines={1}>
                      {def.label}
                    </Text>
                    <Pressable hitSlop={8} onPress={() => setRawOpen((o) => ({ ...o, [id]: !o[id] }))}>
                      <Text style={[s.hex, { color: open ? colors.amber : colors.faint }]}>HEX</Text>
                    </Pressable>
                  </View>
                  <View style={s.valRow}>
                    <Text style={[s.sensorVal, tabular, r.unsupported && { color: colors.faint }]} numberOfLines={1}>
                      {r.unsupported ? '—' : show(r.value)}
                    </Text>
                    <Text style={s.sensorUnit}>{r.unsupported ? '' : def.unit}</Text>
                  </View>
                  {r.unsupported ? (
                    <Text style={s.unsup}>Desteklenmiyor</Text>
                  ) : (
                    <>
                      <View style={{ marginTop: 8 }}>
                        <Sparkline values={r.hist} />
                      </View>
                      <View style={s.minmax}>
                        <Text style={[s.mm, tabular]}>min {r.min != null ? show(r.min) : '—'}</Text>
                        <Text style={[s.mm, tabular]}>max {r.max != null ? show(r.max) : '—'}</Text>
                      </View>
                    </>
                  )}
                  {open ? (
                    <View style={s.rawBox}>
                      <Text style={s.rawText} numberOfLines={1}>
                        01 {def.pid} → {r.raw ?? '…'}
                      </Text>
                    </View>
                  ) : null}
                </Copyable>
              );
            })}
          </View>

          <Button
            label="Tümünü kopyala"
            variant="secondary"
            icon="copy"
            onPress={() => void copy(snapshotText, 'Canlı veri kopyalandı')}
            style={{ marginTop: 14 }}
          />
        </>
      )}

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} tall>
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>Sensör seç</Text>
          <LinkButton label="Tamam" onPress={() => setPickerOpen(false)} />
        </View>
        <Text style={s.sheetHint}>
          Daha az sensör seçersen her değer daha sık yenilenir.
          {hzEstimate ? ` Şu an her sensör ≈ ${hzEstimate.toFixed(1).replace('.', ',')} Hz.` : ''} Devir, hız ve soğutma her zaman okunur.
        </Text>
        {pickGroups.map(([group, defs]) => (
          <View key={group} style={{ marginBottom: 14 }}>
            <Text style={s.pickGroup}>{GROUP_LABEL[group]}</Text>
            <View style={s.pickList}>
              {defs.map((p, i) => {
                const on = selectedLivePids.includes(p.id);
                const unsupported = !!rows[p.id]?.unsupported;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => togglePid(p.id)}
                    style={[s.pickRow, i > 0 && s.pickBorder, unsupported && { opacity: 0.45 }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.pickLabel}>{p.label}</Text>
                      <Text style={s.pickNote}>{unsupported ? 'Araç desteklemiyor' : `${p.unit} · PID ${p.pid}`}</Text>
                    </View>
                    <Toggle on={on} onChange={() => togglePid(p.id)} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

/** Sample cards shown behind the blur for free users (made-up values, nothing is polled). */
const TEASER: Array<{ id: string; value: string; hist: number[] }> = [
  { id: 'STFT1', value: '-1,6', hist: [2, 1, 3, 0, -1, 1, -2, -1, 0, -2, -1, -1.6] },
  { id: 'LTFT1', value: '3,1', hist: [3, 3.1, 2.9, 3, 3.2, 3.1, 3, 3.1, 3.2, 3, 3.1, 3.1] },
  { id: 'MAF', value: '4,8', hist: [4, 4.2, 6, 9, 7, 5, 4.6, 4.9, 8, 6, 5, 4.8] },
  { id: 'MAP', value: '34', hist: [30, 32, 45, 60, 52, 40, 35, 33, 48, 41, 36, 34] },
  { id: 'CMV', value: '14,2', hist: [14.1, 14.2, 14.2, 14.1, 14.3, 14.2, 14.2, 14.1, 14.2, 14.2, 14.3, 14.2] },
  { id: 'OILT', value: '92', hist: [70, 74, 78, 81, 84, 86, 88, 89, 90, 91, 92, 92] },
];

/** Free plan: the sensor grid is visible but blurred, with an upgrade prompt on top. */
function LockedSensors({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <View style={s.locked}>
      <View style={s.grid} pointerEvents="none">
        {TEASER.filter((t) => PID_BY_ID[t.id]).map((t) => {
          const def = PID_BY_ID[t.id];
          return (
            <View key={t.id} style={[s.sensor, { backgroundColor: colors.card }]}>
              <View style={s.sensorHead}>
                <Text style={s.sensorLabel} numberOfLines={1}>
                  {def.label}
                </Text>
                <Text style={[s.hex, { color: colors.faint }]}>HEX</Text>
              </View>
              <View style={s.valRow}>
                <Text style={[s.sensorVal, tabular]}>{t.value}</Text>
                <Text style={s.sensorUnit}>{def.unit}</Text>
              </View>
              <View style={{ marginTop: 8 }}>
                <Sparkline values={t.hist} />
              </View>
            </View>
          );
        })}
      </View>
      <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={s.lockOverlay}>
        <View style={s.lockBadge}>
          <Icon name="lock" size={20} color={colors.amber} />
        </View>
        <Text style={s.offTitle}>Tüm sensörler Pro'da</Text>
        <Text style={s.offBody}>
          Yakıt karışımı, hava akışı, şarj voltajı, yağ sıcaklığı ve 25'ten fazla sensör; her biri grafik, min/max ve HEX ile.
        </Text>
        <Button label="Pro'ya geç" onPress={onUpgrade} style={s.offBtn} />
      </View>
    </View>
  );
}

function blank(): RowState {
  return { value: null, raw: null, min: null, max: null, hist: [] };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const s = StyleSheet.create({
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  subText: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  offCard: { marginTop: 20, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center' },
  offTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17, textAlign: 'center' },
  offBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6 },
  offBtn: { marginTop: 16, height: 44, paddingHorizontal: 22, alignSelf: 'center' },
  gaugeCard: { marginTop: 16, paddingTop: 16, paddingBottom: 14, paddingHorizontal: 8, flexDirection: 'row' },
  gauge: { flex: 1, alignItems: 'center', borderRadius: 14, paddingTop: 4, paddingBottom: 2 },
  gaugeVal: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 22, letterSpacing: -0.6 },
  gaugeUnit: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 11, marginTop: 2 },
  gaugeLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  locked: { marginTop: 0, borderRadius: 20, overflow: 'hidden' },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(12,11,10,0.35)',
  },
  lockBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sensor: {
    width: '48.8%',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  sensorHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  sensorLabel: { flex: 1, color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  hex: { fontFamily: fonts.monoMedium, fontSize: 10 },
  valRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 },
  sensorVal: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 24, letterSpacing: -0.7, flexShrink: 1 },
  sensorUnit: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  unsup: { color: colors.faint, fontFamily: fonts.body, fontSize: 11.5, marginTop: 8 },
  minmax: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  mm: { color: colors.faint, fontFamily: fonts.body, fontSize: 11 },
  rawBox: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.bg },
  rawText: { color: colors.text2, fontFamily: fonts.mono, fontSize: 11 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 22, letterSpacing: -0.4 },
  sheetHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19.5, marginTop: 6, marginBottom: 14 },
  pickGroup: { color: colors.faint, fontFamily: fonts.bodyMedium, fontSize: 12, marginBottom: 8, marginLeft: 4 },
  pickList: { backgroundColor: colors.sheetInner, borderRadius: 16, overflow: 'hidden' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  pickBorder: { borderTopWidth: 1, borderTopColor: colors.line2 },
  pickLabel: { color: colors.text, fontFamily: fonts.body, fontSize: 15 },
  pickNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 1 },
});
