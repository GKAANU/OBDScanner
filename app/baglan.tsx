import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useOBD } from '../src/obd/context';
import { ensureBleReady, scanBle, type BleScanItem } from '../src/obd/ble';
import { OBDError, userMessage } from '../src/obd/protocol';
import { CopyLogButton } from '../src/ui/DiagLogSection';
import { Icon, type IconName } from '../src/ui/icons';
import { Button, Card, Chip, Divider, LinkButton, Sheet } from '../src/ui/primitives';
import { colors, fonts } from '../src/ui/theme';

/**
 * "Dongle'ı bağla": a guided connection flow for Wi-Fi and Bluetooth LE
 * adapters, with plain troubleshooting when nothing is found. Classic
 * Bluetooth adapters cannot work on iPhone; the flow says so and points to
 * compatible ones instead of failing silently.
 */

type Step = 'choose' | 'ble' | 'wifi' | 'unsure';
const SCAN_MS = 12000;

export default function BaglanScreen() {
  const router = useRouter();
  const { state, config, connect, autoDetect, disconnect, statusText, errorMessage, adapterVersion, protocolName, hydrated } = useOBD();
  const [step, setStep] = useState<Step>('choose');
  const [compatOpen, setCompatOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  const busy = state === 'connecting' || state === 'initializing';
  const ready = state === 'ready';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (ready && requested) {
    return (
      <Frame onClose={close}>
        <View style={s.doneWrap}>
          <View style={s.doneIcon}>
            <Icon name="check" size={34} color={colors.ok} stroke={2.4} />
          </View>
          <Text style={s.h1}>Bağlandı</Text>
          <Text style={s.lede}>
            {[config.demo ? 'Demo' : config.link === 'ble' ? config.bleName : `${config.host}:${config.port}`, adapterVersion, protocolName]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={s.hint}>Otova bu adaptörü hatırlar; bir dahaki sefere tek dokunuşla bağlanırsın.</Text>
        </View>
        <Button label="Tamam" onPress={close} />
      </Frame>
    );
  }

  const quickLabel =
    config.link === 'ble' && config.bleId ? config.bleName || 'Bluetooth adaptör' : null;

  return (
    <Frame onClose={close}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {step !== 'choose' ? (
          <Pressable onPress={() => setStep('choose')} hitSlop={8} style={s.back}>
            <Icon name="chevronLeft" size={18} color={colors.blue} stroke={2.2} />
            <Text style={s.link}>Geri</Text>
          </Pressable>
        ) : null}
        <Text style={s.h1}>Dongle'ı bağla</Text>

        {step === 'choose' ? (
          <>
            <Text style={s.lede}>Önce dongle'ı direksiyon altındaki OBD soketine tak ve kontağı aç. Motoru çalıştırmak şart değil.</Text>
            {quickLabel && !busy ? (
              <Card style={s.quick} onPress={() => { setRequested(true); void connect({ demo: false }); }}>
                <Icon name="bluetooth" size={20} color={colors.blue} />
                <View style={s.flex}>
                  <Text style={s.rowTitle}>Son kullanılan: {quickLabel}</Text>
                  <Text style={s.rowSub}>Tek dokunuşla tekrar bağlan</Text>
                </View>
                <Icon name="chevronRight" size={14} color={colors.faint} stroke={2.2} />
              </Card>
            ) : null}
            <Text style={s.question}>Dongle'ın hangisi?</Text>
            <Option icon="bluetooth" title="Bluetooth" sub="Üstünde Bluetooth simgesi var ya da kutusunda Bluetooth / BLE yazıyor" onPress={() => setStep('ble')} />
            <Option icon="wifi" title="Wi-Fi" sub="Telefonun Wi-Fi listesinde OBDII, WiFi_OBDII, V-LINK gibi bir ağ çıkıyor" onPress={() => setStep('wifi')} />
            <Option icon="question" title="Emin değilim" sub="Biz bulmaya çalışalım" onPress={() => setStep('unsure')} />
            <View style={s.footerLinks}>
              <LinkButton label="Hangi dongle'lar iPhone'da çalışır?" onPress={() => setCompatOpen(true)} />
              <LinkButton
                label="Dongle'ım yok, demo ile dene"
                onPress={() => {
                  setRequested(true);
                  void connect({ demo: true });
                }}
              />
            </View>
          </>
        ) : null}

        {step === 'ble' || step === 'unsure' ? (
          <BleStep
            unsure={step === 'unsure'}
            busy={busy}
            hydrated={hydrated}
            error={requested && state === 'error' ? errorMessage : null}
            statusText={statusText}
            onPick={(d) => {
              setRequested(true);
              if (state !== 'idle' && state !== 'error') disconnect();
              void connect({ demo: false, link: 'ble', bleId: d.id, bleName: d.name });
            }}
            onWifi={() => setStep('wifi')}
            onCompat={() => setCompatOpen(true)}
          />
        ) : null}

        {step === 'wifi' ? (
          <WifiStep
            busy={busy}
            hydrated={hydrated}
            error={requested && state === 'error' ? errorMessage : null}
            statusText={statusText}
            onFind={() => {
              setRequested(true);
              void autoDetect({ host: config.host, port: config.port });
            }}
            onManual={() => router.push('/daha/baglanti')}
            onCompat={() => setCompatOpen(true)}
          />
        ) : null}
      </ScrollView>
      <CompatSheet visible={compatOpen} onClose={() => setCompatOpen(false)} />
    </Frame>
  );
}

/* ---------- Bluetooth ---------- */

function BleStep({
  unsure,
  busy,
  hydrated,
  error,
  statusText,
  onPick,
  onWifi,
  onCompat,
}: {
  unsure: boolean;
  busy: boolean;
  hydrated: boolean;
  error: string | null;
  statusText: string | null;
  onPick: (d: BleScanItem) => void;
  onWifi: () => void;
  onCompat: () => void;
}) {
  const [items, setItems] = useState<BleScanItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [radioError, setRadioError] = useState<{ text: string; settings: boolean } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    stopRef.current?.();
    setRadioError(null);
    setItems([]);
    try {
      await ensureBleReady();
    } catch (e) {
      const unauthorized = e instanceof OBDError && e.code === 'BLE_UNAUTHORIZED';
      setRadioError({ text: userMessage(e), settings: unauthorized });
      return;
    }
    setScanning(true);
    stopRef.current = scanBle(setItems, (e) => {
      setScanning(false);
      setRadioError({ text: userMessage(e instanceof OBDError ? e : new OBDError('CONNECT_FAILED', String(e), { step: 'ble' })), settings: false });
    });
    setTimeout(() => {
      stopRef.current?.();
      stopRef.current = null;
      setScanning(false);
    }, SCAN_MS);
  }, []);

  useEffect(() => {
    void start();
    return () => stopRef.current?.();
  }, [start]);

  // Connecting needs the radio; stop scanning first.
  const pick = (d: BleScanItem) => {
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
    setPicked(d.id);
    onPick(d);
  };

  const likely = items.filter((i) => i.likely);
  const others = items.filter((i) => !i.likely);
  const noneFound = !scanning && likely.length === 0;

  return (
    <>
      <Text style={s.lede}>
        {unsure
          ? 'Önce yakındaki Bluetooth adaptörleri arıyoruz.'
          : "iPhone Ayarlar'da eşleştirme yapmana gerek yok; Otova adaptöre kendisi bağlanır."}
      </Text>

      {radioError ? (
        <Card style={s.warnCard}>
          <Text style={s.warnText}>{radioError.text}</Text>
          {radioError.settings ? (
            <Button label="Ayarları aç" variant="secondary" compact onPress={() => void Linking.openSettings()} style={{ marginTop: 10 }} />
          ) : (
            <Button label="Tekrar dene" variant="secondary" compact onPress={() => void start()} style={{ marginTop: 10 }} />
          )}
        </Card>
      ) : null}

      {!radioError ? (
        <View style={s.scanHead}>
          <Text style={s.question}>{likely.length ? 'Bulunan adaptörler' : 'Aranıyor'}</Text>
          {scanning ? <ActivityIndicator color={colors.blue} /> : <LinkButton label="Tekrar tara" onPress={() => void start()} />}
        </View>
      ) : null}

      {likely.length ? (
        <Card>
          {likely.map((d, i) => (
            <View key={d.id}>
              {i > 0 ? <Divider /> : null}
              <DeviceRow d={d} busy={busy && picked === d.id} disabled={busy || !hydrated} onPress={() => pick(d)} />
            </View>
          ))}
        </Card>
      ) : null}

      {busy && statusText ? <Text style={s.status}>{statusText}</Text> : null}
      {error ? (
        <Card style={s.warnCard}>
          <Text style={s.warnText}>{error}</Text>
          <View style={s.row}>
            <CopyLogButton compact />
          </View>
        </Card>
      ) : null}

      {others.length ? (
        <>
          <Pressable onPress={() => setShowAll((v) => !v)} style={s.toggleAll}>
            <Text style={s.rowSub}>{showAll ? 'Diğer cihazları gizle' : `Diğer cihazları göster (${others.length})`}</Text>
          </Pressable>
          {showAll ? (
            <Card>
              {others.map((d, i) => (
                <View key={d.id}>
                  {i > 0 ? <Divider /> : null}
                  <DeviceRow d={d} busy={busy && picked === d.id} disabled={busy || !hydrated} onPress={() => pick(d)} />
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {noneFound && !radioError ? (
        <Card style={s.tips}>
          <Text style={s.rowTitle}>{unsure ? 'Bluetooth adaptör bulunamadı' : 'Adaptör görünmüyor mu?'}</Text>
          {[
            'Dongle takılı ve kontak açık mı? Işığı yanıyor olmalı.',
            "Car Scanner gibi başka bir uygulama bağlıysa o uygulamayı tamamen kapat.",
            "Daha önce iPhone Ayarlar > Bluetooth'ta eşleştirdiysen orada 'Bu aygıtı unut' de.",
            'Hâlâ yoksa adaptörün klasik Bluetooth (2.0) olabilir: iPhone bu türe uygulamaların bağlanmasına izin vermez.',
          ].map((t) => (
            <Text key={t} style={s.tip}>
              {'•'} {t}
            </Text>
          ))}
          <View style={s.tipActions}>
            {unsure ? <Button label="Wi-Fi dongle mı? Dene" variant="secondary" compact onPress={onWifi} /> : null}
            <LinkButton label="Uyumlu dongle'lar" onPress={onCompat} />
          </View>
        </Card>
      ) : null}
    </>
  );
}

function DeviceRow({ d, busy, disabled, onPress }: { d: BleScanItem; busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.device, pressed && { opacity: 0.7 }]}>
      <View style={s.iconTile}>
        <Icon name="bluetooth" size={18} color={d.likely ? colors.blue : colors.muted} />
      </View>
      <View style={s.flex}>
        <Text style={s.rowTitle}>{d.name}</Text>
        <Text style={s.rowSub}>{signalText(d.rssi)}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.blue} />
      ) : d.likely ? (
        <Chip label="OBD adaptörü" t="blue" />
      ) : null}
    </Pressable>
  );
}

function signalText(rssi: number | null): string {
  if (rssi == null) return 'Sinyal bilinmiyor';
  if (rssi > -60) return 'Sinyal güçlü';
  if (rssi > -80) return 'Sinyal orta';
  return 'Sinyal zayıf, telefonu araca yaklaştır';
}

/* ---------- Wi-Fi ---------- */

function WifiStep({
  busy,
  hydrated,
  error,
  statusText,
  onFind,
  onManual,
  onCompat,
}: {
  busy: boolean;
  hydrated: boolean;
  error: string | null;
  statusText: string | null;
  onFind: () => void;
  onManual: () => void;
  onCompat: () => void;
}) {
  return (
    <>
      <Text style={s.lede}>Wi-Fi dongle kendi küçük ağını açar. Telefonu o ağa bağlayınca Otova adaptörü bulur.</Text>
      <Card>
        {[
          "iPhone Ayarlar > Wi-Fi'ye git ve dongle'ın ağına katıl (OBDII, WiFi_OBDII, V-LINK…). Şifre sorarsa kutuda yazar; çoğu şifresizdir.",
          "'İnternet bağlantısı yok' uyarısı normal; bu ağda kal.",
          "Otova'ya dön ve aşağıdaki düğmeye dokun.",
        ].map((t, i) => (
          <View key={t}>
            {i > 0 ? <Divider /> : null}
            <View style={s.stepItem}>
              <Text style={s.stepNum}>{i + 1}</Text>
              <Text style={s.stepText}>{t}</Text>
            </View>
          </View>
        ))}
      </Card>
      <Button label={busy ? 'Aranıyor…' : "Dongle'ı bul ve bağlan"} loading={busy} disabled={!hydrated} onPress={onFind} style={{ marginTop: 14 }} />
      {busy && statusText ? <Text style={s.status}>{statusText}</Text> : null}
      {error ? (
        <Card style={s.warnCard}>
          <Text style={s.warnText}>{error}</Text>
          <View style={s.tipActions}>
            <CopyLogButton compact />
            <LinkButton label="Elle ayarla" onPress={onManual} />
          </View>
        </Card>
      ) : null}
      <View style={s.footerLinks}>
        <LinkButton label="Wi-Fi listesinde ağ görünmüyor mu?" onPress={onCompat} />
      </View>
    </>
  );
}

/* ---------- Compatibility guide ---------- */

function CompatSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={s.sheetTitle}>iPhone ile çalışan dongle'lar</Text>
      <Text style={s.rowSub}>Otova Wi-Fi ve Bluetooth LE (4.0) ELM327 adaptörlerle çalışır.</Text>
      <Text style={[s.group, { color: colors.ok }]}>Çalışır</Text>
      {[
        ['Wi-Fi ELM327 (v1.5)', 'En ucuzu. Kutusunda "WiFi" yazar.'],
        ['Bluetooth 4.0 / BLE ELM327', 'Kutusunda "BLE", "4.0" ya da "iOS uyumlu" yazar.'],
        ['vLinker MC+ / FS (BLE)', 'Kaliteli, hızlı ve kararlı.'],
        ['Veepeak OBDCheck BLE / BLE+', 'iPhone için yaygın tercih.'],
        ['OBDLink CX / MX+', 'Üst seviye, pahalı.'],
      ].map(([t, d]) => (
        <View key={t} style={s.compatRow}>
          <Icon name="check" size={15} color={colors.ok} stroke={2.4} />
          <View style={s.flex}>
            <Text style={s.rowTitle}>{t}</Text>
            <Text style={s.rowSub}>{d}</Text>
          </View>
        </View>
      ))}
      <Text style={[s.group, { color: colors.error }]}>Çalışmaz</Text>
      {[
        ['Klasik Bluetooth (2.0) adaptörler', 'Kutusunda sadece "Bluetooth" ve "Android" yazar. Apple bu türe uygulamaların bağlanmasına izin vermez; hiçbir iPhone uygulamasıyla çalışmaz.'],
        ['Kablolu / USB adaptörler', 'Bilgisayar içindir.'],
      ].map(([t, d]) => (
        <View key={t} style={s.compatRow}>
          <Icon name="x" size={15} color={colors.error} stroke={2.4} />
          <View style={s.flex}>
            <Text style={s.rowTitle}>{t}</Text>
            <Text style={s.rowSub}>{d}</Text>
          </View>
        </View>
      ))}
      <Text style={s.hint}>Alırken açıklamada "iOS" ya da "iPhone uyumlu" yazdığından emin ol.</Text>
      <Button label="Tamam" variant="secondary" onPress={onClose} style={{ marginTop: 14 }} />
    </Sheet>
  );
}

