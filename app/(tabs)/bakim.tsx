import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useGarage } from '../../src/garage/store';
import { usePlan } from '../../src/garage/usePlan';
import {
  durationText,
  hiddenByBrand,
  intervalText,
  itemName,
  leftLine,
  everyText,
  STATUS_LABEL,
  type MaintStatusKey,
  type PlanRow,
} from '../../src/garage/maintenance';
import { Copyable, useCopy } from '../../src/ui/copy';
import { useToast } from '../../src/ui/toast';
import { usePro, useProGate } from '../../src/pro/entitlement';
import { serviceHistoryHtml } from '../../src/report/html';
import { sharePdf } from '../../src/report/share';
import { Icon } from '../../src/ui/icons';
import { Button, Card, Chip, Divider, LinkButton, ProgressBar, Ring, Screen, ScreenTitle, SectionHeader, Sheet } from '../../src/ui/primitives';
import { colors, fonts, tabular, type Tone } from '../../src/ui/theme';
import { formatDateTR, formatLira, formatThousands, parseDateTR, parseKm, todayISO } from '../../src/utils/format';

const STATUS_TONE: Record<MaintStatusKey, Tone> = { over: 'error', soon: 'warn', ok: 'ok', unknown: 'neutral' };
const STATUS_COLOR: Record<MaintStatusKey, string> = { over: colors.error, soon: colors.warn, ok: colors.ok, unknown: colors.faint };
const GROUPS: MaintStatusKey[] = ['over', 'soon', 'ok', 'unknown'];

type Mode = { kind: 'detail'; id: string } | { kind: 'done'; id: string; preset?: string[] } | { kind: 'interval'; id: string } | null;

