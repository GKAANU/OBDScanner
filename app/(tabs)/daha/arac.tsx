import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useOBD } from '../../../src/obd/context';
import { userMessage } from '../../../src/obd/protocol';
import type { VehicleInfo } from '../../../src/obd/client';
import { Copyable, useCopy } from '../../../src/ui/copy';
import { Button, Card, Screen } from '../../../src/ui/primitives';
import { ConnectCard, SubHeader } from '../../../src/ui/SubHeader';
import { colors, fonts } from '../../../src/ui/theme';

const EMPTY_INFO: VehicleInfo = { vin: null, calId: null, cvn: null, ecuName: null };

export default function AracScreen() {
  const { state, client, adapterVersion, protocolName } = useOBD();
  const copy = useCopy();
  const [info, setInfo] = useState<VehicleInfo>(EMPTY_INFO);
  const [supported, setSupported] = useState<string[]>([]);
  const [gridOpen, setGridOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (state !== 'ready') return;
    setLoading(true);
    setError(null);
    try {
      setInfo(await client.readVehicleInfo());
      setSupported(await client.readSupportedPids());
      setLoaded(true);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setLoading(false);
    }
  }, [client, state]);

  // Auto-load once per connection.
  const autoRef = useRef(false);
  useEffect(() => {
    if (state !== 'ready') {
      autoRef.current = false;
      return;
    }
    if (!autoRef.current) {
      autoRef.current = true;
      void load();
    }
  }, [state, load]);

  const ecuRows = useMemo(
    () =>
      [
        ['ECU', info.ecuName],
        ['Kalibrasyon', info.calId],
        ['CVN', info.cvn],
        ['Adaptör', adapterVersion],
        ['Protokol', protocolName],
      ] as Array<[string, string | null]>,
    [info, adapterVersion, protocolName]
  );

  const supportedSet = useMemo(() => new Set(supported), [supported]);
  const supportedText = `Desteklenen PID'ler (Mode 01, ${supported.length}/256): ${supported.join(' ')}`;

  const allText = useMemo(() => {
    const lines = ['Otova araç bilgisi'];
    lines.push(`VIN: ${info.vin ?? 'bildirilmedi'}`);
    for (const [label, val] of ecuRows) if (val) lines.push(`${label}: ${val}`);
    if (supported.length) lines.push(supportedText);
    return lines.join('\n');
  }, [info, ecuRows, supported, supportedText]);

  if (state !== 'ready') {
    return (
      <Screen>
        <SubHeader title="Araç bilgisi" />
        <ConnectCard title="Araç bilgisi için dongle'ı bağla" body="VIN, ECU, kalibrasyon ve desteklenen PID'ler araçtan okunur." />
      </Screen>
    );
  }

  const vin = info.vin;
  const vinParts = vin && vin.length === 17 ? [vin.slice(0, 3), vin.slice(3, 9), vin.slice(9)] : null;

  return (
    <Screen>
      <SubHeader title="Araç bilgisi" />

      <Copyable
        text={`VIN: ${vin ?? 'bildirilmedi'}`}
        style={[styles.card, { marginTop: 18, padding: 16 }]}
        restColor={colors.cardHi}
      >
        {(flashed) => (
          <>
            <View style={styles.vinHead}>
              <Text style={styles.vinLabel}>VIN · şasi numarası</Text>
              <Text style={[styles.vinLabel, { color: flashed ? colors.ok : colors.faint }]}>
                {flashed ? 'Kopyalandı' : vin ? `${vin.length} karakter` : ''}
              </Text>
            </View>
            {vinParts ? (
              <View style={styles.vinRow}>
                {vinParts.map((p, i) => (
                  <View key={i} style={{ gap: 6 }}>
                    <Text style={styles.vinPart}>{p}</Text>
                    <Text style={styles.vinCap}>{['Üretici', 'Model', 'Seri'][i]}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.vinPart, { marginTop: 12, fontSize: vin ? 18 : 15, color: vin ? colors.text : colors.muted }]}>
                {vin ?? (loading ? 'Okunuyor…' : 'Araç VIN bildirmiyor')}
              </Text>
            )}
          </>
        )}
      </Copyable>

      <Card style={{ marginTop: 10 }}>
        {ecuRows.map(([label, val], i) => (
          <Copyable key={label} text={`${label}: ${val ?? '—'}`} style={[styles.ecuRow, i > 0 && styles.border]}>
            <Text style={styles.ecuLabel}>{label}</Text>
            <Text style={[styles.ecuVal, !val && { color: colors.faint }]} numberOfLines={2}>
              {val ?? '—'}
            </Text>
          </Copyable>
        ))}
      </Card>

      <Card style={{ marginTop: 10 }}>
        <Copyable text={supportedText} onPress={() => setGridOpen((o) => !o)} style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
          <View style={styles.pidHead}>
            <View>
              <Text style={styles.pidTitle}>Desteklenen PID'ler</Text>
              <Text style={styles.pidSub}>
                {loaded ? `${supported.length} / 256 parametre okunabiliyor` : loading ? 'Okunuyor…' : 'Okunmadı'}
              </Text>
            </View>
            <Text style={styles.link}>{gridOpen ? 'Gizle' : 'Göster'}</Text>
          </View>
          {gridOpen ? (
            <View style={styles.grid}>
              {Array.from({ length: 256 }, (_, i) => {
                const h = i.toString(16).toUpperCase().padStart(2, '0');
                const on = supportedSet.has(h);
                return (
                  <View key={h} style={[styles.cell, { backgroundColor: on ? colors.amberBg : '#1a1816' }]}>
                    <Text style={[styles.cellText, { color: on ? colors.amber : colors.faint2 }]}>{h}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </Copyable>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Button label="Yeniden oku" variant="secondary" icon="refresh" loading={loading} onPress={() => void load()} style={{ flex: 1 }} />
        <Button label="Tümünü kopyala" variant="secondary" icon="copy" onPress={() => void copy(allText)} style={{ flex: 1 }} />
      </View>
      <Text style={styles.hint}>Basılı tuttuğun her değer düz metin olarak kopyalanır.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 20, backgroundColor: colors.cardHi },
  vinHead: { flexDirection: 'row', justifyContent: 'space-between' },
  vinLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  vinRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  vinPart: { color: colors.text, fontFamily: fonts.monoMedium, fontSize: 22, letterSpacing: 0.66 },
  vinCap: { color: colors.faint, fontFamily: fonts.body, fontSize: 10.5 },
  ecuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  border: { borderTopWidth: 1, borderTopColor: colors.line },
  ecuLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  ecuVal: { color: colors.text, fontFamily: fonts.monoMedium, fontSize: 13.5, textAlign: 'right', flexShrink: 1 },
  pidHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pidTitle: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  pidSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginTop: 2 },
  link: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 2 },
  cell: { width: '5.6%', aspectRatio: 1, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontFamily: fonts.monoMedium, fontSize: 7 },
  error: { color: colors.error, fontFamily: fonts.body, fontSize: 13, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  hint: { color: colors.faint, fontFamily: fonts.body, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
