import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useOBD } from '../../../src/obd/context';
import { TESTER_UNLOCK_ALLOWED, usePro } from '../../../src/pro/entitlement';
import { useGarage } from '../../../src/garage/store';
import { useDueDates } from '../../../src/garage/usePlan';
import { daysText } from '../../../src/garage/dates';
import { FUELS, type Fuel, type Vehicle } from '../../../src/garage/types';
import { Icon, LogoMark, type IconName } from '../../../src/ui/icons';
import { Button, Card, Screen, ScreenTitle, Sheet, Toggle } from '../../../src/ui/primitives';
import { colors, fonts } from '../../../src/ui/theme';
import { formatThousands, parseKm, todayISO } from '../../../src/utils/format';

type Row = { key: string; title: string; sub: string; icon: IconName; iconColor?: string; onPress: () => void };

export default function DahaScreen() {
  const { state, config } = useOBD();
  const { vehicle, vehicles } = useGarage();
  const { isPro, testerPro, setDevPro } = usePro();
  const due = useDueDates();
  const [editOpen, setEditOpen] = useState(false);

  const first = due[0];
  const docSub = first ? `${first.name} ${daysText(first.days)} · sigorta · kasko · MTV` : 'Muayene, sigorta, kasko, MTV';
  const endpoint = config.demo ? 'Demo' : config.link === 'ble' && config.bleId ? `Bluetooth · ${config.bleName || 'adaptör'}` : `${config.host}:${config.port}`;
  const connected = state === 'ready';

  const rows: Row[] = [
    {
      key: 'araclar',
      title: 'Araçlarım',
      sub: vehicles.length > 1 ? `${vehicles.length} araç · ${vehicle?.name ?? ''}` : vehicle?.name ?? 'Araç ekle',
      icon: 'tabGaraj',
      onPress: () => router.push('/daha/araclar'),
    },
    {
      key: 'hatirlatmalar',
      title: 'Hatırlatmalar',
      sub: 'Muayene, sigorta, MTV, bakım',
      icon: 'clock',
      onPress: () => router.push('/daha/hatirlatmalar'),
    },
    { key: 'arac', title: 'Araç bilgisi', sub: "VIN, ECU, kalibrasyon, desteklenen PID'ler", icon: 'idCard', onPress: () => router.push('/daha/arac') },
    { key: 'belgeler', title: 'Belgeler ve tarihler', sub: docSub, icon: 'doc', onPress: () => router.push('/daha/belgeler') },
    { key: 'aku', title: 'Akü testi', sub: 'Dinlenme, marş ve şarj voltajı', icon: 'battery', onPress: () => router.push('/daha/aku') },
    { key: 'ikinciel', title: 'İkinci el kontrolü', sub: 'Kodlar yakın zamanda silinmiş mi?', icon: 'shield', onPress: () => router.push('/daha/ikinciel') },
    { key: 'terminal', title: 'Terminal', sub: 'İleri düzey · ELM327 komutları', icon: 'terminal', onPress: () => router.push('/daha/terminal') },
    {
      key: 'baglanti',
      title: 'Bağlantı ayarları',
      sub: `${connected ? 'Bağlı' : 'Bağlı değil'} · ${endpoint}`,
      icon: config.link === 'ble' ? 'bluetooth' : 'wifi',
      iconColor: connected ? colors.ok : undefined,
      onPress: () => router.push('/daha/baglanti'),
    },
  ];

  return (
    <Screen>
      <ScreenTitle title="Daha fazla" />

      <Card hero onPress={isPro ? undefined : () => router.push('/pro')} style={styles.proCard}>
        <View style={styles.proMark}>
          <LogoMark size={26} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.proTitle}>{isPro ? 'Otova Pro aktif' : "Pro'ya geç"}</Text>
          <Text style={styles.rowSub} numberOfLines={2}>
            {isPro
              ? 'Tüm özellikler açık. Desteğin için teşekkürler.'
              : 'Kod detayları, akü testi, ikinci el raporu, çoklu araç ve PDF.'}
          </Text>
        </View>
        {isPro ? (
          <Icon name="check" size={18} color={colors.ok} stroke={2.4} />
        ) : (
          <Icon name="chevronRight" size={13} color={colors.faint} stroke={2.2} />
        )}
      </Card>

      {TESTER_UNLOCK_ALLOWED ? (
        <Card style={styles.tester}>
          <View style={{ flex: 1 }}>
            <Text style={styles.proTitleSmall}>Test için Pro'yu aç</Text>
            <Text style={styles.rowSub}>Sadece TestFlight sürümünde görünür; App Store sürümünde yoktur.</Text>
          </View>
          <Toggle on={testerPro} onChange={setDevPro} />
        </Card>
      ) : null}

      <Card style={{ marginTop: 10 }}>
        {rows.map((r, i) => (
          <MenuRow key={r.key} row={r} first={i === 0} />
        ))}
      </Card>

      {vehicle ? (
        <Card style={{ marginTop: 10 }}>
          <MenuRow
            first
            row={{
              key: 'edit',
              title: 'Aracı düzenle',
              sub: [vehicle.name, vehicle.brand, vehicle.model, vehicle.year ?? ''].filter(Boolean).join(' · '),
              icon: 'tabGaraj',
              onPress: () => setEditOpen(true),
            }}
          />
        </Card>
      ) : null}

      <View style={styles.footer}>
        <LogoMark size={22} color={colors.muted} />
        <Text style={styles.footerText}>otova 1.0{'\n'}İnternete çıkmaz, veriler bu iPhone'da kalır.</Text>
      </View>

      {vehicle ? <VehicleSheet visible={editOpen} vehicle={vehicle} onClose={() => setEditOpen(false)} /> : null}
    </Screen>
  );
}