function addDaysISO(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function nextText(r: PlanRow): string {
  const last = r.status.last;
  if (!last) return 'Son yapılma bilinmiyor';
  const p: string[] = [];
  if (r.item.intervalKm) p.push(`${formatThousands(last.km + r.item.intervalKm)} km`);
  if (r.item.intervalMonths) p.push(formatDateTR(addDaysISO(last.date, Math.round(r.item.intervalMonths * 30.44))));
  return p.join(' · ');
}

function lastText(r: PlanRow): string {
  const last = r.status.last;
  if (!last) return 'Bilinmiyor';
  if (r.status.assumed) return 'Kayıt yok · aralığa göre tahmin';
  return `${formatDateTR(last.date)} · ${formatThousands(last.km)} km`;
}

function rowCopy(r: PlanRow): string {
  return `${r.item.name}: ${STATUS_LABEL[r.status.key]} · ${leftLine(r.status)} · aralık ${intervalText(r.item)} · son ${lastText(r)}`;
}

/** Items usually done together at a periodic service (pre-checked in the quick entry). */
const PERIODIC = ['yag', 'yagf', 'hava', 'polen'];

/** Service records shown without Pro (newest first). */
const FREE_HISTORY = 5;

export default function BakimScreen() {
  const { vehicle, records, overrides, addRecord, deleteRecord, setOverride } = useGarage();
  const { rows, counts } = usePlan();
  const copy = useCopy();
  const toast = useToast();
  const { isPro } = usePro();
  const gate = useProGate();
  const [mode, setMode] = useState<Mode>(null);
  const [sharing, setSharing] = useState(false);

  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.item.id, r])), [rows]);
  const hidden = useMemo(
    () => (vehicle ? hiddenByBrand(vehicle).filter((h) => overrides[h.id]?.off !== false) : []),
    [vehicle, overrides]
  );

  if (!vehicle) return <Screen><View /></Screen>;

  const current = mode ? byId[mode.id] : undefined;
  const estimatedCount = rows.filter((r) => r.status.assumed).length;
  const periodicId = byId.yag ? 'yag' : rows[0]?.item.id ?? 'yag';
  const shown = isPro ? records : records.slice(0, FREE_HISTORY);
  const lockedCount = records.length - shown.length;

  const shareHistory = async () => {
    setSharing(true);
    const ok = await sharePdf(serviceHistoryHtml(vehicle, records, rows), `${vehicle.name} servis geçmişi`);
    setSharing(false);
    if (!ok) toast('PDF oluşturulamadı', 'Tekrar dene');
  };

  const copyHistory = () => {
    const lines = [`Servis geçmişi · ${vehicle.brand} ${vehicle.model}`.trim()];
    for (const r of records) {
      lines.push(
        `${formatDateTR(r.date)} · ${formatThousands(r.km)} km · ${r.items.map(itemName).join(', ')}${r.note ? ` (${r.note})` : ''} · ${r.service || 'Servis belirtilmedi'} · ${formatLira(r.cost)}`
      );
    }
    if (records.length === 0) lines.push('Kayıt yok');
    void copy(lines.join('\n'), 'Geçmiş kopyalandı');
  };

  return (
    <Screen>
      <ScreenTitle title="Bakım" sub={`${formatThousands(vehicle.km)} km · ${rows.length} kalem`} />

      <View style={styles.summary}>
        <SummaryTile n={counts.over} label="Gecikmiş" color={counts.over ? colors.error : colors.faint} />
        <SummaryTile n={counts.soon} label="Yaklaşıyor" color={counts.soon ? colors.warn : colors.faint} />
        <SummaryTile n={counts.ok} label="İyi" color={colors.ok} />
      </View>

      {estimatedCount >= 2 ? (
        <Card style={styles.quick} onPress={() => setMode({ kind: 'done', id: periodicId, preset: PERIODIC.filter((id) => id !== periodicId && byId[id]) })}>
          <View style={styles.flex}>
            <Text style={styles.rowName}>Son periyodik bakımını gir</Text>
            <Text style={styles.rowSub}>
              {estimatedCount} kalem aralığa göre tahmin ediliyor. Son bakımın tarihini ve kilometresini girince gerçek hesaba döner.
            </Text>
          </View>
          <Icon name="chevronRight" size={14} color={colors.faint} stroke={2.2} />
        </Card>
      ) : null}

      {GROUPS.map((g) => {
        const items = rows.filter((r) => r.status.key === g);
        if (items.length === 0) return null;
        return (
          <View key={g} style={{ marginTop: 22 }}>
            <View style={styles.groupHead}>
              <View style={[styles.groupDot, { backgroundColor: STATUS_COLOR[g] }]} />
              <Text style={styles.groupName}>{STATUS_LABEL[g]}</Text>
              {g === 'unknown' ? <Text style={styles.groupHint}>Model yılını gir ya da işaretle</Text> : null}
            </View>
            <Card>
              {items.map((r, i) => (
                <View key={r.item.id}>
                  {i > 0 ? <Divider /> : null}
                  <Copyable text={rowCopy(r)} onPress={() => setMode({ kind: 'detail', id: r.item.id })} style={styles.row}>
                    <Ring value={r.status.used} size={34} stroke={4} color={STATUS_COLOR[r.status.key]} />
                    <View style={styles.flex}>
                      <Text style={styles.rowName}>{r.item.name}</Text>
                      <Text style={[styles.rowSub, tabular]}>{leftLine(r.status)}</Text>
                      <Text style={[styles.rowEvery, tabular]}>{everyText(r.item)}</Text>
                    </View>
                    <Chip
                      label={r.status.assumed ? 'Tahmini' : STATUS_LABEL[r.status.key]}
                      t={r.status.assumed ? 'neutral' : STATUS_TONE[r.status.key]}
                      style={{ alignSelf: 'center' }}
                    />
                  </Copyable>
                </View>
              ))}
            </Card>
          </View>
        );
      })}

      {hidden.length ? (
        <View style={{ marginTop: 22 }}>
          <Text style={styles.hiddenTitle}>Gizlenen kalemler</Text>
          {hidden.map((h) => (
            <View key={h.id} style={styles.hiddenRow}>
              <View style={styles.flex}>
                <Text style={styles.rowName}>{h.name}</Text>
                {h.note ? <Text style={styles.rowSub}>{h.note}</Text> : null}
              </View>
              <LinkButton label="Ekle" onPress={() => setOverride(h.id, { off: false })} />
            </View>
          ))}
        </View>
      ) : null}

      <SectionHeader title="Servis geçmişi" action="Bakım geçmişini kopyala" onAction={() => gate('history', copyHistory)} />
      <Card style={styles.historyCard}>
        {records.length === 0 ? (
          <Text style={styles.empty}>Henüz kayıt yok. Bir kalemi "Yapıldı" olarak işaretleyince burada görünür.</Text>
        ) : (
          shown.map((r, i) => (
            <Pressable
              key={r.id}
              onLongPress={() =>
                Alert.alert('Kayıt silinsin mi?', `${formatDateTR(r.date)} · ${r.items.map(itemName).join(', ')}`, [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Sil', style: 'destructive', onPress: () => deleteRecord(r.id) },
                ])
              }
              style={styles.tl}
            >
              <View style={styles.tlRail}>
                <View style={[styles.tlLine, { height: 16, backgroundColor: i === 0 ? 'transparent' : colors.line2 }]} />
                <View
                  style={[
                    styles.tlDot,
                    { backgroundColor: i === 0 ? colors.amber : colors.faint2 },
                    i === 0 && styles.tlDotRing,
                  ]}
                />
                <View style={[styles.tlLine, { flex: 1, backgroundColor: i === shown.length - 1 && !lockedCount ? 'transparent' : colors.line2 }]} />
              </View>
              <View style={styles.tlBody}>
                <View style={styles.between}>
                  <Text style={[styles.tlMeta, tabular]}>{formatDateTR(r.date)}</Text>
                  <Text style={[styles.tlMeta, tabular]}>{formatThousands(r.km)} km</Text>
                </View>
                <Text style={styles.tlItems}>
                  {r.items.map(itemName).join(', ')}
                  {r.note ? ` · ${r.note}` : ''}
                </Text>
                <Text style={styles.tlService}>
                  {r.service || 'Servis belirtilmedi'} · <Text style={[styles.tlCost, tabular]}>{formatLira(r.cost)}</Text>
                </Text>
              </View>
            </Pressable>
          ))
        )}
        {lockedCount > 0 ? (
          <Pressable onPress={() => gate('history')} style={styles.moreRow}>
            <Icon name="lock" size={14} color={colors.amber} />
            <Text style={styles.moreText}>{lockedCount} kayıt daha · Pro</Text>
            <Icon name="chevronRight" size={13} color={colors.faint} stroke={2.2} />
          </Pressable>
        ) : null}
      </Card>
      {records.length > 0 ? (
        <>
          <Button
            label="Servis geçmişini PDF paylaş"
            variant="secondary"
            icon="doc"
            loading={sharing}
            onPress={() => gate('pdf', () => void shareHistory())}
            style={{ marginTop: 12, height: 46 }}
          />
          <Text style={styles.pdfHint}>Aracını satarken alıcıya bakım geçmişini belgeyle göster.</Text>
        </>
      ) : null}

      <Sheet visible={!!mode && !!current} onClose={() => setMode(null)}>
        {mode && current ? (
          mode.kind === 'detail' ? (
            <DetailSheet
              row={current}
              onDone={() => setMode({ kind: 'done', id: current.item.id })}
              onInterval={() => {
                if (isPro) {
                  setMode({ kind: 'interval', id: current.item.id });
                  return;
                }
                // The paywall is a route; close the sheet (a Modal) first.
                setMode(null);
                setTimeout(() => gate('intervals'), 300);
              }}
              onCopy={() =>
                void copy(
                  `${current.item.name}: ${STATUS_LABEL[current.status.key]} · ${leftLine(current.status)}\nAralık: ${intervalText(current.item)}\nSon: ${lastText(current)}\nSonraki: ${nextText(current)}`
                )
              }
            />
          ) : mode.kind === 'interval' ? (
            <IntervalSheet
              row={current}
              hasOverride={!!overrides[current.item.id]}
              onCancel={() => setMode({ kind: 'detail', id: current.item.id })}
              onSave={(km, mo) => {
                setOverride(current.item.id, { ...overrides[current.item.id], intervalKm: km, intervalMonths: mo });
                setMode({ kind: 'detail', id: current.item.id });
              }}
              onReset={() => {
                setOverride(current.item.id, null);
                setMode({ kind: 'detail', id: current.item.id });
              }}
            />
          ) : (
            <DoneSheet
              row={current}
              rows={rows}
              preset={mode.kind === 'done' ? mode.preset : undefined}
              vehicleKm={vehicle.km}
              onCancel={() => setMode({ kind: 'detail', id: current.item.id })}
              onSave={(rec) => {
                addRecord(rec);
                setMode(null);
              }}
            />
          )
        ) : null}
      </Sheet>
    </Screen>
  );
}

