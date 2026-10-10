import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PRO_LIFETIME, PRO_YEARLY, TESTER_UNLOCK_ALLOWED, usePro, type ProFeature } from '../src/pro/entitlement';
import { useOBD } from '../src/obd/context';
import { useToast } from '../src/ui/toast';
import { Icon, LogoMark } from '../src/ui/icons';
import { Button, Toggle } from '../src/ui/primitives';
import { colors, fonts, tabular } from '../src/ui/theme';

const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
// TODO(user): publish the privacy policy at this address before App Review.
const PRIVACY_URL = 'https://otova.app/gizlilik';

const WHY: Record<ProFeature, string> = {
  'dtc-detail': 'Tüm kodların Türkçe detayı ve "sürmeye devam" yorumu Pro\'da.',
  'freeze-frame': 'Kod oluştuğu andaki değerler Pro\'da.',
  inspection: 'Muayene kontrolünün nedenleri Pro\'da.',
  'live-all': 'Tüm canlı sensörler ve grafikler Pro\'da.',
  battery: 'Akü ve şarj testi Pro\'da.',
  'used-car': 'İkinci el kontrolü Pro\'da.',
  terminal: 'Terminal Pro\'da.',
  'full-report': 'Tam rapor Pro\'da.',
  pdf: 'PDF rapor ve paylaşım Pro\'da.',
  'multi-vehicle': 'Birden fazla araç Pro\'da.',
  history: 'Sınırsız servis geçmişi Pro\'da.',
  intervals: 'Bakım aralıklarını düzenlemek Pro\'da.',
  reminders: 'Hatırlatmalar Pro\'da.',
};

const BENEFITS = [
  'Tüm kodlar için Türkçe detay ve "sürmeye devam" yorumu',
  'Kod anındaki değerler (freeze frame)',
  'Muayene kontrolü nedenleriyle',
  'Tüm canlı sensörler ve grafikler',
  'Akü ve şarj testi',
  'İkinci el kontrolü ve PDF rapor',
  'Sınırsız araç',
  'Sınırsız servis geçmişi ve dışa aktarma',
  'Hatırlatmalar',
  'Terminal',
];

function isFeature(v: unknown): v is ProFeature {
  return typeof v === 'string' && v in WHY;
}

