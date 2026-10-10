import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useOBD } from '../../src/obd/context';
import { useScan, type ScanResult } from '../../src/obd/useScan';
import { useGarage } from '../../src/garage/store';
import { usePro, useProGate, type ProFeature } from '../../src/pro/entitlement';
import { userMessage } from '../../src/obd/protocol';
import { inspectionVerdict, type Monitor } from '../../src/obd/health';
import { dtcDetail, URGENCY_LABEL, URGENCY_TONE, type DtcDetail } from '../../src/obd/dtc-details';
import type { FreezeFrame } from '../../src/obd/client';
import { Copyable, useCopy } from '../../src/ui/copy';
import { useToast } from '../../src/ui/toast';
import { Icon } from '../../src/ui/icons';
import {
  Button,
  Card,
  Chip,
  ConfirmModal,
  PillButton,
  Ring,
  Screen,
  ScreenTitle,
  Sheet,
} from '../../src/ui/primitives';
import { colors, fonts, tabular, tone } from '../../src/ui/theme';
import { formatFullReport, formatThousands, formatTimestamp, formatValue } from '../../src/utils/format';

type GroupKey = 'stored' | 'pending' | 'permanent';

const GROUPS: Array<{ key: GroupKey; name: string; hint: string; mode: string }> = [
  { key: 'stored', name: 'Kayıtlı', hint: 'Lambayı yakan kodlar', mode: 'Mode 03' },
  { key: 'pending', name: 'Bekleyen', hint: 'Henüz onaylanmamış', mode: 'Mode 07' },
  { key: 'permanent', name: 'Kalıcı', hint: 'Onarım doğrulanınca kalkar', mode: 'Mode 0A' },
];

/** What the results view shows: this session's scan, or the saved summary. */
type View_ = {
  at: string;
  stored: string[];
  pending: string[];
  permanent: string[];
  milOn: boolean | null;
  monitors: Monitor[];
  freezeFrame: FreezeFrame | null;
  live: boolean;
};

function scanTimeText(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Bugün ${hm}`;
  if (diff === 1) return `Dün ${hm}`;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${hm}`;
}

function ffText(ff: FreezeFrame): string {
  return ff.values.map(({ def, value }) => `${def.label} ${formatValue(value, def.unit)}`).join('; ');
}