function SummaryTile({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <Card hero style={styles.sumTile}>
      <Text style={[styles.sumN, { color }, tabular]}>{n}</Text>
      <Text style={styles.sumL}>{label}</Text>
    </Card>
  );
}

function DetailSheet({
  row,
  onDone,
  onInterval,
  onCopy,
}: {
  row: PlanRow;
  onDone: () => void;
  onInterval: () => void;
  onCopy: () => void;
}) {
  const s = row.status;
  const over = s.key === 'over';
  let big = '—';
  let unit = 'son yapılma bilinmiyor';
  if (s.key !== 'unknown') {
    if (s.leftKm != null) {
      big = formatThousands(Math.abs(s.leftKm));
      unit = s.leftKm < 0 ? 'km geçti' : 'km kaldı';
    } else if (s.leftDays != null) {
      big = durationText(Math.abs(s.leftDays));
      unit = s.leftDays < 0 ? 'geçti' : 'kaldı';
    }
  }
  const color = STATUS_COLOR[s.key];
  return (
    <View>
      <View style={styles.between}>
        <Text style={styles.sheetTitle}>{row.item.name}</Text>
        <Chip label={STATUS_LABEL[s.key]} t={STATUS_TONE[s.key]} style={{ marginTop: 4 }} />
      </View>
      <View style={styles.bigRow}>
        <Text style={[styles.big, { color }, tabular]}>{big}</Text>
        <Text style={styles.bigUnit}>{unit}</Text>
      </View>
      {s.key !== 'unknown' && !over && s.leftKm != null && s.leftDays != null ? (
        <Text style={styles.orLine}>veya {durationText(Math.max(0, s.leftDays))}</Text>
      ) : null}
      <View style={{ marginTop: 14 }}>
        <ProgressBar value={s.used} color={color} />
      </View>
      <View style={styles.table}>
        <TableRow label="Aralık" value={intervalText(row.item)} />
        <TableRow label="Son yapılma" value={lastText(row)} border />
        <TableRow label="Sonraki" value={nextText(row)} border />
      </View>
      <Text style={styles.why}>{row.item.why}</Text>
      {row.item.note ? <Text style={styles.note}>{row.item.note}</Text> : null}
      <Text style={styles.note}>Genel öneri; kendi aracının kullanım kılavuzuyla karşılaştır.</Text>
      <Button label="Yapıldı olarak işaretle" onPress={onDone} style={{ marginTop: 18, height: 50 }} />
      <Button label="Aralığı düzenle" variant="secondary" onPress={onInterval} style={{ marginTop: 8, height: 46 }} />
      <Button label="Kopyala" variant="secondary" icon="copy" onPress={onCopy} style={{ marginTop: 8, height: 46 }} />
    </View>
  );
}