export default function ProScreen() {
  const { f } = useLocalSearchParams<{ f?: string }>();
  const { isPro, products, busy, error, buy, restore, setDevPro, testerPro } = usePro();
  const { state } = useOBD();
  const toast = useToast();
  const [selected, setSelected] = useState<string>(PRO_LIFETIME);
  const wasPro = useRef(isPro);

  // Purchase or restore finished while the paywall is open.
  useEffect(() => {
    if (isPro && !wasPro.current) {
      toast('Otova Pro açıldı');
      if (router.canGoBack()) router.back();
    }
    wasPro.current = isPro;
  }, [isPro, toast]);

  useEffect(() => {
    if (products.length && !products.some((p) => p.id === selected)) setSelected(products[0].id);
  }, [products, selected]);

  const onDongle = state === 'ready' || state === 'connecting' || state === 'initializing';

  const onRestore = async () => {
    const ok = await restore();
    toast(ok ? 'Pro geri yüklendi' : 'Satın alım bulunamadı');
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.close}>
          <Icon name="x" size={14} color={colors.muted} stroke={2.6} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.logoTile}>
          <LogoMark size={44} />
        </View>
        <Text style={s.title}>Otova Pro</Text>
        <Text style={s.pitch}>Aracını anla, takip et, sat.</Text>
        {isFeature(f) ? (
          <View style={s.why}>
            <Text style={s.whyText}>{WHY[f]}</Text>
          </View>
        ) : null}

        <View style={s.card}>
          {BENEFITS.map((b, i) => (
            <View key={b} style={[s.benefit, i > 0 && s.benefitBorder]}>
              <View style={s.check}>
                <Icon name="check" size={12} color={colors.ok} stroke={3} />
              </View>
              <Text style={s.benefitText}>{b}</Text>
            </View>
          ))}
        </View>

        {isPro ? (
          <View style={[s.notice, { borderColor: 'rgba(34,197,94,0.3)' }]}>
            <Text style={[s.noticeTitle, { color: colors.ok }]}>Otova Pro açık</Text>
            <Text style={s.noticeBody}>Tüm özellikler kullanımında. Teşekkürler.</Text>
          </View>
        ) : products.length === 0 ? (
          <View style={s.notice}>
            <Text style={s.noticeTitle}>Fiyatlar yüklenemedi</Text>
            <Text style={s.noticeBody}>App Store'a ulaşmak için internet gerekir.</Text>
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 18 }}>
            {products.map((p) => {
              const on = p.id === selected;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSelected(p.id)}
                  style={[s.product, on && s.productOn]}
                >
                  <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                  <View style={{ flex: 1 }}>
                    <View style={s.productHead}>
                      <Text style={s.productTitle}>{p.kind === 'lifetime' ? 'Ömür boyu' : 'Yıllık'}</Text>
                      {p.kind === 'lifetime' ? (
                        <View style={s.badge}>
                          <Text style={s.badgeText}>Bir kez öde, hep senin</Text>
                        </View>
                      ) : null}
                    </View>
                    {p.kind === 'yearly' ? (
                      <Text style={s.productNote}>Abonelik otomatik yenilenir, App Store ayarlarından iptal edebilirsin.</Text>
                    ) : null}
                  </View>
                  <Text style={[s.price, tabular]}>{p.price}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {!isPro && (onDongle || products.length === 0) ? (
          <View style={s.wifi}>
            <Icon name="wifi" size={16} color={colors.warn} stroke={1.8} />
            <Text style={s.wifiText}>
              Dongle'ın Wi-Fi ağındayken App Store'a ulaşılamaz. Satın almadan önce internete bağlı bir ağa geç.
            </Text>
          </View>
        ) : null}

        {error ? <Text style={s.error}>{error}</Text> : null}

        {!isPro ? (
          <Button
            label="Devam et"
            onPress={() => void buy(selected === PRO_YEARLY ? PRO_YEARLY : PRO_LIFETIME)}
            loading={busy}
            disabled={products.length === 0}
            style={{ marginTop: 18, height: 52 }}
          />
        ) : null}

        <Pressable onPress={() => void onRestore()} disabled={busy} style={s.restore} hitSlop={6}>
          <Text style={s.link}>Satın alımları geri yükle</Text>
        </Pressable>

        <View style={s.legal}>
          <Pressable onPress={() => void Linking.openURL(TERMS_URL)} hitSlop={6}>
            <Text style={s.legalLink}>Kullanım koşulları</Text>
          </Pressable>
          <Text style={s.legalDot}>·</Text>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} hitSlop={6}>
            <Text style={s.legalLink}>Gizlilik</Text>
          </Pressable>
        </View>

        {TESTER_UNLOCK_ALLOWED ? (
          <View style={s.dev}>
            <Text style={s.devText}>Test sürümü: Pro'yu satın almadan aç</Text>
            <Toggle on={testerPro} onChange={setDevPro} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  logoTile: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: '#1a1816',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 4,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 32,
    letterSpacing: -1.1,
    textAlign: 'center',
    marginTop: 16,
  },
  pitch: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, textAlign: 'center', marginTop: 6 },
  why: {
    marginTop: 16,
    backgroundColor: colors.amberBg,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  whyText: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 14, textAlign: 'center' },
  card: {
    marginTop: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingHorizontal: 16,
  },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  benefitBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(34,197,94,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20 },
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  productOn: { borderColor: colors.blue, backgroundColor: colors.blueBg },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.faint2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.blue },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.blue },
  productHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  productTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.amberBg },
  badgeText: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 11 },
  productNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 4 },
  price: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  notice: {
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  noticeTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  noticeBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  wifi: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.warnBg,
  },
  wifiText: { flex: 1, color: colors.text2, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  error: { color: colors.error, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 12 },
  restore: { alignSelf: 'center', marginTop: 16, paddingVertical: 4 },
  link: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 14 },
  legal: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14 },
  legalLink: { color: colors.faint, fontFamily: fonts.body, fontSize: 12, textDecorationLine: 'underline' },
  legalDot: { color: colors.faint, fontSize: 12 },
  dev: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
  },
  devText: { color: colors.faint, fontFamily: fonts.mono, fontSize: 12 },
});