export default function TaniScreen() {
  const { state, client, protocolName, battery } = useOBD();
  const { lastScan, vehicle } = useGarage();
  const { scan, scanning, progress, step, result, error } = useScan();
  const copy = useCopy();
  const toast = useToast();
  const { isPro } = usePro();
  const gate = useProGate();
  const connected = state === 'ready';

  const [showSaved, setShowSaved] = useState(false);
  const [detail, setDetail] = useState<{ code: string; groups: string[] } | null>(null);
  const [techOpen, setTechOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Auto-scan once per connection, when the tab is focused.
  const autoRef = useRef(false);
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!connected) autoRef.current = false;
  }, [connected]);
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (connected && !autoRef.current) {
        autoRef.current = true;
        void scan();
      }
      return () => {
        focusedRef.current = false;
      };
    }, [connected, scan])
  );

  const view: View_ | null = useMemo(() => {
    if (result) return fromResult(result);
    if (showSaved && lastScan)
      return {
        at: lastScan.at,
        stored: lastScan.stored,
        pending: lastScan.pending,
        permanent: lastScan.permanent,
        milOn: lastScan.milOn,
        monitors: lastScan.monitors,
        freezeFrame: null,
        live: false,
      };
    return null;
  }, [result, showSaved, lastScan]);

  const showResults = !!view && !scanning;

  const sub = scanning
    ? 'Taranıyor…'
    : view
      ? `${scanTimeText(view.at)} · ${connected ? 'bağlı' : 'son tarama'}`
      : connected
        ? 'Hazır'
        : 'Dongle bağlı değil';

  const startScan = useCallback(() => {
    if (!connected) {
      router.push('/baglan');
      return;
    }
    void scan();
  }, [connected, scan]);

  const issues = view ? view.stored.length + view.pending.length : 0;
  const permanentCount = view ? view.permanent.length : 0;
  const milOn = view ? (view.milOn ?? view.stored.length > 0) : false;
  const verdict = view ? inspectionVerdict({ milOn, monitors: view.monitors, battery }) : null;

  const groupsOf = useCallback(
    (code: string): string[] => (view ? GROUPS.filter((g) => view[g.key].includes(code)).map((g) => g.name) : []),
    [view]
  );

  const resultsText = useMemo(() => {
    if (!view) return '';
    const lines = [`Otova tanı sonuçları — ${scanTimeText(view.at)}`];
    for (const g of GROUPS) {
      const list = view[g.key];
      lines.push(`${g.name}: ${list.length ? list.map((c) => `${c} ${dtcDetail(c).title}`).join(', ') : 'yok'}`);
    }
    const sup = view.monitors.filter((m) => m.supported);
    lines.push(`MIL: ${milOn ? 'açık' : 'kapalı'} · Monitörler: ${sup.filter((m) => m.ready).length}/${sup.length} hazır`);
    if (verdict) lines.push(`Muayene (OBD): ${verdict.pass ? 'geçer' : 'geçmez'}`);
    return lines.join('\n');
  }, [view, milOn, verdict]);

  const buildReport = useCallback(async (): Promise<string> => {
    if (!view) return '';
    let vehicleInfo;
    if (connected) {
      try {
        vehicleInfo = await client.readVehicleInfo();
      } catch {}
    }
    const ff = view.freezeFrame;
    const header = [
      `Otova tam rapor — ${formatTimestamp()}`,
      vehicle ? `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ''} · ${vehicle.fuel} · ${formatThousands(vehicle.km)} km` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const base = formatFullReport({
      header,
      vehicle: vehicleInfo,
      protocol: protocolName,
      battery,
      stored: view.stored,
      pending: view.pending,
      permanent: view.permanent,
      freezeFrame: ff?.dtc
        ? { dtc: ff.dtc, rows: ff.values.map(({ def, value }) => ({ label: def.label, value, unit: def.unit })) }
        : undefined,
      readiness: view.monitors,
    });
    const codes = Array.from(new Set([...view.stored, ...view.pending, ...view.permanent]));
    if (codes.length === 0) return base;
    const desc = codes.map((c) => {
      const d = dtcDetail(c);
      return `  ${c}: ${d.title} (${URGENCY_LABEL[d.urgency]}). Sürmeye devam: ${d.drive}`;
    });
    return `${base}\n\nKod açıklamaları\n${desc.join('\n')}`;
  }, [view, connected, client, protocolName, battery, vehicle]);

  const onCopyReport = useCallback(async () => {
    setReportBusy(true);
    try {
      await copy(await buildReport(), 'Rapor kopyalandı');
    } finally {
      setReportBusy(false);
    }
  }, [buildReport, copy]);

  const onConfirmClear = useCallback(async () => {
    setClearing(true);
    setActionError(null);
    try {
      await client.clearDTCs();
      setConfirm(false);
      toast('Kodlar silindi', 'MIL söndü · kalıcı kod kalır', 2200);
      void scan();
    } catch (e) {
      setConfirm(false);
      setActionError(userMessage(e));
    } finally {
      setClearing(false);
    }
  }, [client, toast, scan]);

  const d: DtcDetail | null = detail ? dtcDetail(detail.code) : null;

  /** The one code a free user can open in full (stored -> pending -> permanent order). */
  const freeCode = view ? ([...view.stored, ...view.pending, ...view.permanent][0] ?? null) : null;

  const gateFromSheet = useCallback(
    (feature: ProFeature) => {
      setDetail(null);
      setTimeout(() => gate(feature), 350);
    },
    [gate]
  );

  return (
    <Screen
      refreshControl={
        connected ? <RefreshControl refreshing={false} onRefresh={() => void scan()} tintColor={colors.blue} /> : undefined
      }
    >
      <ScreenTitle
        title="Tanı"
        sub={sub}
        right={showResults && connected ? <PillButton label="Yeniden tara" icon="refresh" onPress={startScan} /> : undefined}
      />

      {!showResults ? (
        <>
          <ScanDial connected={connected} scanning={scanning} progress={progress} onPress={startScan} />
          <Text style={s.scanText}>
            {scanning
              ? `${step ?? 'Okunuyor'}…`
              : connected
                ? 'Arıza kodları, hazırlık monitörleri ve kod anındaki değerler okunur.'
                : 'Tarama için dongle bağlı olmalı. Bakım ve belgeler bağlantısız da çalışır.'}
          </Text>
          {!scanning && lastScan ? (
            <Card style={s.lastCard} onPress={() => setShowSaved(true)}>
              <View style={s.lastRow}>
                <View
                  style={[
                    s.lastDot,
                    { backgroundColor: lastScan.stored.length + lastScan.pending.length ? colors.warn : colors.ok },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.lastTitle}>Son tarama</Text>
                  <Text style={s.lastSub}>
                    {scanTimeText(lastScan.at)} · {lastScanLine(lastScan.stored, lastScan.pending, lastScan.permanent)}
                  </Text>
                </View>
                <Text style={s.link}>Gör</Text>
              </View>
            </Card>
          ) : null}
        </>
      ) : null}

      {error ? <Text style={s.error}>{error}</Text> : null}
      {actionError ? <Text style={s.error}>{actionError}</Text> : null}

      {showResults && view ? (
        <>
          <Card hero style={s.heroCard}>
            <View style={s.summaryRow}>
              <View style={[s.iconTile, { backgroundColor: issues || permanentCount ? colors.warnBg : colors.okBg }]}>
                <Icon
                  name={issues || permanentCount ? 'warn' : 'check'}
                  size={20}
                  color={issues || permanentCount ? colors.warn : colors.ok}
                  stroke={1.8}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.summaryTitle}>{issues ? `${issues} konu dikkat istiyor` : 'Arıza kodu yok'}</Text>
                <Text style={s.summarySub}>
                  {issues
                    ? `${view.stored.length} kayıtlı, ${view.pending.length} bekleyen, ${view.permanent.length} kalıcı kod`
                    : permanentCount
                      ? 'Kalıcı kod onarım doğrulanana kadar listede kalır.'
                      : 'Kayıtlı, bekleyen ve kalıcı kod yok. MIL kapalı.'}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => void copy(resultsText, 'Sonuçlar kopyalandı')}
              style={({ pressed }) => [s.insetBtn, pressed && { opacity: 0.75 }]}
            >
              <Icon name="copy" size={14} color={colors.text} stroke={1.7} />
              <Text style={s.insetBtnText}>Sonuçları kopyala</Text>
            </Pressable>
          </Card>

          {verdict && view.monitors.length > 0 ? (
            <Card hero style={[s.heroCard, { marginTop: 10 }]}>
              <View style={s.rowBetween}>
                <Text style={s.cardTitle}>Muayeneye hazır mı?</Text>
                <Chip label={verdict.pass ? 'Geçer' : 'Geçmez'} t={verdict.pass ? 'ok' : 'error'} />
              </View>
              {isPro ? (
              <View style={{ gap: 9, marginTop: 12 }}>
                {verdict.reasons.map((r) => (
                  <View key={r.text} style={s.reason}>
                    <View style={{ marginTop: 1 }}>
                      <Icon name={r.tone === 'ok' ? 'check' : r.tone === 'warn' ? 'info' : 'x'} size={16} color={tone[r.tone][0]} stroke={2.2} />
                    </View>
                    <Text style={s.reasonText}>{r.text}</Text>
                  </View>
                ))}
              </View>
              ) : (
                <Pressable onPress={() => gate('inspection')} style={s.lockedRow}>
                  <Text style={s.lockedText}>Nedenleri gör</Text>
                  <ProTag />
                </Pressable>
              )}
              <Text style={s.fine}>Genel kural: MIL sönük ve en fazla bir monitör hazır değil. Muayene sonucunu garanti etmez.</Text>
            </Card>
          ) : null}

          {GROUPS.map((g) => {
            const list = view[g.key];
            return (
              <View key={g.key} style={{ marginTop: 22 }}>
                <View style={s.groupHead}>
                  <Text style={s.groupName}>{g.name}</Text>
                  <View style={[s.badge, { backgroundColor: list.length ? colors.warnBg : '#1f1c19' }]}>
                    <Text style={[s.badgeText, { color: list.length ? colors.warn : colors.faint }]}>{list.length}</Text>
                  </View>
                  <Text style={s.groupHint}>{g.hint}</Text>
                </View>
                {list.length === 0 ? (
                  <View style={s.none}>
                    <Text style={s.noneText}>Kod yok</Text>
                  </View>
                ) : (
                  list.map((code) => (
                    <DtcCard
                      key={`${g.key}-${code}`}
                      code={code}
                      groupName={g.name}
                      freezeFrame={isPro ? view.freezeFrame : null}
                      locked={!isPro && code !== freeCode}
                      onOpen={() => {
                        if (!isPro && code !== freeCode) {
                          gate('dtc-detail');
                          return;
                        }
                        setTechOpen(false);
                        setDetail({ code, groups: groupsOf(code) });
                      }}
                    />
                  ))
                )}
              </View>
            );
          })}

          <View style={{ gap: 8, marginTop: 22 }}>
            <Button
              label={isPro ? 'Tam raporu kopyala' : 'Tam raporu kopyala · Pro'}
              variant="secondary"
              icon="copy"
              onPress={() => gate('full-report', () => void onCopyReport())}
              loading={reportBusy}
            />
            {connected ? <Button label="Kodları sil" variant="dangerSoft" onPress={() => setConfirm(true)} /> : null}
          </View>
          {!view.live ? <Text style={s.fine}>Kayıtlı son tarama gösteriliyor. Güncel sonuç için dongle'ı bağla ve tara.</Text> : null}
        </>
      ) : null}

      <Sheet visible={!!detail} onClose={() => setDetail(null)}>
        {d && detail ? (
          <DtcDetailBody
            d={d}
            groups={detail.groups}
            freezeFrame={view?.freezeFrame ?? null}
            live={!!view?.live}
            isPro={isPro}
            onLocked={gateFromSheet}
            protocol={protocolName}
            techOpen={techOpen}
            onToggleTech={() => setTechOpen((o) => !o)}
            onCopy={(text) => void copy(text)}
          />
        ) : null}
      </Sheet>

      <ConfirmModal
        visible={confirm}
        title="Kodlar silinsin mi?"
        body="Hata kodlarını silmek arızayı çözmez, sadece lambayı söndürür. Altta yatan sorun sürerse kod tekrar gelecek."
        note="Hazırlık monitörleri de sıfırlanır; muayeneden önce birkaç gün normal sürüş gerekir. Kalıcı kodlar silinmez."
        confirmLabel="Kodları sil"
        onConfirm={() => void onConfirmClear()}
        onCancel={() => setConfirm(false)}
        busy={clearing}
      />
    </Screen>
  );
}

