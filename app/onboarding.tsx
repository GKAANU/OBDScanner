import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useGarage } from '../src/garage/store';
import { FUELS, type Fuel } from '../src/garage/types';
import { useOBD } from '../src/obd/context';
import { Icon, LogoMark } from '../src/ui/icons';
import { Button, Card, Divider } from '../src/ui/primitives';
import { colors, fonts, tabular } from '../src/ui/theme';
import { formatThousands, parseKm, todayISO } from '../src/utils/format';

type Step = 'splash' | 'car' | 'dongle';

type Form = { name: string; brand: string; model: string; year: string; km: string; plate: string; fuel: Fuel };

export default function Onboarding() {
  const { vehicle: current, saveVehicle, addVehicle } = useGarage();
  const { state, hydrated } = useOBD();
  // mode=add: a new (additional) vehicle; start empty and skip the splash.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isAdd = mode === 'add';
  const vehicle = isAdd ? null : current;
  const [step, setStep] = useState<Step>(vehicle || isAdd ? 'car' : 'splash');
  const finished = useRef(false);
  const [form, setForm] = useState<Form>(() => ({
    name: vehicle?.name ?? '',
    brand: vehicle?.brand ?? '',
    model: vehicle?.model ?? '',
    year: vehicle?.year ? String(vehicle.year) : '',
    km: vehicle ? formatThousands(vehicle.km) : '',
    plate: vehicle?.plate ?? '',
    fuel: vehicle?.fuel ?? 'Benzin',
  }));
  const [connectRequested, setConnectRequested] = useState(false);

  const set = (k: keyof Form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: k === 'km' ? (parseKm(v) != null ? formatThousands(parseKm(v) ?? 0) : '') : v }));

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const km = parseKm(form.km) ?? 0;
    const y = parseInt(form.year, 10);
    (isAdd ? addVehicle : saveVehicle)({
      name: form.name.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      year: y >= 1950 && y <= 2100 ? y : null,
      plate: form.plate.trim().toLocaleUpperCase('tr'),
      km,
      kmUpdatedAt: todayISO(),
      kmSource: 'manual',
      fuel: form.fuel,
    });
    router.replace('/');
  };

  // Connected from step 2: continue into the app.
  useEffect(() => {
    if (connectRequested && state === 'ready') finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectRequested, state]);

  const goDongle = () => {
    if (!form.name.trim() || !form.brand.trim()) {
      Alert.alert('Eksik bilgi', 'Aracına bir ad ve marka gir.');
      return;
    }
    if (parseKm(form.km) == null) {
      Alert.alert('Eksik bilgi', 'Güncel kilometreyi gir. Bakım planı buna göre hesaplanır.');
      return;
    }
    setStep('dongle');
  };

  if (step === 'splash') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.splash}>
          <View style={styles.splashCenter}>
            <View style={styles.logoTile}>
              <LogoMark size={60} />
            </View>
            <Text style={styles.splashName}>otova</Text>
            <Text style={styles.splashTag}>Aracın için sakin bir asistan.</Text>
          </View>
          <Button label="Başla" onPress={() => setStep('car')} style={styles.cta} />
          <View style={styles.lockRow}>
            <Icon name="lock" size={12} color={colors.muted} />
            <Text style={styles.lockText}>İnternete çıkmaz. Her şey bu iPhone'da kalır.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'car') {
    const fields: Array<{ k: keyof Form; label: string; ph: string; kb?: KeyboardTypeOptions; caps?: 'characters' | 'words' }> = [
      { k: 'name', label: 'Ad', ph: 'Clio', caps: 'words' },
      { k: 'brand', label: 'Marka', ph: 'Renault', caps: 'words' },
      { k: 'model', label: 'Model', ph: 'Clio V', caps: 'words' },
      { k: 'year', label: 'Yıl', ph: '2021', kb: 'number-pad' },
      { k: 'km', label: 'Kilometre', ph: '48.612', kb: 'number-pad' },
      { k: 'plate', label: 'Plaka', ph: '34 ABC 123', caps: 'characters' },
    ];
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.page}>
            <Progress n={1} />
            <View style={styles.stepRow}>
              <Text style={styles.stepLabelInline}>{isAdd ? 'Yeni araç · adım 1 / 2' : 'Adım 1 / 2'}</Text>
              {isAdd ? (
                <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={8}>
                  <Text style={styles.link}>Vazgeç</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.h1}>{isAdd ? 'Yeni araç ekle' : 'Aracını ekle'}</Text>
            <Text style={styles.lede}>Bakım planı ve hatırlatmalar bu bilgilerle hesaplanır.</Text>
            <ScrollView style={styles.flex} contentContainerStyle={{ paddingTop: 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Card>
                {fields.map((f, i) => (
                  <View key={f.k}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>{f.label}</Text>
                      <TextInput
                        value={form[f.k]}
                        onChangeText={set(f.k)}
                        placeholder={f.ph}
                        placeholderTextColor={colors.faint}
                        keyboardType={f.kb ?? 'default'}
                        autoCapitalize={f.caps ?? 'none'}
                        autoCorrect={false}
                        returnKeyType="done"
                        style={[styles.fieldInput, tabular]}
                      />
                    </View>
                  </View>
                ))}
              </Card>
              <Text style={styles.fuelLabel}>Yakıt</Text>
              <View style={styles.fuels}>
                {FUELS.map((fu) => {
                  const on = form.fuel === fu;
                  return (
                    <Pressable
                      key={fu}
                      onPress={() => setForm((f) => ({ ...f, fuel: fu }))}
                      style={[styles.fuelChip, on && styles.fuelChipOn]}
                    >
                      <Text style={[styles.fuelText, on && styles.fuelTextOn]}>{fu}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <Button label="Devam" onPress={goDongle} style={styles.cta} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const busy = state === 'connecting' || state === 'initializing';
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <Progress n={2} />
        <View style={styles.stepRow}>
          <Text style={styles.stepLabelInline}>Adım 2 / 2 · isteğe bağlı</Text>
          <Pressable onPress={() => setStep('car')} hitSlop={8}>
            <Text style={styles.link}>Geri</Text>
          </Pressable>
        </View>
        <Text style={styles.h1}>Dongle'ı bağla</Text>
        <Text style={styles.lede}>
          {form.name.trim() || 'Aracın'} şimdiden hazır. Dongle bağladığında araçtan okunan verileri de görürsün.
        </Text>
        <View style={styles.twoCol}>
          <Card style={styles.miniCard}>
            <Text style={[styles.miniTitle, { color: colors.ok }]}>Şimdi hazır</Text>
            {['Bakım planı', 'Muayene, sigorta, MTV', 'Servis geçmişi'].map((t) => (
              <Text key={t} style={styles.miniItem}>{t}</Text>
            ))}
          </Card>
          <Card style={styles.miniCard}>
            <Text style={[styles.miniTitle, { color: colors.amber }]}>Dongle ile</Text>
            {['Arıza kodları', 'Canlı veri', 'Sağlık ve muayene kontrolü'].map((t) => (
              <Text key={t} style={styles.miniItem}>{t}</Text>
            ))}
          </Card>
        </View>
        <Card style={{ marginTop: 12 }}>
          {[
            "Dongle'ı direksiyon altındaki OBD soketine tak, kontağı aç.",
            "Bağlan'a dokun; Bluetooth ya da Wi-Fi dongle'ını birlikte bulalım.",
            "Bağlanınca araç verileri gelir; istersen sonra da bağlanabilirsin.",
          ].map((t, i) => (
            <View key={t}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.stepItem}>
                <Text style={[styles.stepNum, tabular]}>{i + 1}</Text>
                <Text style={styles.stepText}>{t}</Text>
              </View>
            </View>
          ))}
        </Card>
        {state === 'error' && connectRequested ? (
          <Text style={styles.error}>Bağlanamadı. Tekrar dene ya da sonra bağlan.</Text>
        ) : null}
        <View style={styles.flex} />
        <Button
          label={busy ? 'Bağlanıyor…' : 'Bağlan'}
          loading={busy}
          disabled={!hydrated}
          onPress={() => {
            setConnectRequested(true);
            router.push('/baglan');
          }}
        />
        <Pressable onPress={finish} style={styles.later}>
          <Text style={styles.laterText}>Sonra</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Progress({ n }: { n: 1 | 2 }) {
  return (
    <View style={styles.progress}>
      <View style={[styles.progressBar, { backgroundColor: colors.blue }]} />
      <View style={[styles.progressBar, { backgroundColor: n === 2 ? colors.blue : colors.line }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  splash: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24 },
  splashCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  logoTile: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#1a1816',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 24 },
  },
  splashName: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 40, letterSpacing: -1.8 },
  splashTag: { color: colors.muted, fontFamily: fonts.body, fontSize: 15 },
  cta: { alignSelf: 'stretch', height: 52, borderRadius: 16, marginTop: 16 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  lockText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  progress: { flexDirection: 'row', gap: 6 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  stepLabelInline: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  link: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 14 },
  h1: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 30, letterSpacing: -0.9, marginTop: 6 },
  lede: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 16 },
  fieldLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, width: 96 },
  fieldInput: { flex: 1, color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15, textAlign: 'right', paddingVertical: 0 },
  fuelLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13, marginTop: 20, marginBottom: 10, marginHorizontal: 4 },
  fuels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  fuelChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#171513',
    justifyContent: 'center',
  },
  fuelChipOn: { borderColor: colors.blue, backgroundColor: colors.blueBg },
  fuelText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  fuelTextOn: { color: colors.text },
  twoCol: { flexDirection: 'row', gap: 10, marginTop: 20 },
  miniCard: { flex: 1, padding: 14, borderRadius: 18, gap: 8 },
  miniTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, marginBottom: 2 },
  miniItem: { color: colors.text, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  stepItem: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  stepNum: { color: colors.faint, fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 20 },
  stepText: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  error: { color: colors.error, fontFamily: fonts.body, fontSize: 13, marginTop: 12 },
  later: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  laterText: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
});
