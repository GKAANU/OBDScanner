import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useOBD } from '../../../src/obd/context';
import { userMessage } from '../../../src/obd/protocol';
import { usedCarCheck, type UsedCarRow } from '../../../src/obd/health';
import type { OBDClient } from '../../../src/obd/client';
import { useGarage } from '../../../src/garage/store';
import { useCopy } from '../../../src/ui/copy';
import { Icon, type IconName } from '../../../src/ui/icons';
import { Button, Card, Screen } from '../../../src/ui/primitives';
import { ConnectCard, SubHeader } from '../../../src/ui/SubHeader';
import { colors, fonts, tabular, tone } from '../../../src/ui/theme';
import { formatTimestamp } from '../../../src/utils/format';
import { router } from 'expo-router';
import type { ScanSummary } from '../../../src/garage/types';
import { usePro } from '../../../src/pro/entitlement';
import { usedCarReportHtml } from '../../../src/report/html';
import { sharePdf } from '../../../src/report/share';
import { useToast } from '../../../src/ui/toast';

type Result = { rows: UsedCarRow[]; flags: number; at: string; scan: ScanSummary };

const CHECKS = [
  'Arıza lambası ve kayıtlı kodlar',
  'Kalıcı kodlar: silinse bile kalan geçmiş arıza izi',
  'Kodlar silindiğinden beri gidilen mesafe',
  'Son silmeden beri ısınma döngüsü',
  'Hazırlık monitörleri',
  'ECU kilometresi ile girilen kilometre farkı',
];

/** A numeric PID, or null when the car does not support / answer it. */
async function numericPid(client: OBDClient, id: string): Promise<number | null> {
  try {
    const r = await client.readPid(id);
    return r.status === 'ok' && typeof r.value === 'number' ? r.value : null;
  } catch {
    return null;
  }
}