function TableRow({ label, value, border }: { label: string; value: string; border?: boolean }) {
  return (
    <View style={[styles.tRow, border && styles.tBorder]}>
      <Text style={styles.tLabel}>{label}</Text>
      <Text style={[styles.tValue, tabular]}>{value}</Text>
    </View>
  );
}

function IntervalSheet({
  row,
  hasOverride,
  onCancel,
  onSave,
  onReset,
}: {
  row: PlanRow;
  hasOverride: boolean;
  onCancel: () => void;
  onSave: (km: number, months: number) => void;
  onReset: () => void;
}) {
  const [km, setKm] = useState(row.item.intervalKm ? formatThousands(row.item.intervalKm) : '');
  const [mo, setMo] = useState(row.item.intervalMonths ? String(row.item.intervalMonths) : '');
  const save = () => {
    const k = parseKm(km) ?? 0;
    const m = parseKm(mo) ?? 0;
    if (k === 0 && m === 0) {
      Alert.alert('Geçersiz aralık', 'Kilometre veya ay olarak en az bir aralık gir.');
      return;
    }
    onSave(k, m);
  };
  return (
    <View>
      <SheetHeader left="Vazgeç" title="Aralık" right="Kaydet" onLeft={onCancel} onRight={save} />
      <Text style={[styles.sheetTitle, { marginTop: 18 }]}>{row.item.name}</Text>
      <View style={styles.form}>
        <FormRow label="Kilometre" value={km} onChange={(v) => setKm(parseKm(v) == null ? '' : formatThousands(parseKm(v) ?? 0))} ph="15.000" kb="number-pad" />
        <FormRow label="Ay" value={mo} onChange={(v) => setMo(v.replace(/\D/g, ''))} ph="12" kb="number-pad" border />
      </View>
      <Text style={styles.note}>Boş bırakılan boyut kullanılmaz. Kendi kılavuzundaki değerleri girebilirsin.</Text>
      {hasOverride ? <Button label="Varsayılana dön" variant="secondary" onPress={onReset} style={{ marginTop: 16, height: 46 }} /> : null}
    </View>
  );
}

