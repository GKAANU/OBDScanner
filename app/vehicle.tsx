import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar as ConnStatusBar } from '../src/ui/StatusBar';
import { CopyButton } from '../src/ui/CopyButton';
import { ReadinessGrid } from '../src/ui/ReadinessGrid';
import { useOBD } from '../src/obd/context';
import {
  parseCVN,
  parseMode09Ascii,
  parseReadiness,
  parseVIN,
  type ReadinessReport,
} from '../src/obd/parsers';
import { parseSupportedPids, PID_BY_HEX } from '../src/obd/pid-registry';
import { colors, fonts, fontSize, radius, spacing } from '../src/ui/theme';

type VehicleInfo = {
  vin: string | null;
  ecuName: string | null;
  calId: string | null;
  cvn: string | null;
  adapter: string | null;
};

export default function VehicleScreen() {
  const { state, client, adapterVersion, protocolName } = useOBD();
  const [info, setInfo] = useState<VehicleInfo>({
    vin: null,
    ecuName: null,
    calId: null,
    cvn: null,
    adapter: null,
  });
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [supportedPids, setSupportedPids] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (state !== 'ready') return;
    setLoading(true);
    setError(null);
    try {
      const next: VehicleInfo = {
        vin: null,
        ecuName: null,
        calId: null,
        cvn: null,
        adapter: adapterVersion,
      };
      try {
        next.vin = parseVIN(await client.mode09('02'));
      } catch {}
      try {
        next.calId = parseMode09Ascii(await client.mode09('04'), '4904');
      } catch {}
      try {
        next.cvn = parseCVN(await client.mode09('06'));
      } catch {}
      try {
        next.ecuName = parseMode09Ascii(await client.mode09('0A'), '490A');
      } catch {}
      setInfo(next);

      try {
        const r = parseReadiness(await client.livePid('01'));
        setReadiness(r);
      } catch {}

      // Probe supported-PID bitmaps. Each query covers 32 PIDs.
      const banks = ['00', '20', '40', '60', '80', 'A0', 'C0', 'E0'];
      const all: string[] = [];
      for (const bank of banks) {
        try {
          const raw = await client.livePid(bank);
          const list = parseSupportedPids(raw, bank);
          if (list.length === 0) break; // no further banks supported
          all.push(...list);
          // Stop probing if "next bank supported" bit is not set on this bank's
          // last byte; simpler heuristic: stop after first empty bank above.
        } catch {
          break;
        }
      }
      setSupportedPids(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, state, adapterVersion]);

  useEffect(() => {
    if (state === 'ready' && !info.vin && !loading) {
      void load();
    }
  }, [state, info.vin, loading, load]);

  const copyText = useMemo(() => {
    const lines: string[] = [];
    lines.push('Otova araç bilgisi');
    if (protocolName) lines.push(`Protokol: ${protocolName}`);
    if (info.adapter) lines.push(`Adaptör: ${info.adapter}`);
    if (info.vin) lines.push(`VIN: ${info.vin}`);
    if (info.ecuName) lines.push(`ECU: ${info.ecuName}`);
    if (info.calId) lines.push(`Kalibrasyon ID: ${info.calId}`);
    if (info.cvn) lines.push(`CVN: ${info.cvn}`);
    if (readiness) {
      lines.push('');
      lines.push(`MIL: ${readiness.milOn ? 'yanıyor' : 'sönük'}`);
      lines.push(`DTC sayısı: ${readiness.dtcCount}`);
      lines.push('Hazırlık izleyicileri:');
      for (const m of readiness.monitors) {
        const status = !m.supported ? 'desteklenmiyor' : m.ready ? 'hazır' : 'hazır değil';
        lines.push(`  ${m.name}: ${status}`);
      }
    }
    if (supportedPids.length > 0) {
      lines.push('');
      lines.push(`Desteklenen PID’ler (${supportedPids.length}): ${supportedPids.join(', ')}`);
    }
    return lines.join('\n');
  }, [info, readiness, supportedPids, protocolName]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ConnStatusBar />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Araç</Text>
        <Text style={styles.sub}>VIN, ECU, kalibrasyon, hazırlık ve desteklenen PID’ler.</Text>

        {state !== 'ready' ? (
          <Text style={styles.notice}>Önce Tanı sekmesinden bağlan.</Text>
        ) : (
          <>
            <View style={styles.actions}>
              <Pressable
                onPress={() => void load()}
                style={[styles.btn, loading && styles.btnDisabled]}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>Yeniden oku</Text>}
              </Pressable>
              <CopyButton text={copyText} label="Tümünü kopyala" variant="ghost" />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Card title="Kimlik">
              <KV label="VIN" value={info.vin} mono />
              <KV label="ECU adı" value={info.ecuName} />
              <KV label="Kalibrasyon ID" value={info.calId} mono />
              <KV label="CVN" value={info.cvn} mono />
              <KV label="Adaptör" value={info.adapter} mono />
              <KV label="Protokol" value={protocolName} />
            </Card>

            {readiness ? <ReadinessGrid report={readiness} /> : null}

            {supportedPids.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Desteklenen PID’ler ({supportedPids.length})</Text>
                <View style={styles.grid}>
                  {supportedPids.map((p) => {
                    const def = PID_BY_HEX[p];
                    return (
                      <View key={p} style={styles.pidPill}>
                        <Text style={styles.pidPillCode}>{p}</Text>
                        {def ? <Text style={styles.pidPillLabel} numberOfLines={1}>{def.label}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={{ gap: spacing.s }}>{children}</View>
    </View>
  );
}

function KV({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, mono && styles.kvValueMono, !value && styles.kvValueMissing]} numberOfLines={2}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.l, gap: spacing.l, paddingBottom: spacing.xxxl },
  h1: {
    color: colors.body,
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.xxxl,
  },
  sub: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
    marginTop: -spacing.s,
  },
  notice: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  btn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s + 2,
    borderRadius: radius.m,
  },
  btnDisabled: { opacity: 0.6 },
  btnLabel: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.s,
  },
  error: {
    color: colors.error,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.l,
    gap: spacing.s,
  },
  cardTitle: {
    color: colors.body,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.l,
    marginBottom: spacing.s,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.m,
  },
  kvLabel: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
    width: 140,
  },
  kvValue: {
    flex: 1,
    color: colors.body,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.m,
    textAlign: 'right',
  },
  kvValueMono: {
    fontFamily: 'GeistMono_500Medium',
    color: colors.value,
  },
  kvValueMissing: {
    color: colors.muted,
    fontStyle: 'italic',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  pidPill: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.s,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs + 2,
    minWidth: 60,
  },
  pidPillCode: {
    color: colors.value,
    fontFamily: 'GeistMono_600SemiBold',
    fontSize: fontSize.xs,
  },
  pidPillLabel: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 10,
  },
});