function fromResult(r: ScanResult): View_ {
  return {
    at: r.at,
    stored: r.stored,
    pending: r.pending,
    permanent: r.permanent,
    milOn: r.readiness ? r.readiness.milOn : null,
    monitors: r.readiness ? r.readiness.monitors.map((m) => ({ name: m.name, supported: m.supported, ready: m.ready })) : [],
    freezeFrame: r.freezeFrame,
    live: true,
  };
}

function lastScanLine(stored: string[], pending: string[], permanent: string[]): string {
  const all = Array.from(new Set([...stored, ...pending, ...permanent]));
  if (all.length === 0) return 'Kod yok';
  return `${all.length} kod · ${all.slice(0, 3).join(', ')}`;
}

function ProTag() {
  return (
    <View style={s.proTag}>
      <Text style={s.proTagText}>Pro</Text>
    </View>
  );
}

/* ---------- Scan dial ---------- */

function ScanDial({
  connected,
  scanning,
  progress,
  onPress,
}: {
  connected: boolean;
  scanning: boolean;
  progress: number;
  onPress: () => void;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!scanning) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [scanning, spin]);

  return (
    <View style={s.dialWrap}>
      <View style={s.dial}>
        <View style={[s.ring, { top: 0, left: 0, right: 0, bottom: 0, borderColor: '#221f1c' }]} />
        <View style={[s.ring, { top: 18, left: 18, right: 18, bottom: 18, borderColor: colors.line2 }]} />
        {scanning ? (
          <>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
              ]}
            >
              <View style={s.spinArc} />
            </Animated.View>
            <View style={[StyleSheet.absoluteFill, s.center]}>
              <Ring value={progress} size={206} stroke={3} color={colors.amber} track="transparent" />
            </View>
          </>
        ) : null}
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <Pressable
            onPress={onPress}
            disabled={scanning}
            style={({ pressed }) => [
              s.dialBtn,
              { backgroundColor: connected ? colors.blue : colors.elevated },
              connected && s.dialGlow,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[s.dialLabel, tabular]}>
              {scanning ? `${Math.round(progress * 100)}%` : connected ? 'Tara' : 'Bağlan'}
            </Text>
            <Text style={s.dialHint}>{scanning ? 'okunuyor' : connected ? '~10 saniye' : 'önce dongle'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ---------- DTC card + detail ---------- */

function DtcCard({
  code,
  groupName,
  freezeFrame,
  locked,
  onOpen,
}: {
  code: string;
  groupName: string;
  freezeFrame: FreezeFrame | null;
  locked: boolean;
  onOpen: () => void;
}) {
  const d = dtcDetail(code);
  const [fg, bg] = tone[URGENCY_TONE[d.urgency]];
  const text = () => {
    let t = `${code} — ${d.title} [${groupName}]\n${d.long}`;
    if (freezeFrame?.dtc === code && freezeFrame.values.length) t += `\nFreeze frame: ${ffText(freezeFrame)}`;
    return t;
  };
  return (
    <Copyable text={text} onPress={onOpen} style={s.dtcCard} restColor={colors.card}>
      {(flashed) => (
        <>
          <View style={s.dtcHead}>
            <Text style={s.dtcCode}>{code}</Text>
            <View style={[s.urg, { backgroundColor: bg }]}>
              <Text style={[s.urgText, { color: fg }]}>{URGENCY_LABEL[d.urgency]}</Text>
            </View>
            <View style={{ flex: 1 }} />
            {flashed ? <Text style={s.copied}>Kopyalandı</Text> : null}
            <Icon name="chevronRight" size={14} color={colors.faint} stroke={2.2} />
          </View>
          <Text style={s.dtcTitle}>{d.title}</Text>
          {locked ? (
            <View style={[s.dtcDrive, { alignItems: 'center' }]}>
              <Text style={[s.dtcDriveText, { color: colors.faint }]}>Detay ve "sürmeye devam" yorumu Pro'da</Text>
              <ProTag />
            </View>
          ) : (
          <View style={s.dtcDrive}>
            <View style={{ marginTop: 1 }}>
              <Icon name="info" size={16} color={fg} stroke={1.7} />
            </View>
            <Text style={s.dtcDriveText}>
              <Text style={{ color: colors.muted }}>Sürmeye devam edebilir miyim? </Text>
              {d.drive}
            </Text>
          </View>
          )}
        </>
      )}
    </Copyable>
  );
}

function DtcDetailBody({
  d,
  groups,
  freezeFrame,
  live,
  protocol,
  techOpen,
  onToggleTech,
  onCopy,
  isPro,
  onLocked,
}: {
  d: DtcDetail;
  groups: string[];
  freezeFrame: FreezeFrame | null;
  live: boolean;
  isPro: boolean;
  onLocked: (f: ProFeature) => void;
  protocol: string | null;
  techOpen: boolean;
  onToggleTech: () => void;
  onCopy: (text: string) => void;
}) {
  const [fg, bg] = tone[URGENCY_TONE[d.urgency]];
  const ffMatches = isPro && !!freezeFrame && freezeFrame.dtc === d.code && freezeFrame.values.length > 0;
  const modes = GROUPS.filter((g) => groups.includes(g.name)).map((g) => `${g.mode} (${g.name})`);
  const tech = [
    `Kod: ${d.code}`,
    `Okuma: ${modes.join(', ') || '—'}`,
    freezeFrame
      ? freezeFrame.dtc
        ? `Freeze frame: Mode 02, çerçeve ${freezeFrame.frame}, kaydeden kod ${freezeFrame.dtc}`
        : 'Freeze frame: ECU’da kayıtlı anlık görüntü yok'
      : 'Freeze frame: okunmadı',
    protocol ? `Protokol: ${protocol}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const fullText = [
    `${d.code} — ${d.title}`,
    d.long,
    `Sürmeye devam: ${d.drive}`,
    ffMatches && freezeFrame ? `Freeze frame: ${ffText(freezeFrame)}` : null,
    d.causes.length ? `Olası nedenler: ${d.causes.join('; ')}` : null,
    tech,
  ]
    .filter(Boolean)
    .join('\n');

  let ffNote: string | null = null;
  if (!ffMatches) {
    if (!live) ffNote = 'Kod anındaki değerler için aracı bağlayıp yeniden tara.';
    else if (!freezeFrame || !freezeFrame.dtc) ffNote = 'ECU’da kayıtlı anlık görüntü yok.';
    else if (freezeFrame.dtc !== d.code)
      ffNote = `ECU’daki anlık görüntü ${freezeFrame.dtc} koduyla kaydedilmiş, bu koda ait değil. Araç yalnızca lambayı ilk yakan kodun anını saklar.`;
    else ffNote = 'Anlık görüntüde okunabilir değer yok.';
  }

  return (
    <>
      <View style={s.dtcHead}>
        <Text style={[s.dtcCode, { fontSize: 14 }]}>{d.code}</Text>
        <View style={[s.urg, { backgroundColor: bg }]}>
          <Text style={[s.urgText, { color: fg, fontSize: 12 }]}>{URGENCY_LABEL[d.urgency]}</Text>
        </View>
        <Text style={s.detailGroups}>{groups.join(' · ')}</Text>
      </View>
      <Text style={s.detailTitle}>{d.title}</Text>
      <Text style={s.detailLong}>{d.long}</Text>
      <View style={[s.driveBox, { backgroundColor: bg }]}>
        <Text style={[s.driveTitle, { color: fg }]}>Sürmeye devam edebilir miyim?</Text>
        <Text style={s.driveText}>{d.drive}</Text>
      </View>

      <Text style={s.detailSection}>Kod oluştuğu andaki değerler</Text>
      <Text style={s.detailSectionSub}>Freeze frame · araç bu anı saklar</Text>
      {!isPro ? (
        <Pressable onPress={() => onLocked('freeze-frame')} style={[s.lockedRow, { marginTop: 0 }]}>
          <Text style={s.lockedText}>Kod anındaki değerler</Text>
          <ProTag />
        </Pressable>
      ) : ffMatches && freezeFrame ? (
        <View style={s.ffGrid}>
          {freezeFrame.values.map(({ def, value }) => {
            const v = formatValue(value);
            return (
              <Copyable
                key={def.id}
                text={`${def.label}: ${formatValue(value, def.unit)} (${d.code} anı)`}
                style={s.ffTile}
                restColor="#1f1c19"
              >
                <Text style={s.ffLabel} numberOfLines={1}>
                  {def.label}
                </Text>
                <View style={s.ffValRow}>
                  <Text style={[s.ffVal, tabular]}>{v}</Text>
                  <Text style={s.ffUnit}>{def.unit}</Text>
                </View>
              </Copyable>
            );
          })}
        </View>
      ) : (
        <Text style={s.ffNote}>{ffNote}</Text>
      )}

      {d.causes.length ? (
        <>
          <Text style={[s.detailSection, { marginBottom: 10 }]}>Olası nedenler</Text>
          <View style={{ gap: 8 }}>
            {d.causes.map((c, i) => (
              <View key={c} style={s.cause}>
                <Text style={[s.causeN, tabular]}>{i + 1}</Text>
                <Text style={s.causeText}>{c}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Pressable onPress={onToggleTech} style={s.techHead}>
        <Text style={s.techTitle}>Teknik ayrıntılar</Text>
        <View style={{ transform: [{ rotate: techOpen ? '180deg' : '0deg' }] }}>
          <Icon name="chevronDown" size={14} color={colors.faint} stroke={2.2} />
        </View>
      </Pressable>
      {techOpen ? (
        <View style={s.techBox}>
          <Text style={s.techText}>{tech}</Text>
        </View>
      ) : null}

      <Button label="Kopyala" onPress={() => onCopy(fullText)} style={{ marginTop: 18, height: 50 }} />
    </>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  link: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 14 },
  error: { color: colors.error, fontFamily: fonts.body, fontSize: 13, marginTop: 12 },
  fine: { color: colors.faint, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 12 },
  dialWrap: { alignItems: 'center', paddingTop: 36, paddingBottom: 8 },
  dial: { width: 236, height: 236 },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  spinArc: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: colors.blue,
  },
  dialBtn: {
    width: 164,
    height: 164,
    borderRadius: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dialGlow: {
    shadowColor: colors.blue,
    shadowOpacity: 0.35,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  dialLabel: { color: '#fff', fontFamily: fonts.bodySemiBold, fontSize: 26, letterSpacing: -0.5 },
  dialHint: { color: 'rgba(255,255,255,0.85)', fontFamily: fonts.body, fontSize: 13 },
  scanText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 280,
    alignSelf: 'center',
    marginTop: 22,
    minHeight: 42,
  },
  lastCard: { marginTop: 12, borderRadius: 18 },
  lastRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  lastDot: { width: 8, height: 8, borderRadius: 4 },
  lastTitle: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  lastSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  heroCard: { marginTop: 16, padding: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  summarySub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  insetBtn: {
    marginTop: 14,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inset,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  insetBtnText: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  reason: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  reasonText: { flex: 1, color: colors.text2, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4, marginBottom: 10 },
  groupName: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
  groupHint: { marginLeft: 'auto', color: colors.faint, fontFamily: fonts.body, fontSize: 12 },
  none: {
    backgroundColor: '#121110',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  noneText: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5 },
  dtcCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  dtcHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dtcCode: { color: colors.amber, fontFamily: fonts.monoSemiBold, fontSize: 13 },
  urg: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  urgText: { fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
  copied: { color: colors.ok, fontFamily: fonts.bodyMedium, fontSize: 11.5 },
  dtcTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17, letterSpacing: -0.2, marginTop: 8 },
  dtcDrive: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  dtcDriveText: { flex: 1, color: colors.text2, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  detailGroups: { marginLeft: 'auto', color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  detailTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 29, letterSpacing: -0.6, marginTop: 10 },
  detailLong: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 6 },
  driveBox: { marginTop: 16, borderRadius: 16, padding: 14 },
  driveTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  driveText: { color: '#e7e5e4', fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 4 },
  detailSection: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 15, marginTop: 20, marginBottom: 4 },
  detailSectionSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginBottom: 10 },
  ffGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ffTile: { width: '48.5%', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  ffLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  ffValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  ffVal: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 19 },
  ffUnit: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  ffNote: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: '#1f1c19',
    borderRadius: 14,
    padding: 12,
  },
  cause: { flexDirection: 'row', gap: 10 },
  causeN: { color: colors.faint, fontFamily: fonts.body, fontSize: 14, width: 14 },
  causeText: { flex: 1, color: colors.text2, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  techHead: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#1f1c19',
    borderRadius: 14,
  },
  techTitle: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  techBox: { marginTop: 6, padding: 12, paddingHorizontal: 14, backgroundColor: colors.inset, borderRadius: 14 },
  techText: { color: colors.text2, fontFamily: fonts.mono, fontSize: 12, lineHeight: 20 },
  lockedRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#1f1c19',
    borderRadius: 14,
  },
  lockedText: { flex: 1, color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  proTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.amberBg },
  proTagText: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
});
