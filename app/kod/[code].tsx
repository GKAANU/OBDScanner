import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { useOBD } from '../../src/obd/context';
import { useGarage } from '../../src/garage/store';
import { usePro, useProGate } from '../../src/pro/entitlement';
import { codeParts, dtcDetail, URGENCY_LABEL, URGENCY_TONE } from '../../src/obd/dtc-details';
import { rescanDtcs, sessionCodes, setDtcSession, useDtcSession, type DtcSession } from '../../src/obd/dtc-session';
import { clearAndVerify, type ClearResult } from '../../src/obd/clear';
import { userMessage } from '../../src/obd/protocol';
import { dtcReportHtml } from '../../src/report/html';
import { sharePdf } from '../../src/report/share';
import { Copyable, useCopy } from '../../src/ui/copy';
import { useToast } from '../../src/ui/toast';
import { Icon, type IconName } from '../../src/ui/icons';
import { Sheet } from '../../src/ui/primitives';
import { colors, fonts, tabular, tone } from '../../src/ui/theme';
import { formatDateTR, formatThousands, formatValue } from '../../src/utils/format';

type Status = 'Kayıtlı' | 'Bekleyen' | 'Kalıcı';

const STATUS_NOTE: Record<Status, string> = {
  Kayıtlı: 'lambayı yakar',
  Bekleyen: 'henüz onaylanmadı',
  Kalıcı: 'silinemez',
};

/** Stop-sign octagon for "Acil" (not in the shared icon set). */
const STOP_PATH = 'M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7zM9.5 9.5l5 5M14.5 9.5l-5 5';

const LIKELY = ['en olası', 'olası', 'düşük', 'nadir'];
const LIKELY_W = [1, 0.46, 0.22, 0.14];

type Overlay =
  | { kind: 'confirm' }
  | { kind: 'busy' }
  | { kind: 'result'; res: ResultView }
  | null;

type ResultView = {
  icon: IconName;
  color: string;
  bg: string;
  title: string;
  body: string;
  note?: string;
  primary: { label: string; blue?: boolean; action: 'close' | 'share' | 'retry' };
  secondary?: string;
};

function statusOf(s: DtcSession | null, code: string): Status {
  if (!s) return 'Kayıtlı';
  if (s.stored.includes(code)) return 'Kayıtlı';
  if (s.pending.includes(code)) return 'Bekleyen';
  if (s.permanent.includes(code)) return 'Kalıcı';
  return 'Kayıtlı';
}

function readAtText(iso: string, km: number | null): string {
  return `Okundu ${formatDateTR(iso.slice(0, 10))}${km != null ? ` · ${formatThousands(km)} km` : ''}`;
}

