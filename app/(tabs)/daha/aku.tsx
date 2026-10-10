import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useOBD } from '../../../src/obd/context';
import { userMessage } from '../../../src/obd/protocol';
import { batteryCharge, batteryCrank, batteryRest, batteryVerdict, type BatteryReading } from '../../../src/obd/health';
import { useCopy } from '../../../src/ui/copy';
import { useToast } from '../../../src/ui/toast';
import { Arc, Button, Chip, Screen } from '../../../src/ui/primitives';
import { ConnectCard, SubHeader } from '../../../src/ui/SubHeader';
import { usePro, useProGate, type ProFeature } from '../../../src/pro/entitlement';
import { Card } from '../../../src/ui/primitives';
import { colors, fonts, tabular, tone } from '../../../src/ui/theme';

type Phase = 'idle' | 'rest' | 'crank' | 'charge' | 'done';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'dinlenme',
  rest: 'dinlenme',
  crank: 'marş anı',
  charge: 'şarj',
  done: 'dinlenme',
};

const HELP: Record<Phase, string> = {
  idle: 'Test için motoru kapat, kontağı aç ve başlat. Uygulama seni adım adım yönlendirir.',
  rest: 'Motor kapalıyken dinlenme voltajı ölçülüyor. Kontak açık kalsın.',
  crank: 'Şimdi motoru çalıştır. Marş anındaki voltaj düşüşü ölçülüyor.',
  charge: 'Motor rölantide. Şarj dinamosunun verdiği voltaj ölçülüyor.',
  done: 'Test tamamlandı. Tekrar ölçmek için motoru kapat, kontağı aç ve yeniden başlat.',
};

const CRANK_TIMEOUT_MS = 15_000;

class Cancelled extends Error {}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function fmtV(v: number | null): string {
  return v == null ? '—' : v.toFixed(1);
}

