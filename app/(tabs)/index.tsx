import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useGarage } from '../../src/garage/store';
import { useDueDates, usePlan } from '../../src/garage/usePlan';
import { durationText, leftLine, STATUS_LABEL } from '../../src/garage/maintenance';
import { useOBD } from '../../src/obd/context';
import { dtcDetail } from '../../src/obd/dtc-details';
import { CarSilhouette } from '../../src/ui/CarSilhouette';
import { Copyable, useCopy } from '../../src/ui/copy';
import { useToast } from '../../src/ui/toast';
import { useProGate } from '../../src/pro/entitlement';
import { garageReportHtml } from '../../src/report/html';
import { sharePdf } from '../../src/report/share';
import { Icon, Wordmark } from '../../src/ui/icons';
import { Button, Card, Hint, ProgressBar, Ring, Screen, SectionHeader, Sheet } from '../../src/ui/primitives';
import { colors, fonts, tabular } from '../../src/ui/theme';
import { daysBetween, formatDateTR, formatThousands, formatTimestamp, parseKm, todayISO } from '../../src/utils/format';

export default function GarajScreen() {
  const { vehicle, lastScan, setKm, records, vehicles, activeId, selectVehicle } = useGarage();
  const gate = useProGate();
  const toast = useToast();
  const [carSheet, setCarSheet] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { state, battery, client } = useOBD();
  const { rows, next } = usePlan();
  const dates = useDueDates();
  const copy = useCopy();
  const [kmSheet, setKmSheet] = useState(false);
  const [kmInput, setKmInput] = useState('');

  const connected = state === 'ready';

  // Read the ECU odometer (PID A6) once per connection when the car offers it.
  const odoReadRef = useRef(false);
  useEffect(() => {
    if (state !== 'ready') {
      odoReadRef.current = false;
      return;
    }
    if (odoReadRef.current || !vehicle) return;
    odoReadRef.current = true;
    void (async () => {
      try {
        const r = await client.readPid('ODO');
        if (r.status === 'ok' && typeof r.value === 'number' && r.value > vehicle.km - 50) {
          setKm(Math.round(r.value), 'obd');
        }
      } catch {
        // not supported or busy: keep the manual km
      }
    })();
  }, [state, client, vehicle, setKm]);

  const health = useMemo(() => {
    if (!lastScan) return null;
    const issues = lastScan.stored.length + lastScan.pending.length;
    const sup = lastScan.monitors.filter((m) => m.supported);
    const ready = sup.filter((m) => m.ready).length;
    const first = lastScan.stored[0] ?? lastScan.pending[0];
    let sub = connected ? 'Arıza kodu yok' : `Son kontrol ${relativeScan(lastScan.at)}`;
    if (first) {
      const d = dtcDetail(first);
      sub = d.urgency === 'error' ? `${d.title} · yakında kontrol ettir` : `${d.title} · sürmeye devam edebilirsin`;
    } else if (lastScan.permanent.length) {
      sub = 'Kalıcı kod var; onarım doğrulanınca kalkar';
    }
    const warn = issues > 0 || lastScan.permanent.length > 0;
    return { issues, ready, total: sup.length, sub, warn };
  }, [lastScan, connected]);

  if (!vehicle) return <Screen><View /></Screen>;

  const bat = lastScan?.battery ?? battery;
  const hColor = !health ? colors.faint : health.warn ? colors.warn : colors.ok;
  const carLine = [`${vehicle.brand} ${vehicle.model}`.trim(), vehicle.year ? String(vehicle.year) : null, vehicle.fuel]
    .filter(Boolean)
    .join(' · ');

  const kmTag =
    vehicle.kmSource === 'obd' && daysBetween(vehicle.kmUpdatedAt, todayISO()) === 0
      ? 'Araçtan okundu'
      : daysBetween(vehicle.kmUpdatedAt, todayISO()) === 0
        ? 'Az önce güncellendi'
        : `Elle girildi · ${formatDateTR(vehicle.kmUpdatedAt)}`;

  const buildReport = (): string => {
    const lines: string[] = [];
    lines.push(`Otova araç raporu — ${formatTimestamp()}`);
    lines.push(`${vehicle.name}: ${carLine}${vehicle.plate ? ` · ${vehicle.plate}` : ''}`);
    lines.push(`Kilometre: ${formatThousands(vehicle.km)} km`);
    lines.push('');
    if (lastScan) {
      lines.push(`Son tarama: ${lastScan.at.replace('T', ' ').slice(0, 16)}`);
      const codeLine = (label: string, codes: string[]) =>
        `${label}: ${codes.length ? codes.map((c) => `${c} (${dtcDetail(c).title})`).join(', ') : 'yok'}`;
      lines.push(codeLine('Kayıtlı kodlar', lastScan.stored));
      lines.push(codeLine('Bekleyen kodlar', lastScan.pending));
      lines.push(codeLine('Kalıcı kodlar', lastScan.permanent));
      if (lastScan.milOn != null) lines.push(`MIL: ${lastScan.milOn ? 'açık' : 'kapalı'}`);
      const sup = lastScan.monitors.filter((m) => m.supported);
      if (sup.length) {
        const notReady = sup.filter((m) => !m.ready).map((m) => m.name);
        lines.push(
          `Hazırlık monitörleri: ${sup.length - notReady.length}/${sup.length} hazır${notReady.length ? ` (hazır değil: ${notReady.join(', ')})` : ''}`
        );
      }
    } else {
      lines.push('Arıza taraması: henüz yapılmadı');
    }
    if (bat != null) lines.push(`Akü: ${bat.toFixed(1)} V`);
    lines.push('');
    lines.push('Bakım:');
    for (const r of rows) lines.push(`  ${r.item.name}: ${STATUS_LABEL[r.status.key]} · ${leftLine(r.status)}`);
    if (dates.length) {
      lines.push('');
      lines.push('Tarihler:');
      for (const d of dates) lines.push(`  ${d.name}: ${formatDateTR(d.date)} (${d.days} gün)`);
    }
    return lines.join('\n');
  };

  const sharePdfReport = async () => {
    setSharing(true);
    const ok = await sharePdf(garageReportHtml(vehicle, lastScan, rows, dates, records), `${vehicle.name} araç raporu`);
    setSharing(false);
    if (!ok) toast('PDF oluşturulamadı', 'Tekrar dene');
  };

  /** Close the switcher, then navigate (a route cannot open over a visible Modal). */
  const fromCarSheet = (fn: () => void) => {
    setCarSheet(false);
    setTimeout(fn, 300);
  };

  const saveKm = () => {
    const km = parseKm(kmInput);
    if (km == null) {
      Alert.alert('Geçersiz kilometre', 'Sadece rakam gir.');
      return;
    }
    setKm(km, 'manual');
    setKmSheet(false);
  };

  const nextAlt =
    next && next.row.status.leftKm != null && next.row.status.leftDays != null
      ? `veya ${durationText(Math.max(0, next.row.status.leftDays))}`
      : '';
  const nextLeft = next ? leftLine(next.row.status).replace(/ veya .*kaldı$/, ' kaldı') : '';
  const nextColor = next?.row.status.key === 'over' ? colors.error : colors.amber;

  return (
    <Screen>
      <View style={styles.header}>
        <Wordmark size={19} />
        <Pressable
          onPress={() => router.push('/baglan')}
          style={[styles.pill, connected ? styles.pillOn : styles.pillOff]}
        >
          <View style={[styles.pillDot, { backgroundColor: connected ? colors.ok : '#fff' }]} />
          <Text style={[styles.pillText, { color: connected ? colors.text2 : '#fff' }, tabular]}>
            {connected ? `Bağlı${battery != null ? ` · ${battery.toFixed(1)} V` : ''}` : state === 'connecting' || state === 'initializing' ? 'Bağlanıyor…' : 'Bağlan'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        <Pressable onPress={() => setCarSheet(true)} style={styles.flex} hitSlop={6}>
          <View style={styles.nameRow}>
            <Text style={styles.carName} numberOfLines={1}>{vehicle.name}</Text>
            <Icon name="chevronDown" size={18} color={colors.faint} stroke={2.2} />
          </View>
          <Text style={styles.carLine} numberOfLines={1}>{carLine}</Text>
        </Pressable>
        {vehicle.plate ? (
          <View style={styles.plate}>
            <View style={styles.plateTr}>
              <Text style={styles.plateTrText}>TR</Text>
            </View>
            <Text style={styles.plateText}>{vehicle.plate}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.car}>
        <CarSilhouette width={350} car={vehicle} />
      </View>

      <Copyable
        text={`Kilometre: ${formatThousands(vehicle.km)} km`}
        line="bottom"
        onPress={() => {
          setKmInput(formatThousands(vehicle.km));
          setKmSheet(true);
        }}
        style={styles.kmRow}
      >
        {(flashed) => (
          <>
            <View style={styles.kmLeft}>
              <Text style={[styles.km, tabular]}>{formatThousands(vehicle.km)}</Text>
              <Text style={styles.kmUnit}>km</Text>
            </View>
            <Text style={[styles.kmTag, flashed && { color: colors.ok }]}>{flashed ? 'Kopyalandı' : kmTag}</Text>
          </>
        )}
      </Copyable>

      <Card hero onPress={() => router.push('/tani')} style={styles.heroPad}>
        <View style={styles.healthRow}>
          <Ring value={health && health.total ? health.ready / health.total : 0} size={60} stroke={6} color={hColor}>
            <Text style={[styles.ringNum, { color: hColor }, tabular]}>{health ? String(health.issues) : '–'}</Text>
          </Ring>
          <View style={styles.flex}>
            <Text style={styles.hTitle}>
              {!health ? 'Henüz tarama yok' : health.issues ? `${health.issues} konu dikkat istiyor` : 'Her şey yolunda'}
            </Text>
            <Text style={styles.hSub}>
              {!health ? (connected ? 'Tanı sekmesinden tara' : "Dongle'ı bağla ve tara") : health.sub}
            </Text>
          </View>
          <Icon name="chevronRight" size={14} color={colors.faint} stroke={2.2} />
        </View>
        <View style={styles.stats}>
          <Stat v={health ? String(health.issues) : '–'} l="Arıza kodu" c={!health ? colors.faint : health.issues ? colors.warn : colors.ok} />
          <Stat v={bat != null ? `${bat.toFixed(1)} V` : '–'} l="Akü" c={bat == null ? colors.faint : bat >= 12.2 ? colors.ok : colors.warn} />
          <Stat
            v={health && health.total ? `${health.ready}/${health.total}` : '–'}
            l="Hazırlık"
            c={!health || !health.total ? colors.faint : health.ready < health.total ? colors.warn : colors.ok}
          />
        </View>
      </Card>

      <Card hero onPress={() => router.push('/bakim')} style={[styles.heroPad, { marginTop: 10 }]}>
        {next ? (
          <>
            <View style={styles.between}>
              <Text style={styles.cardLabel}>Sıradaki bakım</Text>
              <Text style={[styles.cardLabel, tabular]}>{nextAlt}</Text>
            </View>
            <View style={[styles.between, { marginTop: 8 }]}>
              <Text style={styles.nextName} numberOfLines={1}>{next.name}</Text>
              <Text style={[styles.nextLeft, { color: nextColor }, tabular]}>{nextLeft}</Text>
            </View>
            <View style={{ marginTop: 12 }}>
              <ProgressBar value={next.row.status.used} color={nextColor} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.cardLabel}>Sıradaki bakım</Text>
            <Text style={[styles.nextName, { marginTop: 8 }]}>Son bakımı gir</Text>
            <Text style={styles.hSub}>Son değişim tarihlerini girince sıradaki bakımı hesaplarız.</Text>
          </>
        )}
      </Card>

      <SectionHeader title="Yaklaşan tarihler" action="Tümü" onAction={() => router.push('/daha/belgeler')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datesScroll} contentContainerStyle={styles.datesContent}>
        {dates.map((d) => (
          <Copyable
            key={d.id}
            text={`${d.name}: ${formatDateTR(d.date)} (${d.days} gün kaldı)`}
            onPress={() => router.push('/daha/belgeler')}
            style={styles.dateTile}
          >
            <Text style={styles.dateName} numberOfLines={1}>{d.name}</Text>
            <View style={styles.dateDays}>
              <Text style={[styles.dateNum, { color: d.days <= 30 ? colors.amber : colors.text }, tabular]}>{d.days}</Text>
              <Text style={styles.dateUnit}>gün</Text>
            </View>
            <Text style={[styles.dateDate, tabular]}>{formatDateTR(d.date)}</Text>
          </Copyable>
        ))}
        <Pressable onPress={() => router.push('/daha/belgeler')} style={[styles.dateTile, styles.dateAdd]}>
          <Icon name="plus" size={18} color={colors.blue} />
          <Text style={styles.dateAddText}>Tarih ekle</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.reportRow}>
        <Button
          label="Tüm raporu kopyala"
          variant="secondary"
          icon="copy"
          onPress={() => gate('full-report', () => void copy(buildReport(), 'Rapor kopyalandı'))}
          style={styles.reportBtn}
        />
        <Button
          label="PDF paylaş"
          variant="secondary"
          icon="doc"
          loading={sharing}
          onPress={() => gate('pdf', () => void sharePdfReport())}
          style={styles.reportBtn}
        />
      </View>
      <Hint>Basılı tuttuğun her değer düz metin olarak kopyalanır.</Hint>

      <Sheet visible={carSheet} onClose={() => setCarSheet(false)}>
        <Text style={styles.sheetTitle}>Araçlarım</Text>
        <Card style={{ marginTop: 12 }}>
          {vehicles.map((v, i) => {
            const active = v.id === activeId;
            return (
              <Pressable
                key={v.id}
                onPress={() => {
                  if (!active) {
                    selectVehicle(v.id);
                    toast('Araç değişti', v.name);
                  }
                  setCarSheet(false);
                }}
                style={[styles.carRow, i > 0 && styles.carRowBorder]}
              >
                <View style={styles.flex}>
                  <Text style={styles.carRowName} numberOfLines={1}>{v.name}</Text>
                  <Text style={styles.carRowSub} numberOfLines={1}>
                    {[`${v.brand} ${v.model}`.trim(), v.plate].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {active ? <Icon name="check" size={18} color={colors.blue} stroke={2.4} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => fromCarSheet(() => gate('multi-vehicle', () => router.push('/onboarding?mode=add')))}
            style={[styles.carRow, styles.carRowBorder]}
          >
            <Icon name="plus" size={16} color={colors.blue} stroke={2} />
            <Text style={styles.addText}>Araç ekle</Text>
          </Pressable>
        </Card>
        <Pressable onPress={() => fromCarSheet(() => router.push('/daha/araclar'))} style={styles.manage}>
          <Text style={styles.addText}>Araçları yönet</Text>
        </Pressable>
      </Sheet>

      <Sheet visible={kmSheet} onClose={() => setKmSheet(false)}>
        <Text style={styles.sheetTitle}>Kilometre</Text>
        <Text style={styles.hSub}>Göstergedeki güncel kilometreyi gir. Bakım planı buna göre güncellenir.</Text>
        <View style={styles.kmInputWrap}>
          <TextInput
            value={kmInput}
            onChangeText={(v) => {
              const n = parseKm(v);
              setKmInput(n == null ? '' : formatThousands(n));
            }}
            keyboardType="number-pad"
            autoFocus
            style={[styles.kmInput, tabular]}
            placeholder="48.612"
            placeholderTextColor={colors.faint}
          />
          <Text style={styles.kmUnit}>km</Text>
        </View>
        <Button label="Kaydet" onPress={saveKm} style={{ marginTop: 16 }} />
      </Sheet>
    </Screen>
  );
}

function Stat({ v, l, c }: { v: string; l: string; c: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statV, { color: c }, tabular]}>{v}</Text>
      <Text style={styles.statL}>{l}</Text>
    </View>
  );
}

function relativeScan(at: string): string {
  const d = at.slice(0, 10);
  const time = at.slice(11, 16);
  const diff = daysBetween(d, todayISO());
  if (diff === 0) return `bugün ${time}`;
  if (diff === 1) return `dün ${time}`;
  return formatDateTR(d);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 40 },
  pill: { height: 30, borderRadius: 15, paddingLeft: 10, paddingRight: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  pillOn: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#171513' },
  pillOff: { backgroundColor: colors.blue },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reportRow: { flexDirection: 'row', gap: 8, marginTop: 22 },
  reportBtn: { flex: 1, height: 46, paddingHorizontal: 10 },
  carRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  carRowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  carRowName: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  carRowSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginTop: 2 },
  addText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 15 },
  manage: { alignItems: 'center', paddingVertical: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18, gap: 12 },
  carName: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 40, lineHeight: 44, letterSpacing: -1.6, flexShrink: 1 },
  carLine: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, marginTop: 8 },
  plate: { flexDirection: 'row', height: 24, borderRadius: 5, overflow: 'hidden', backgroundColor: '#f5f5f4', marginBottom: 2 },
  plateTr: { width: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3 },
  plateTrText: { color: '#fff', fontFamily: fonts.bodyBold, fontSize: 6.5 },
  plateText: { paddingHorizontal: 7, color: '#0c0a09', fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 24, letterSpacing: 0.5 },
  car: { marginTop: 10, marginHorizontal: -6, height: 132, alignItems: 'center', justifyContent: 'flex-end' },
  kmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, paddingBottom: 16, paddingHorizontal: 4, borderRadius: 8 },
  kmLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  km: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 28, letterSpacing: -0.8 },
  kmUnit: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  kmTag: { color: colors.faint, fontFamily: fonts.body, fontSize: 12 },
  heroPad: { padding: 16 },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringNum: { fontFamily: fonts.bodySemiBold, fontSize: 18 },
  hTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17, letterSpacing: -0.2 },
  hSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 3 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { flex: 1, backgroundColor: colors.inset, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  statV: { fontFamily: fonts.bodySemiBold, fontSize: 17 },
  statL: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, marginTop: 2 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  nextName: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 19, letterSpacing: -0.2, flexShrink: 1 },
  nextLeft: { fontFamily: fonts.bodySemiBold, fontSize: 19 },
  datesScroll: { marginHorizontal: -16 },
  datesContent: { paddingHorizontal: 16, gap: 10 },
  dateTile: {
    width: 122,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 14,
  },
  dateName: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  dateDays: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 10 },
  dateNum: { fontFamily: fonts.bodySemiBold, fontSize: 30, letterSpacing: -0.9 },
  dateUnit: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  dateDate: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 6 },
  dateAdd: { alignItems: 'center', justifyContent: 'center', gap: 8, borderStyle: 'dashed' },
  dateAddText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 13 },
  sheetTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 22, letterSpacing: -0.4, marginBottom: 4 },
  kmInputWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 16,
    backgroundColor: colors.sheetInner,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  kmInput: { flex: 1, color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 28, padding: 0 },
});