export default function IkinciElScreen() {
  const { state, client, battery } = useOBD();
  const { vehicle } = useGarage();
  const { isPro } = usePro();
  const copy = useCopy();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (state !== 'ready') return;
    setLoading(true);
    setError(null);
    try {
      const readiness = await client.readReadiness();
      const stored = await client.readDTCs('stored');
      const permanent = await client.readDTCs('permanent');
      const kmSinceClear = await numericPid(client, 'DCLR');
      const warmupsSinceClear = await numericPid(client, 'WUPS');
      const odo = await numericPid(client, 'ODO');
      const r = usedCarCheck({
        milOn: readiness?.milOn ?? stored.length > 0,
        stored,
        permanent,
        kmSinceClear,
        warmupsSinceClear,
        monitors: readiness?.monitors ?? [],
        odometer: odo != null ? Math.round(odo) : null,
        userKm: vehicle?.km ?? null,
      });
      const scan: ScanSummary = {
        at: new Date().toISOString(),
        stored,
        pending: [],
        permanent,
        milOn: readiness?.milOn ?? null,
        monitors: (readiness?.monitors ?? []).map((m) => ({ name: m.name, supported: m.supported, ready: m.ready })),
        battery,
      };
      setResult({ ...r, at: formatTimestamp(), scan });
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setLoading(false);
    }
  }, [client, state, vehicle?.km, battery]);

  // Run once per connection.
  const autoRef = useRef(false);
  useEffect(() => {
    if (state !== 'ready') {
      autoRef.current = false;
      return;
    }
    if (!autoRef.current && isPro) {
      autoRef.current = true;
      void run();
    }
  }, [state, run, isPro]);

  const intro = 'Satın almadan önce aracı bağla. Yakın zamanda silinmiş kodların izlerini gösterir.';

  if (!isPro) {
    return (
      <Screen>
        <SubHeader title="İkinci el kontrolü" sub={intro} />
        <Card hero style={styles.locked}>
          <View style={styles.lockedHead}>
            <Icon name="lock" size={16} color={colors.amber} />
            <Text style={styles.lockedTitle}>Otova Pro ile</Text>
          </View>
          {CHECKS.map((c) => (
            <View key={c} style={styles.checkRow}>
              <Icon name="check" size={15} color={colors.ok} stroke={2.2} />
              <Text style={styles.checkText}>{c}</Text>
            </View>
          ))}
          <Text style={styles.lockedNote}>Sonuçları satıcıya veya eksperine PDF olarak gönderebilirsin.</Text>
          <Button label="Pro'ya geç" onPress={() => router.push({ pathname: '/pro', params: { f: 'used-car' } })} style={{ marginTop: 14 }} />
        </Card>
        <Text style={styles.disclaimer}>
          Bu kontrol OBD verisine dayanır; ekspertizin yerini tutmaz. Kaporta, şasi ve mekanik durumu göstermez.
        </Text>
      </Screen>
    );
  }

  if (state !== 'ready') {
    return (
      <Screen>
        <SubHeader title="İkinci el kontrolü" sub={intro} />
        <ConnectCard
          title="Kontrol için dongle'ı bağla"
          body="Arıza lambası, kalıcı kodlar, son silmeden beri mesafe ve hazırlık monitörleri araçtan okunur."
        />
      </Screen>
    );
  }

  const reportText = result
    ? [
        `Otova ikinci el kontrolü — ${result.at}`,
        vehicle ? `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ''}` : '',
        ...result.rows.map((r) => `${r.title}: ${r.value} — ${r.note}`),
        result.flags ? `Sonuç: ${result.flags} konuya bak` : 'Sonuç: temiz görünüyor',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const clean = result != null && result.flags === 0;

  return (
    <Screen>
      <SubHeader title="İkinci el kontrolü" sub={intro} />

      {result ? (
        <>
          <View style={styles.summary}>
            <View style={[styles.summaryIcon, { backgroundColor: clean ? colors.okBg : colors.warnBg }]}>
              <Icon name={clean ? 'check' : 'info'} size={20} color={clean ? colors.ok : colors.warn} stroke={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>{clean ? 'Temiz görünüyor' : `${result.flags} konuya bak`}</Text>
              <Text style={styles.summarySub}>
                {clean ? 'Yakın zamanda silinmiş kod izi yok. Yine de ekspertiz yaptır.' : 'Satıcıya sor, ekspertizde kontrol ettir.'}
              </Text>
            </View>
          </View>

          <Card style={{ marginTop: 10 }}>
            {result.rows.map((r, i) => {
              const icon: IconName = r.tone === 'neutral' ? 'clock' : r.flag ? 'warn' : 'check';
              const c = tone[r.tone][0];
              return (
                <View key={r.title} style={[styles.row, i > 0 && styles.border]}>
                  <View style={{ marginTop: 1 }}>
                    <Icon name={icon} size={18} color={c} stroke={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowHead}>
                      <Text style={styles.rowTitle}>{r.title}</Text>
                      <Text style={[styles.rowValue, tabular, { color: c }]}>{r.value}</Text>
                    </View>
                    <Text style={styles.rowNote}>{r.note}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : loading ? (
        <Text style={styles.loading}>Araç okunuyor…</Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={result ? 'Yeniden kontrol et' : 'Kontrol et'}
        variant={result ? 'secondary' : 'primary'}
        icon={result ? 'refresh' : undefined}
        loading={loading}
        onPress={() => void run()}
        style={{ marginTop: 14 }}
      />
      {result ? (
        <Button
          label="Kontrol raporunu kopyala"
          variant="secondary"
          icon="copy"
          onPress={() => void copy(reportText, 'Rapor kopyalandı')}
          style={{ marginTop: 8 }}
        />
      ) : null}
      {result && vehicle ? (
        <Button
          label="PDF olarak paylaş"
          variant="secondary"
          icon="doc"
          loading={sharing}
          onPress={() => {
            void (async () => {
              setSharing(true);
              const ok = await sharePdf(
                usedCarReportHtml(vehicle, result.rows, result.flags, result.scan),
                'İkinci el kontrol raporu'
              );
              setSharing(false);
              if (!ok) toast('PDF oluşturulamadı', 'Tekrar dene');
            })();
          }}
          style={{ marginTop: 8 }}
        />
      ) : null}
      <Text style={styles.disclaimer}>
        Bu kontrol OBD verisine dayanır; ekspertizin yerini tutmaz. Kaporta, şasi ve mekanik durumu göstermez.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  locked: { marginTop: 16, padding: 16 },
  lockedHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  lockedTitle: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 5 },
  checkText: { flex: 1, color: colors.text2, fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  lockedNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 8 },
  summary: {
    marginTop: 16,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  summarySub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  border: { borderTopWidth: 1, borderTopColor: colors.line },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15, flexShrink: 1 },
  rowValue: { fontFamily: fonts.bodySemiBold, fontSize: 14, textAlign: 'right' },
  rowNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17.5, marginTop: 3 },
  loading: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, marginTop: 18, marginHorizontal: 4 },
  error: { color: colors.error, fontFamily: fonts.body, fontSize: 13, marginTop: 12, marginHorizontal: 4 },
  disclaimer: { color: colors.faint, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 14 },
});