function AkuScreenInner() {
  const { state, client, battery } = useOBD();
  const copy = useCopy();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [live, setLive] = useState<number | null>(null);
  const [rest, setRest] = useState<number | null>(null);
  const [crank, setCrank] = useState<number | null>(null);
  const [charge, setCharge] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  const running = phase === 'rest' || phase === 'crank' || phase === 'charge';

  const cancel = useCallback(() => {
    runRef.current++;
  }, []);

  // Stop measuring when the page loses focus or unmounts.
  useFocusEffect(useCallback(() => cancel, [cancel]));
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (state !== 'ready') cancel();
  }, [state, cancel]);

  const start = useCallback(async () => {
    if (state !== 'ready' || running) return;
    const run = ++runRef.current;
    const alive = () => {
      if (runRef.current !== run) throw new Cancelled();
    };
    const sample = async (): Promise<number | null> => {
      const v = await client.readBatteryVoltage();
      alive();
      if (v != null) setLive(v);
      return v;
    };
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    setError(null);
    setRest(null);
    setCrank(null);
    setCharge(null);
    try {
      // 1. Rest voltage: engine off, ignition on.
      setPhase('rest');
      const restSamples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const v = await sample();
        if (v != null) restSamples.push(v);
        await wait(250);
        alive();
      }
      const restV = median(restSamples);
      setRest(restV);

      // 2. Crank: sample as fast as the single-flight queue allows; keep the minimum.
      setPhase('crank');
      const t0 = Date.now();
      let minV: number | null = null;
      let dipped = false;
      while (Date.now() - t0 < CRANK_TIMEOUT_MS) {
        const v = await sample();
        if (v == null) continue;
        if (minV == null || v < minV) {
          minV = v;
          setCrank(v);
        }
        if (restV != null && v < restV - 0.5) dipped = true;
        // Engine caught: the alternator lifts the voltage above 13 V.
        if (dipped && v >= 13.0) break;
      }
      setCrank(dipped ? minV : null);

      // 3. Charging voltage at idle.
      setPhase('charge');
      await wait(3000);
      alive();
      const chargeSamples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const v = await sample();
        if (v != null) chargeSamples.push(v);
        await wait(300);
        alive();
      }
      let chargeV = chargeSamples.length ? chargeSamples.reduce((a, b) => a + b, 0) / chargeSamples.length : null;
      try {
        const rpm = await client.readPid('RPM');
        alive();
        // Engine not running: there is no charging voltage to judge.
        if (rpm.status === 'ok' && typeof rpm.value === 'number' && rpm.value < 400) chargeV = null;
      } catch (e) {
        if (e instanceof Cancelled) throw e;
      }
      setCharge(chargeV);

      setPhase('done');
      const verdict = batteryVerdict(restV, dipped ? minV : null, chargeV);
      toast('Test tamamlandı', verdict.text);
    } catch (e) {
      if (e instanceof Cancelled) {
        if (runRef.current === run + 1) setPhase('idle');
        return;
      }
      setError(userMessage(e));
      setPhase('idle');
    }
  }, [client, state, running, toast]);

  if (state !== 'ready') {
    return (
      <Screen>
        <SubHeader title="Akü testi" />
        <ConnectCard
          title="Akü testi için dongle'ı bağla"
          body="Dinlenme, marş ve şarj voltajı dongle üzerinden ölçülür. Kontak açık olmalı."
        />
      </Screen>
    );
  }

  const shown = live ?? rest ?? battery;
  const verdict = running ? { text: 'Ölçülüyor…', tone: 'blue' as const } : batteryVerdict(rest, crank, charge);
  const arcColor = phase === 'crank' ? colors.warn : verdict.tone === 'error' ? colors.error : verdict.tone === 'warn' ? colors.warn : colors.ok;

  const tiles: Array<{ label: string; reading: BatteryReading; raw: number | null; note: string; active: boolean }> = [
    { label: 'Dinlenme', reading: batteryRest(rest), raw: rest, note: '≥ 12.4 iyi', active: phase === 'rest' },
    { label: 'Marş', reading: batteryCrank(crank), raw: crank, note: '≥ 9.6 iyi', active: phase === 'crank' },
    { label: 'Şarj', reading: batteryCharge(charge), raw: charge, note: '13.2–14.8', active: phase === 'charge' },
  ];

  const resultText = [
    'Otova akü testi',
    `Dinlenme: ${fmtV(rest)} V (${batteryRest(rest).label})`,
    `Marş anı en düşük: ${fmtV(crank)} V (${batteryCrank(crank).label})`,
    `Şarj: ${fmtV(charge)} V (${batteryCharge(charge).label})`,
    `Sonuç: ${batteryVerdict(rest, crank, charge).text}`,
  ].join('\n');

  return (
    <Screen>
      <SubHeader title="Akü testi" />

      <View style={styles.hero}>
        <Arc value={shown != null ? (shown - 9) / 6 : 0} size={200} stroke={6} color={arcColor}>
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <Text style={[styles.volt, tabular]}>{fmtV(shown)}</Text>
            <Text style={styles.voltSub}>volt · {PHASE_LABEL[phase]}</Text>
          </View>
        </Arc>
        <Chip label={verdict.text} t={verdict.tone} style={{ alignSelf: 'center' }} />
      </View>

      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View key={t.label} style={[styles.tile, t.active && { borderColor: colors.blue }]}>
            <Text style={styles.tileLabel}>{t.label}</Text>
            <Text style={[styles.tileValue, tabular, { color: t.raw != null ? tone[t.reading.tone][0] : colors.faint }]}>
              {t.raw != null ? `${t.raw.toFixed(1)} V` : '—'}
            </Text>
            <Text style={styles.tileNote}>{t.note}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.help}>{HELP[phase]}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {running ? (
        <Button label="Testi durdur" variant="secondary" onPress={cancel} style={{ marginTop: 14 }} />
      ) : (
        <Button label={phase === 'done' ? 'Yeniden test et' : 'Testi başlat'} onPress={() => void start()} style={{ marginTop: 14 }} />
      )}
      {phase === 'done' ? (
        <Button label="Sonucu kopyala" variant="secondary" icon="copy" onPress={() => void copy(resultText, 'Sonuç kopyalandı')} style={{ marginTop: 8 }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 18,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
  },
  volt: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 44, letterSpacing: -1.7, lineHeight: 48 },
  voltSub: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13, marginTop: 6 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tile: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12 },
  tileLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 12 },
  tileValue: { fontFamily: fonts.bodySemiBold, fontSize: 20, marginTop: 6 },
  tileNote: { color: colors.faint, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  help: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, marginTop: 16, marginHorizontal: 4 },
  error: { color: colors.error, fontFamily: fonts.body, fontSize: 13, marginTop: 10, marginHorizontal: 4 },
});

export default function AkuScreen() {
  const { isPro } = usePro();
  if (!isPro)
    return (
      <ProLocked
        title="Akü testi"
        body="Dinlenme, marş anı ve şarj voltajını ölçüp akünün ve şarj dinamosunun durumunu tek cümleyle söyler. Kış öncesi ve akü değişiminden önce işe yarar."
        feature="battery"
      />
    );
  return <AkuScreenInner />;
}

/** Shown instead of the feature for free users. */
function ProLocked({ title, body, feature }: { title: string; body: string; feature: ProFeature }) {
  const gate = useProGate();
  return (
    <Screen>
      <SubHeader title={title} />
      <Card hero style={lockStyles.card}>
        <View style={lockStyles.tag}>
          <Text style={lockStyles.tagText}>Pro</Text>
        </View>
        <Text style={lockStyles.body}>{body}</Text>
        <Button label="Pro'ya geç" onPress={() => gate(feature)} style={{ marginTop: 16 }} />
      </Card>
    </Screen>
  );
}

const lockStyles = StyleSheet.create({
  card: { marginTop: 18, padding: 20 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.amberBg },
  tagText: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
  body: { color: colors.text2, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 12 },
});