export default function KodDetay() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = String(raw ?? '').toUpperCase();
  const insets = useSafeAreaInsets();
  const session = useDtcSession();
  const { client, state } = useOBD();
  const { vehicle } = useGarage();
  const { isPro } = usePro();
  const gate = useProGate();
  const copy = useCopy();
  const toast = useToast();
  const connected = state === 'ready';

  const d = useMemo(() => dtcDetail(code), [code]);
  const [fg, bg] = tone[URGENCY_TONE[d.urgency]];
  const codes = session ? sessionCodes(session) : [code];
  const idx = Math.max(0, codes.indexOf(code));
  const freeCode = codes[0] ?? code;
  const locked = !isPro && code !== freeCode;
  const status = statusOf(session, code);
  const isPerm = status === 'Kalıcı';
  const parts = d.known ? [] : codeParts(code);

  const ff =
    session?.freezeFrame && session.freezeFrame.dtc === code && session.freezeFrame.values.length
      ? session.freezeFrame.values.map(({ def, value }) => ({ id: def.id, label: def.label, value: formatValue(value), unit: def.unit }))
      : [];
  const ffNote = ff.length
    ? null
    : !session?.live
      ? 'Kod anındaki değerler için aracı bağlayıp yeniden tara.'
      : !session.freezeFrame || !session.freezeFrame.dtc
        ? 'Araç bu kod için anlık görüntü saklamamış.'
        : `Araç yalnızca lambayı ilk yakan kodun anını saklar; kayıtlı görüntü ${session.freezeFrame.dtc} koduna ait.`;

  const [done, setDone] = useState<Record<number, boolean>>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [ov, setOv] = useState<Overlay>(null);

  const readAt = readAtText(session?.at ?? new Date().toISOString(), vehicle ? vehicle.km : null);
  const vehicleLine = vehicle
    ? `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` · ${vehicle.year}` : ''} · ${formatThousands(vehicle.km)} km`
    : null;

  const shareText = useMemo(() => {
    const lines = [
      'OTOVA · ARIZA RAPORU',
      vehicleLine,
      '',
      `${code} · ${status} · ${URGENCY_LABEL[d.urgency]}`,
      d.title,
      readAt,
      '',
      `Sürmeye devam: ${d.answer} ${d.drive}`,
      '',
      'NE DEMEK',
      d.long,
    ];
    if (ff.length) lines.push('', 'KOD DONDUĞUNDA', ...ff.map((f) => `${f.label}: ${f.value} ${f.unit}`));
    lines.push(
      '',
      'OLASI NEDENLER',
      ...(d.causes.length ? d.causes.map((c, i) => `${i + 1}. ${c} (${LIKELY[i] ?? 'nadir'})`) : ['Üreticiye özel kod; marka cihazıyla okunmalı.']),
      '',
      'YAPILACAKLAR',
      ...d.steps.map((st, i) => `${i + 1}. ${st.t} (${st.m})`)
    );
    return lines.filter((l) => l !== null).join('\n');
  }, [code, status, d, readAt, ff, vehicleLine]);

  const onSharePdf = useCallback(async () => {
    setShareOpen(false);
    const html = dtcReportHtml(vehicle ?? null, {
      code,
      title: d.title,
      status,
      urgency: { label: URGENCY_LABEL[d.urgency], tone: URGENCY_TONE[d.urgency] },
      readAt,
      answer: d.answer,
      drive: d.drive,
      meaning: d.long,
      freezeFrame: ff.map((f) => ({ label: f.label, value: `${f.value} ${f.unit}` })),
      causes: d.causes,
      steps: d.steps.map((st) => `${st.t} (${st.m})`),
    });
    const ok = await sharePdf(html, `${code} arıza raporu`);
    if (!ok) toast('PDF paylaşılamadı', 'Metin olarak paylaşmayı dene');
  }, [vehicle, code, d, status, readAt, ff, toast]);

  const onShareText = useCallback(async () => {
    setShareOpen(false);
    try {
      await Share.share({ message: shareText });
    } catch {}
  }, [shareText]);

  const runClear = useCallback(async () => {
    setOv({ kind: 'busy' });
    let r: ClearResult;
    try {
      r = await clearAndVerify(client, [code]);
    } catch (e) {
      setOv({ kind: 'result', res: refusedView(userMessage(e)) });
      return;
    }
    if (r.kind === 'ok') {
      if (r.after && session) setDtcSession({ ...session, ...r.after, freezeFrame: null });
      rescanDtcs();
    }
    setOv({ kind: 'result', res: resultView(r, code) });
  }, [client, code, session]);

  const askDelete = useCallback(() => {
    if (isPerm) {
      setOv({ kind: 'result', res: PERM_VIEW });
      return;
    }
    if (!connected) {
      toast('Dongle bağlı değil', 'Silmek için önce bağlan');
      return;
    }
    setOv({ kind: 'confirm' });
  }, [isPerm, connected, toast]);

  const onResultPrimary = (action: 'close' | 'share' | 'retry') => {
    if (action === 'share') {
      setOv(null);
      setShareOpen(true);
    } else if (action === 'retry') void runClear();
    else setOv(null);
  };

  const urgIcon = d.urgency === 'error' ? null : d.urgency === 'warn' ? 'warn' : 'check';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.back}>
          <Icon name="chevronLeft" size={24} color={colors.blue} stroke={2.2} />
          <Text style={s.backText}>Tanı</Text>
        </Pressable>
        <View style={s.topRight}>
          <Text style={s.idx}>{codes.length > 1 ? `${idx + 1} / ${codes.length}` : ''}</Text>
          {!locked ? (
            <Pressable onPress={() => setShareOpen(true)} style={s.roundBtn} hitSlop={6}>
              <Icon name="share" size={18} color={colors.text} stroke={1.8} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: locked ? 40 : 130 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <View style={s.chips}>
          <View style={[s.chip, { backgroundColor: bg }]}>
            <View style={[s.dot, { backgroundColor: fg }]} />
            <Text style={[s.chipText, { color: fg }]}>{URGENCY_LABEL[d.urgency]}</Text>
          </View>
          <View style={[s.chip, s.chipLine]}>
            <Text style={s.chipText2}>
              {status}
              <Text style={{ color: colors.faint }}> · {STATUS_NOTE[status]}</Text>
            </Text>
          </View>
        </View>

        <Copyable text={`${code} — ${d.title}`} style={{ marginTop: 16, borderRadius: 10 }} line="bottom">
          <Text style={s.code}>{code}</Text>
        </Copyable>
        <Text style={s.title}>{d.title}</Text>
        <Text style={s.meta}>
          {d.sys} · {readAt}
        </Text>

        <View style={[s.decision, { backgroundColor: bg, borderColor: fg + '57' }]}>
          <View style={[s.decIcon, { backgroundColor: fg }]}>
            {urgIcon ? (
              <Icon name={urgIcon} size={22} color={colors.bg} stroke={2.2} />
            ) : (
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                <Path d={STOP_PATH} stroke={colors.bg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.decQ, { color: fg }]}>Sürmeye devam edebilir miyim?</Text>
            <Text style={s.decA}>{d.answer}</Text>
            <Text style={s.decBody}>{d.drive}</Text>
          </View>
        </View>

        <Text style={s.h}>Ne demek?</Text>
        <Text style={s.body}>{d.long}</Text>
        {parts.length ? (
          <View style={s.parts}>
            {parts.map((p, i) => (
              <View key={i} style={[s.part, i === 2 && parts.length === 4 && { borderColor: 'rgba(251,191,36,0.4)' }]}>
                <Text style={[s.partK, { color: i === parts.length - 1 ? colors.muted : colors.amber }]}>{p.k}</Text>
                <Text style={s.partV}>{p.v}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {isPerm ? (
          <View style={s.permBox}>
            <Icon name="info" size={20} color={colors.blue} stroke={1.9} />
            <Text style={s.permText}>
              <Text style={{ fontFamily: fonts.bodySemiBold }}>Bu kod silinemez; </Text>
              arıza giderilince araç birkaç sürüşte kendisi siler.
            </Text>
          </View>
        ) : null}

        <View style={locked ? s.lockWrap : undefined}>
          <View pointerEvents={locked ? 'none' : 'auto'}>
            <Text style={s.h}>Olası nedenler</Text>
            {d.causes.length ? (
              <View style={s.card}>
                {d.causes.map((c, i) => (
                  <View key={c} style={[s.causeRow, i > 0 && s.rowLine]}>
                    <Text style={s.causeName}>{c}</Text>
                    <View style={s.barRow}>
                      <View style={s.barTrack}>
                        <View
                          style={[s.barFill, { width: `${Math.round((LIKELY_W[i] ?? 0.1) * 100)}%`, backgroundColor: i === 0 ? colors.amber : colors.faint2 }]}
                        />
                      </View>
                      <Text style={[s.barLabel, { color: i === 0 ? colors.amber : colors.faint }]}>{LIKELY[i] ?? 'nadir'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={[s.card, { padding: 16 }]}>
                <Text style={s.emptyTitle}>Bu kod için neden tahmini yok</Text>
                <Text style={s.emptyBody}>Üreticiye özel kodlar marka cihazıyla okunur. Neden, okuma sonrasında belli olur.</Text>
              </View>
            )}

            <Text style={[s.h, { marginBottom: 4 }]}>Kod donduğunda araç</Text>
            <Text style={s.sub}>Kodun oluştuğu anın kaydı{ff.length ? ' · kopyalamak için basılı tut' : ''}</Text>
            {ff.length ? (
              <View style={s.ffGrid}>
                {ff.map((f) => (
                  <Copyable key={f.id} text={`${f.label}: ${f.value} ${f.unit} (${code} anı)`} style={s.ffTile} restColor={colors.sheet}>
                    {(flashed) => (
                      <>
                        <Text style={[s.ffLabel, flashed && { color: colors.ok }]} numberOfLines={1}>
                          {flashed ? 'Kopyalandı' : f.label}
                        </Text>
                        <View style={s.ffValRow}>
                          <Text style={[s.ffVal, tabular]}>{f.value}</Text>
                          <Text style={s.ffUnit}>{f.unit}</Text>
                        </View>
                      </>
                    )}
                  </Copyable>
                ))}
              </View>
            ) : (
              <Text style={s.ffNote}>{ffNote}</Text>
            )}

            <Text style={[s.h, { marginBottom: 4 }]}>Ne yapmalı?</Text>
            <Text style={s.sub}>Önce kolay olanlar · yaptıklarını işaretle</Text>
            <View style={{ gap: 8 }}>
              {d.steps.map((st, i) => {
                const on = !!done[i];
                return (
                  <Pressable
                    key={i}
                    onPress={() => setDone((x) => ({ ...x, [i]: !x[i] }))}
                    style={[s.step, { borderColor: st.urgent && !on ? 'rgba(239,68,68,0.38)' : colors.line }]}
                  >
                    <View style={[s.stepDot, { borderColor: on ? colors.ok : colors.track, backgroundColor: on ? colors.okBg : 'transparent' }]}>
                      {on ? <Icon name="check" size={13} color={colors.ok} stroke={3} /> : <Text style={s.stepN}>{i + 1}</Text>}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.stepT, on && { color: colors.faint, textDecorationLine: 'line-through' }]}>{st.t}</Text>
                      <Text style={[s.stepM, { color: st.urgent ? colors.error : colors.muted }]}>{st.m}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: 30, gap: 8 }}>
              <Pressable onPress={askDelete} style={({ pressed }) => [s.delBtn, pressed && { opacity: 0.8 }]}>
                <Icon name="trash" size={17} color={colors.error} stroke={2} />
                <Text style={s.delText}>Kodu sil</Text>
              </Pressable>
              <Text style={s.delNote}>
                {isPerm
                  ? 'Kalıcı kodlar elle silinemez.'
                  : 'Silmek arızayı gidermez, sadece lambayı söndürür. Araçtaki tüm kodlar birlikte silinir.'}
              </Text>
            </View>
          </View>

          {locked ? (
            <>
              <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={s.lockCard}>
                <View style={s.lockIcon}>
                  <Icon name="lock" size={22} color={colors.amber} stroke={2} />
                </View>
                <Text style={s.lockTitle}>Tüm detaylar Pro'da</Text>
                <Text style={s.lockBody}>Olası nedenler, kod donduğundaki veriler, adım adım çözüm ve ustaya paylaşım.</Text>
                <Pressable onPress={() => gate('dtc-detail')} style={({ pressed }) => [s.proBtn, pressed && { opacity: 0.85 }]}>
                  <Text style={s.proBtnText}>Pro'ya geç</Text>
                </Pressable>
                <Text style={s.lockFine}>Ücretsiz planda ilk kod tam görünür.</Text>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {!locked ? (
        <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <Pressable onPress={() => setShareOpen(true)} style={({ pressed }) => [s.barBtn, { backgroundColor: colors.blue }, pressed && { opacity: 0.85 }]}>
            <Icon name="share" size={18} color="#fff" stroke={2} />
            <Text style={[s.barText, { color: '#fff' }]}>Ustaya göster</Text>
          </Pressable>
          <Pressable
            onPress={() => void copy(shareText, `${code} kopyalandı`)}
            style={({ pressed }) => [s.barBtn, { backgroundColor: '#25211e' }, pressed && { opacity: 0.85 }]}
          >
            <Icon name="copy" size={17} color={colors.text} stroke={2} />
            <Text style={s.barText}>Tümünü kopyala</Text>
          </Pressable>
        </View>
      ) : null}

      <Sheet visible={shareOpen} onClose={() => setShareOpen(false)}>
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>Ustaya göster</Text>
          <Pressable onPress={() => setShareOpen(false)} hitSlop={8}>
            <Text style={s.sheetClose}>Kapat</Text>
          </Pressable>
        </View>
        <Text style={s.sheetSub}>Kod, oluştuğu an ve donma verisi. Ustanın cihazına gerek kalmadan okunur.</Text>
        <ScrollView style={s.preview} nestedScrollEnabled>
          <Text style={s.previewText}>{shareText}</Text>
        </ScrollView>
        <View style={s.sheetBtns}>
          <Pressable onPress={() => void onShareText()} style={({ pressed }) => [s.sheetBtn, { backgroundColor: colors.blue }, pressed && { opacity: 0.85 }]}>
            <Text style={[s.barText, { color: '#fff', fontSize: 15 }]}>Metin olarak paylaş</Text>
          </Pressable>
          <Pressable onPress={() => void onSharePdf()} style={({ pressed }) => [s.sheetBtn, { backgroundColor: colors.line2 }, pressed && { opacity: 0.85 }]}>
            <Text style={[s.barText, { fontSize: 15 }]}>PDF olarak paylaş</Text>
          </Pressable>
        </View>
      </Sheet>

      <Modal visible={!!ov} transparent animationType="fade" onRequestClose={() => ov?.kind !== 'busy' && setOv(null)}>
        <Pressable style={s.backdrop} onPress={() => ov?.kind !== 'busy' && setOv(null)}>
          <Pressable style={s.modal} onPress={(e) => e.stopPropagation()}>
            {ov?.kind === 'confirm' ? (
              <ModalBody
                icon="trash"
                color={colors.error}
                bg={colors.errorBg}
                title="Kodlar silinsin mi?"
                body="Silmek arızayı gidermez, sadece lambayı söndürür. Sorun sürüyorsa kod geri gelir. Araç tek tek silmeye izin vermez; tüm kodlar birlikte silinir."
                note="Önce motoru kapat, kontağı açık bırak. Hazırlık monitörleri de sıfırlanır."
              >
                <ModalBtn label="Kodları sil" bg={colors.error} color="#fff" onPress={() => void runClear()} />
                <ModalBtn label="Vazgeç" onPress={() => setOv(null)} />
              </ModalBody>
            ) : ov?.kind === 'busy' ? (
              <ModalBody icon="trash" color={colors.amber} bg={colors.amberBg} title="Siliniyor…" body="Araçla konuşuluyor. Kontağı kapatma.">
                <View style={s.busyTrack}>
                  <View style={s.busyFill} />
                </View>
              </ModalBody>
            ) : ov?.kind === 'result' ? (
              <ModalBody icon={ov.res.icon} color={ov.res.color} bg={ov.res.bg} title={ov.res.title} body={ov.res.body} note={ov.res.note}>
                <ModalBtn
                  label={ov.res.primary.label}
                  bg={ov.res.primary.blue ? colors.blue : undefined}
                  color={ov.res.primary.blue ? '#fff' : undefined}
                  onPress={() => onResultPrimary(ov.res.primary.action)}
                />
                {ov.res.secondary ? <ModalBtn label={ov.res.secondary} onPress={() => setOv(null)} /> : null}
              </ModalBody>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const PERM_VIEW: ResultView = {
  icon: 'lock',
  color: colors.warn,
  bg: colors.warnBg,
  title: 'Kalıcı kod: silinemez',
  body: 'Bu kod araç tarafından korunur ve hiçbir cihazla elle silinemez. Arıza giderilince araç birkaç sürüşte kendisi siler.',
  primary: { label: 'Anladım', action: 'close' },
};

function refusedView(body: string, raw?: string): ResultView {
  return {
    icon: 'info',
    color: colors.blue,
    bg: colors.blueBg,
    title: 'Araç reddetti',
    body,
    note: raw ? `Araç yanıtı: ${raw}` : undefined,
    primary: { label: 'Tekrar dene', blue: true, action: 'retry' },
    secondary: 'Vazgeç',
  };
}

function resultView(r: ClearResult, code: string): ResultView {
  if (r.kind === 'engine-running') return refusedView('Araç, motor çalışırken silmeye izin vermedi. Motoru kapat, kontağı açık bırak ve tekrar dene.', r.raw);
  if (r.kind === 'refused') return refusedView('Araç silme isteğini kabul etmedi. Motoru kapat, kontağı açık bırak ve tekrar dene.', r.raw);
  if (r.kind === 'no-response') return refusedView('Araçtan silme onayı gelmedi. Motoru kapat, kontağı açık bırak ve tekrar dene.', r.raw);
  if (r.back.includes(code))
    return {
      icon: 'warn',
      color: colors.error,
      bg: colors.errorBg,
      title: 'Hemen geri geldi: arıza aktif',
      body: 'Kod silindikten hemen sonra yeniden kaydedildi. Arıza şu an sürüyor; silmek işe yaramaz, önce nedeni giderilmeli.',
      primary: { label: 'Ustaya göster', blue: true, action: 'share' },
      secondary: 'Kapat',
    };
  if (r.permanent.includes(code)) return { ...PERM_VIEW, title: 'Silindi ama kalıcı listede kaldı', note: 'Lamba sönmüş olabilir; kalıcı kayıt arıza doğrulanınca kalkar.' };
  return {
    icon: 'check',
    color: colors.ok,
    bg: colors.okBg,
    title: 'Silindi',
    body: 'Kod silindi ve arıza lambası söndü. Sorun sürüyorsa birkaç sürüş içinde geri gelir.',
    note: 'Hazırlık monitörleri sıfırlandı; muayeneden önce birkaç gün normal sür.',
    primary: { label: 'Tamam', action: 'close' },
  };
}

function ModalBody({
  icon,
  color,
  bg,
  title,
  body,
  note,
  children,
}: {
  icon: IconName;
  color: string;
  bg: string;
  title: string;
  body: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <View style={[s.mIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={22} color={color} stroke={2} />
      </View>
      <Text style={s.mTitle}>{title}</Text>
      <Text style={s.mBody}>{body}</Text>
      {note ? <Text style={s.mNote}>{note}</Text> : null}
      <View style={{ gap: 8, marginTop: 18 }}>{children}</View>
    </>
  );
}

function ModalBtn({ label, onPress, bg, color }: { label: string; onPress: () => void; bg?: string; color?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.mBtn, { backgroundColor: bg ?? colors.line2 }, pressed && { opacity: 0.85 }]}>
      <Text style={[s.mBtnText, { color: color ?? colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 8, paddingRight: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 17 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  idx: { color: colors.faint, fontFamily: fonts.monoMedium, fontSize: 12 },
  roundBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1b1917', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { height: 26, paddingHorizontal: 10, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipLine: { borderWidth: 1, borderColor: '#2f2a26' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  chipText2: { color: '#e7e5e4', fontFamily: fonts.bodyMedium, fontSize: 13 },
  code: { color: colors.text, fontFamily: fonts.monoSemiBold, fontSize: 46, lineHeight: 52, letterSpacing: -1.4 },
  title: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 25, lineHeight: 30, letterSpacing: -0.6, marginTop: 8 },
  meta: { color: colors.faint, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 8 },
  decision: { marginTop: 20, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 14, borderWidth: 1 },
  decIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  decQ: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  decA: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 23, letterSpacing: -0.4, marginTop: 2 },
  decBody: { color: '#e7e5e4', fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, marginTop: 4 },
  h: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17, letterSpacing: -0.2, marginTop: 30, marginBottom: 10 },
  sub: { color: colors.faint, fontFamily: fonts.body, fontSize: 12.5, marginBottom: 10 },
  body: { color: colors.text2, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 24 },
  parts: { flexDirection: 'row', gap: 6, marginTop: 14 },
  part: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 9, backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.line },
  partK: { fontFamily: fonts.monoSemiBold, fontSize: 20 },
  partV: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 15, marginTop: 4 },
  permBox: {
    marginTop: 14,
    borderRadius: 16,
    padding: 13,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.28)',
    flexDirection: 'row',
    gap: 10,
  },
  permText: { flex: 1, color: '#e7e5e4', fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  lockWrap: { maxHeight: 560, overflow: 'hidden', minHeight: 420 },
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.cardHi, borderWidth: 1, borderColor: colors.line },
  causeRow: { paddingVertical: 14, paddingHorizontal: 16 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  causeName: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 },
  barTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barLabel: { width: 58, textAlign: 'right', fontFamily: fonts.bodyMedium, fontSize: 12 },
  emptyTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  emptyBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 6 },
  ffGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ffTile: { width: '48.5%', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line },
  ffLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  ffValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  ffVal: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 20 },
  ffUnit: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  ffNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, backgroundColor: colors.sheet, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.line },
  step: { flexDirection: 'row', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.sheet, borderWidth: 1 },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepN: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  stepT: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 },
  stepM: { fontFamily: fonts.bodyMedium, fontSize: 12.5, marginTop: 3 },
  delBtn: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.28)',
    backgroundColor: 'rgba(239,68,68,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  delText: { color: colors.error, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  delNote: { color: colors.faint, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  lockCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 22,
    borderRadius: 22,
    padding: 20,
    backgroundColor: 'rgba(27,25,23,0.94)',
    borderWidth: 1,
    borderColor: '#3a3530',
  },
  lockIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(251,191,36,0.14)', alignItems: 'center', justifyContent: 'center' },
  lockTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 20, letterSpacing: -0.4, marginTop: 14 },
  lockBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 6 },
  proBtn: { height: 48, marginTop: 16, borderRadius: 14, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center' },
  proBtnText: { color: colors.bg, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  lockFine: { color: colors.faint, fontFamily: fonts.body, fontSize: 12, textAlign: 'center', marginTop: 10 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(12,11,10,0.94)',
    borderTopWidth: 1,
    borderTopColor: '#1f1c19',
  },
  barBtn: { flex: 1, height: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  barText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 21, letterSpacing: -0.4 },
  sheetClose: { color: colors.blue, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  sheetSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  preview: { marginTop: 14, maxHeight: 330, borderRadius: 16, backgroundColor: colors.inset, borderWidth: 1, borderColor: colors.line },
  previewText: { padding: 14, color: colors.text2, fontFamily: fonts.mono, fontSize: 11.5, lineHeight: 18 },
  sheetBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  sheetBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', paddingHorizontal: 22 },
  modal: { backgroundColor: colors.sheetInner, borderRadius: 26, padding: 22, borderWidth: 1, borderColor: '#2f2a26' },
  mIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.4, marginTop: 14 },
  mBody: { color: colors.text2, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 8 },
  mNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 10 },
  mBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  busyTrack: { height: 4, borderRadius: 2, backgroundColor: colors.line2, overflow: 'hidden' },
  busyFill: { height: '100%', width: '60%', borderRadius: 2, backgroundColor: colors.amber },
});