/* ---------- Layout bits ---------- */

function Frame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.topBar}>
        <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}>
          <Icon name="x" size={14} color={colors.muted} stroke={2.6} />
        </Pressable>
      </View>
      <View style={s.body}>{children}</View>
    </SafeAreaView>
  );
}

function Option({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Card style={s.option} onPress={onPress}>
      <View style={s.iconTile}>
        <Icon name={icon} size={20} color={colors.text} />
      </View>
      <View style={s.flex}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={14} color={colors.faint} stroke={2.2} />
    </Card>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 16 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 12 },
  scroll: { paddingBottom: 32 },
  flex: { flex: 1, minWidth: 0 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -6, marginBottom: 6 },
  link: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16 },
  h1: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 30, letterSpacing: -0.9, lineHeight: 35 },
  lede: { color: colors.muted, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, marginTop: 8, marginBottom: 16 },
  question: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16, marginTop: 8, marginBottom: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10, borderColor: 'rgba(59,130,246,0.35)' },
  iconTile: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  rowSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  footerLinks: { gap: 14, marginTop: 14, alignItems: 'flex-start' },
  scanHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  device: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  toggleAll: { paddingVertical: 12, paddingHorizontal: 4 },
  status: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12, marginTop: 10 },
  warnCard: { padding: 14, marginTop: 12, borderColor: 'rgba(245,158,11,0.3)' },
  warnText: { color: colors.text2, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', marginTop: 10 },
  tips: { padding: 16, marginTop: 12, gap: 8 },
  tip: { color: colors.text2, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
  tipActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' },
  stepItem: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  stepNum: { color: colors.faint, fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 20, width: 12 },
  stepText: { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, flex: 1 },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.okBg, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  hint: { color: colors.faint, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  sheetTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 22, letterSpacing: -0.4, marginBottom: 4 },
  group: { fontFamily: fonts.bodySemiBold, fontSize: 13, marginTop: 18, marginBottom: 8 },
  compatRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
});