function DoneSheet({
  row,
  rows,
  preset,
  vehicleKm,
  onCancel,
  onSave,
}: {
  row: PlanRow;
  rows: PlanRow[];
  preset?: string[];
  vehicleKm: number;
  onCancel: () => void;
  onSave: (r: { date: string; km: number; items: string[]; service: string; cost: number | null; note: string }) => void;
}) {
  const [date, setDate] = useState(formatDateTR(todayISO()));
  const [km, setKm] = useState(formatThousands(vehicleKm));
  const [service, setService] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const pair = row.item.id === 'yag' ? 'yagf' : row.item.id === 'yagf' ? 'yag' : null;
  const [extra, setExtra] = useState<Record<string, boolean>>(() => {
    if (preset) return Object.fromEntries(preset.map((id) => [id, true]));
    return pair && rows.some((r) => r.item.id === pair) ? { [pair]: true } : {};
  });
  const others = rows.filter((r) => r.item.id !== row.item.id);

  const save = () => {
    const iso = parseDateTR(date);
    if (!iso) {
      Alert.alert('Geçersiz tarih', 'Tarihi GG.AA.YYYY biçiminde gir.');
      return;
    }
    if (iso > todayISO()) {
      Alert.alert('Geçersiz tarih', 'Gelecekteki bir tarih girilemez.');
      return;
    }
    const k = parseKm(km);
    if (k == null) {
      Alert.alert('Geçersiz kilometre', 'Bakım yapıldığındaki kilometreyi gir.');
      return;
    }
    const items = [row.item.id, ...others.filter((r) => extra[r.item.id]).map((r) => r.item.id)];
    onSave({ date: iso, km: k, items, service: service.trim(), cost: parseKm(cost), note: note.trim() });
  };

  return (
    <View>
      <SheetHeader left="Vazgeç" title="Yapıldı" right="Kaydet" onLeft={onCancel} onRight={save} />
      <Text style={[styles.sheetTitle, { marginTop: 18, fontSize: 22 }]}>{row.item.name}</Text>
      <View style={styles.form}>
        <FormRow label="Tarih" value={date} onChange={setDate} ph="10.10.2026" kb="numbers-and-punctuation" />
        <FormRow label="Kilometre" value={km} onChange={(v) => setKm(parseKm(v) == null ? '' : formatThousands(parseKm(v) ?? 0))} ph="48.612" kb="number-pad" border />
        <FormRow label="Servis" value={service} onChange={setService} ph="Servis adı" border />
        <FormRow label="Tutar" value={cost} onChange={(v) => setCost(parseKm(v) == null ? '' : formatThousands(parseKm(v) ?? 0))} ph="₺" kb="number-pad" border />
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Not (isteğe bağlı)"
        placeholderTextColor={colors.faint}
        multiline
        style={styles.textarea}
      />
      {others.length ? (
        <>
          <Text style={styles.checkTitle}>Aynı ziyarette yapılanlar</Text>
          <View style={styles.checkWrap}>
            {others.map((r) => {
              const on = !!extra[r.item.id];
              return (
                <Pressable
                  key={r.item.id}
                  onPress={() => setExtra((e) => ({ ...e, [r.item.id]: !on }))}
                  style={[styles.check, on && styles.checkOn]}
                >
                  {on ? <Icon name="check" size={12} color={colors.text} stroke={2.6} /> : null}
                  <Text style={[styles.checkText, on && { color: colors.text }]}>{r.item.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
      <Text style={styles.note}>Kaydedince sonraki bakım bu tarih ve kilometreden yeniden hesaplanır.</Text>
    </View>
  );
}

function SheetHeader({ left, title, right, onLeft, onRight }: { left: string; title: string; right: string; onLeft: () => void; onRight: () => void }) {
  return (
    <View style={styles.sheetHead}>
      <Pressable onPress={onLeft} hitSlop={8}>
        <Text style={styles.sheetHeadBtn}>{left}</Text>
      </Pressable>
      <Text style={styles.sheetHeadTitle}>{title}</Text>
      <Pressable onPress={onRight} hitSlop={8}>
        <Text style={[styles.sheetHeadBtn, { fontFamily: fonts.bodySemiBold }]}>{right}</Text>
      </Pressable>
    </View>
  );
}

function FormRow({
  label,
  value,
  onChange,
  ph,
  kb,
  border,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ph: string;
  kb?: KeyboardTypeOptions;
  border?: boolean;
}) {
  return (
    <View style={[styles.fRow, border && styles.fBorder]}>
      <Text style={styles.fLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={ph}
        placeholderTextColor={colors.faint}
        keyboardType={kb ?? 'default'}
        autoCorrect={false}
        style={[styles.fInput, tabular]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 16, borderColor: 'rgba(59,130,246,0.35)' },
  rowEvery: { color: colors.faint, fontFamily: fonts.body, fontSize: 11.5, marginTop: 2 },
  flex: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  summary: { flexDirection: 'row', gap: 8, marginTop: 18 },
  sumTile: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18 },
  sumN: { fontFamily: fonts.bodySemiBold, fontSize: 28, lineHeight: 30 },
  sumL: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12.5, marginTop: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4, marginBottom: 10 },
  groupDot: { width: 7, height: 7, borderRadius: 4 },
  groupName: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  groupHint: { marginLeft: 'auto', color: colors.faint, fontFamily: fonts.body, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowName: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  rowSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginTop: 2 },
  hiddenTitle: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13, marginHorizontal: 4, marginBottom: 8 },
  hiddenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    marginBottom: 8,
  },
  historyCard: { paddingVertical: 6, paddingHorizontal: 16 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  moreText: { flex: 1, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14 },
  pdfHint: { color: colors.faint, fontFamily: fonts.body, fontSize: 12, textAlign: 'center', marginTop: 8 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, paddingVertical: 12 },
  tl: { flexDirection: 'row', gap: 14 },
  tlRail: { width: 10, alignItems: 'center' },
  tlLine: { width: 1 },
  tlDot: { width: 9, height: 9, borderRadius: 5 },
  tlDotRing: { shadowColor: colors.amber, shadowOpacity: 0.5, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } },
  tlBody: { flex: 1, paddingTop: 10, paddingBottom: 14, minWidth: 0 },
  tlMeta: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  tlItems: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, marginTop: 4 },
  tlService: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 3 },
  tlCost: { color: colors.text },
  sheetTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 24, letterSpacing: -0.6, flexShrink: 1 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 18 },
  big: { fontFamily: fonts.bodySemiBold, fontSize: 36, letterSpacing: -1.2 },
  bigUnit: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 15 },
  orLine: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
  table: { marginTop: 18, backgroundColor: colors.sheetInner, borderRadius: 16, overflow: 'hidden' },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  tBorder: { borderTopWidth: 1, borderTopColor: colors.line2 },
  tLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  tValue: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  why: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, marginTop: 14 },
  note: { color: colors.faint, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetHeadBtn: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16 },
  sheetHeadTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  form: { marginTop: 14, backgroundColor: colors.sheetInner, borderRadius: 16, overflow: 'hidden' },
  fRow: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 14 },
  fBorder: { borderTopWidth: 1, borderTopColor: colors.line2 },
  fLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, width: 90 },
  fInput: { flex: 1, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15, textAlign: 'right', paddingVertical: 0 },
  textarea: {
    marginTop: 10,
    minHeight: 76,
    backgroundColor: colors.sheetInner,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  checkTitle: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13, marginTop: 16, marginBottom: 8, marginHorizontal: 2 },
  checkWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  checkOn: { borderColor: colors.blue, backgroundColor: colors.blueBg },
  checkText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
});