function MenuRow({ row, first }: { row: Row; first?: boolean }) {
  return (
    <Pressable onPress={row.onPress} style={({ pressed }) => [styles.row, !first && styles.rowBorder, pressed && { opacity: 0.7 }]}>
      <View style={styles.iconTile}>
        <Icon name={row.icon} size={18} color={row.iconColor ?? colors.text2} stroke={1.6} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle}>{row.title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {row.sub}
        </Text>
      </View>
      <Icon name="chevronRight" size={13} color={colors.faint} stroke={2.2} />
    </Pressable>
  );
}

function VehicleSheet({ visible, vehicle, onClose }: { visible: boolean; vehicle: Vehicle; onClose: () => void }) {
  const { saveVehicle } = useGarage();
  const [form, setForm] = useState({
    name: vehicle.name,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year ? String(vehicle.year) : '',
    plate: vehicle.plate,
    km: formatThousands(vehicle.km),
  });
  const [fuel, setFuel] = useState<Fuel>(vehicle.fuel);

  // Refresh the form each time the sheet opens.
  const [lastVisible, setLastVisible] = useState(visible);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setForm({
        name: vehicle.name,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year ? String(vehicle.year) : '',
        plate: vehicle.plate,
        km: formatThousands(vehicle.km),
      });
      setFuel(vehicle.fuel);
    }
  }

  const fields: Array<{ k: keyof typeof form; label: string; ph: string; numeric?: boolean }> = [
    { k: 'name', label: 'Ad', ph: 'Clio' },
    { k: 'brand', label: 'Marka', ph: 'Renault' },
    { k: 'model', label: 'Model', ph: 'Clio V' },
    { k: 'year', label: 'Yıl', ph: '2021', numeric: true },
    { k: 'plate', label: 'Plaka', ph: '34 ABC 123' },
    { k: 'km', label: 'Kilometre', ph: '48.612', numeric: true },
  ];

  const save = () => {
    if (!form.name.trim() || !form.brand.trim()) {
      Alert.alert('Eksik bilgi', 'Ad ve marka boş olamaz.');
      return;
    }
    const year = form.year ? parseInt(form.year, 10) : null;
    if (year != null && (isNaN(year) || year < 1950 || year > 2100)) {
      Alert.alert('Geçersiz yıl', 'Model yılını 4 haneli gir.');
      return;
    }
    const km = parseKm(form.km) ?? vehicle.km;
    const kmChanged = km !== vehicle.km;
    saveVehicle({
      ...vehicle,
      name: form.name.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      year,
      plate: form.plate.trim().toLocaleUpperCase('tr'),
      fuel,
      km,
      kmSource: kmChanged ? 'manual' : vehicle.kmSource,
      kmUpdatedAt: kmChanged ? todayISO() : vehicle.kmUpdatedAt,
    });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.sheetHeader}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.sheetLink}>Vazgeç</Text>
        </Pressable>
        <Text style={styles.sheetTitle}>Aracı düzenle</Text>
        <Pressable onPress={save} hitSlop={8}>
          <Text style={[styles.sheetLink, { fontFamily: fonts.bodySemiBold }]}>Kaydet</Text>
        </Pressable>
      </View>
      <View style={styles.formCard}>
        {fields.map((f, i) => (
          <View key={f.k} style={[styles.formRow, i > 0 && styles.formBorder]}>
            <Text style={styles.formLabel}>{f.label}</Text>
            <TextInput
              value={form[f.k]}
              onChangeText={(v) => {
                let next = v;
                if (f.k === 'km') {
                  const n = parseKm(v);
                  next = n == null ? '' : formatThousands(n);
                }
                if (f.k === 'year') next = v.replace(/\D/g, '').slice(0, 4);
                setForm((s) => ({ ...s, [f.k]: next }));
              }}
              placeholder={f.ph}
              placeholderTextColor={colors.faint}
              keyboardType={f.numeric ? 'number-pad' : 'default'}
              autoCapitalize={f.k === 'plate' ? 'characters' : 'words'}
              autoCorrect={false}
              style={styles.formInput}
            />
          </View>
        ))}
      </View>
      <Text style={styles.fuelLabel}>Yakıt</Text>
      <View style={styles.fuels}>
        {FUELS.map((n) => {
          const on = fuel === n;
          return (
            <Pressable
              key={n}
              onPress={() => setFuel(n)}
              style={[styles.fuel, on ? { borderColor: colors.blue, backgroundColor: colors.blueBg } : null]}
            >
              <Text style={[styles.fuelText, { color: on ? colors.text : colors.muted }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>Yakıt tipi ve marka değişirse bakım planı yeniden hesaplanır.</Text>
      <Button label="Kaydet" onPress={save} style={{ marginTop: 18 }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tester: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 10, borderColor: 'rgba(251,191,36,0.35)' },
  proTitleSmall: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  proCard: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderColor: 'rgba(251,191,36,0.28)' },
  proMark: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.inset, alignItems: 'center', justifyContent: 'center' },
  proTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  iconTile: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  rowSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginTop: 2 },
  footer: { alignItems: 'center', gap: 8, marginTop: 32 },
  footerText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  sheetLink: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16 },
  formCard: { marginTop: 18, backgroundColor: colors.sheetInner, borderRadius: 16, overflow: 'hidden' },
  formRow: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 14 },
  formBorder: { borderTopWidth: 1, borderTopColor: colors.line2 },
  formLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, width: 90 },
  formInput: { flex: 1, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15, textAlign: 'right', paddingVertical: 0 },
  fuelLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13, marginTop: 20, marginBottom: 10, marginHorizontal: 4 },
  fuels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fuel: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: '#171513', justifyContent: 'center' },
  fuelText: { fontFamily: fonts.bodyMedium, fontSize: 14 },
  note: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, marginTop: 12, marginHorizontal: 4 },
});
