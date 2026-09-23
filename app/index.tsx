import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar as ConnStatusBar } from '../src/ui/StatusBar';
import { CopyButton } from '../src/ui/CopyButton';
import { DtcCard, type FreezeFrameState } from '../src/ui/DtcCard';
import { useOBD } from '../src/obd/context';
import { colors, fonts, fontSize, radius, spacing } from '../src/ui/theme';
import { formatFullReport, formatTimestamp } from '../src/utils/format';

type DtcSet = { stored: string[]; pending: string[]; permanent: string[] };

export default function TaniScreen() {
  const { state, client, connect, protocolName, battery } = useOBD();
  const [dtcs, setDtcs] = useState<DtcSet>({ stored: [], pending: [], permanent: [] });
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [freezeFrame, setFreezeFrame] = useState<FreezeFrameState>({ status: 'idle' });

  const loadFreezeFrame = useCallback(async () => {
    if (state !== 'ready') return;
    setFreezeFrame({ status: 'loading' });
    try {
      setFreezeFrame({ status: 'loaded', frame: await client.readFreezeFrame() });
    } catch {
      setFreezeFrame({ status: 'error', message: 'Anlık görüntü okunamadı. Tekrar dene.' });
    }
  }, [client, state]);

  const scan = useCallback(async () => {
    if (state !== 'ready') return;
    setScanning(true);
    setScanError(null);
    try {
      const stored = await client.readDTCs('stored');
      const pending = await client.readDTCs('pending');
      const permanent = await client.readDTCs('permanent');
      setDtcs({ stored, pending, permanent });
      setFreezeFrame({ status: 'idle' });
      setLastScanAt(formatTimestamp());
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, [client, state]);

  // Auto-scan once per connection. (Guarding on `!lastScanAt` re-scanned in a
  // tight loop whenever a scan failed.)
  const autoScannedRef = useRef(false);
  useEffect(() => {
    if (state !== 'ready') {
      autoScannedRef.current = false;
      return;
    }
    if (!autoScannedRef.current) {
      autoScannedRef.current = true;
      void scan();
    }
  }, [state, scan]);

  const buildFullReport = useCallback(async (): Promise<string> => {
    if (state !== 'ready') return '';
    const vehicle = await client.readVehicleInfo();
    let readiness: Array<{ name: string; supported: boolean; ready: boolean }> | undefined;
    try {
      const r = await client.readReadiness();
      if (r) {
        readiness = r.monitors.map((m) => ({ name: m.name, supported: m.supported, ready: m.ready }));
      }
    } catch {}
    let ff = freezeFrame.status === 'loaded' ? freezeFrame.frame : null;
    if (!ff) {
      try {
        ff = await client.readFreezeFrame();
        setFreezeFrame({ status: 'loaded', frame: ff });
      } catch {}
    }
    return formatFullReport({
      vehicle,
      freezeFrame: ff?.dtc
        ? {
            dtc: ff.dtc,
            rows: ff.values.map(({ def, value }) => ({ label: def.label, value, unit: def.unit })),
          }
        : undefined,
      protocol: protocolName,
      battery,
      stored: dtcs.stored,
      pending: dtcs.pending,
      permanent: dtcs.permanent,
      readiness,
    });
  }, [client, state, dtcs, protocolName, battery, freezeFrame]);

  const [fullReport, setFullReport] = useState<string>('');

  const onPrepareFullReport = useCallback(async () => {
    const text = await buildFullReport();
    setFullReport(text);
  }, [buildFullReport]);

  const allCodes = [
    ...dtcs.stored.map((c) => `${c} (saklanan)`),
    ...dtcs.pending.map((c) => `${c} (bekleyen)`),
    ...dtcs.permanent.map((c) => `${c} (kalıcı)`),
  ];
  const copyAllText =
    allCodes.length === 0
      ? `Otova tarama — ${lastScanAt ?? formatTimestamp()}\nHata kodu yok.`
      : `Otova tarama — ${lastScanAt ?? formatTimestamp()}\n\n${allCodes.join('\n')}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ConnStatusBar />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={scanning} onRefresh={scan} tintColor={colors.accent} />}
      >
        <Text style={styles.h1}>Tanı</Text>
        <Text style={styles.sub}>Hata kodlarını tara, kopyala, gerekirse Mode 04 ile sil.</Text>

        {state !== 'ready' ? (
          <View style={styles.callout}>
            <Text style={styles.calloutTitle}>Bağlanmadın.</Text>
            <Text style={styles.calloutBody}>
              Önce Wi-Fi’ı dongle’a bağla, sonra Bağlan’a bas.
            </Text>
            <Pressable
              style={styles.connectBtn}
              onPress={() => {
                void connect();
              }}
            >
              <Text style={styles.connectLabel}>Bağlan</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <SummaryChip label="Saklanan" count={dtcs.stored.length} accent={colors.error} />
              <SummaryChip label="Bekleyen" count={dtcs.pending.length} accent={colors.warn} />
              <SummaryChip label="Kalıcı" count={dtcs.permanent.length} accent={colors.value} />
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => void scan()}
                style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
                disabled={scanning}
              >
                {scanning ? <ActivityIndicator color="#fff" /> : <Text style={styles.scanLabel}>Tekrar tara</Text>}
              </Pressable>
              <CopyButton text={copyAllText} label="Tümünü kopyala" variant="ghost" />
            </View>

            {scanError ? <Text style={styles.error}>{scanError}</Text> : null}

            <Section title="Saklanan (Mode 03)" codes={dtcs.stored} source="stored" freezeFrame={freezeFrame} onRequestFreezeFrame={loadFreezeFrame} />
            <Section title="Bekleyen (Mode 07)" codes={dtcs.pending} source="pending" freezeFrame={freezeFrame} onRequestFreezeFrame={loadFreezeFrame} />
            <Section title="Kalıcı (Mode 0A)" codes={dtcs.permanent} source="permanent" freezeFrame={freezeFrame} onRequestFreezeFrame={loadFreezeFrame} />

            <View style={styles.reportBlock}>
              <Text style={styles.reportTitle}>Tüm raporu kopyala</Text>
              <Text style={styles.reportBody}>
                VIN, ECU, hazırlık izleyicileri ve tüm DTC’leri tek metin olarak hazırla.
              </Text>
              <View style={styles.reportRow}>
                <Pressable onPress={() => void onPrepareFullReport()} style={styles.reportBtn}>
                  <Text style={styles.reportBtnLabel}>Hazırla</Text>
                </Pressable>
                {fullReport ? (
                  <CopyButton text={fullReport} label="Raporu kopyala" variant="primary" />
                ) : null}
              </View>
              {fullReport ? (
                <View style={styles.reportPreview}>
                  <Text style={styles.reportPreviewText} numberOfLines={20}>
                    {fullReport}
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryChip({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <View style={[chipStyles.chip, { borderColor: count > 0 ? accent : colors.border }]}>
      <Text style={[chipStyles.count, { color: count > 0 ? accent : colors.muted }]}>{count}</Text>
      <Text style={chipStyles.label}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  codes,
  source,
  freezeFrame,
  onRequestFreezeFrame,
}: {
  title: string;
  codes: string[];
  source: 'stored' | 'pending' | 'permanent';
  freezeFrame: FreezeFrameState;
  onRequestFreezeFrame: () => void;
}) {
  return (
    <View style={{ gap: spacing.s }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {codes.length === 0 ? (
        <Text style={styles.empty}>Kod yok.</Text>
      ) : (
        codes.map((c) => (
          <DtcCard
            key={`${source}-${c}`}
            code={c}
            source={source}
            freezeFrame={freezeFrame}
            onRequestFreezeFrame={onRequestFreezeFrame}
          />
        ))
      )}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderRadius: radius.m,
    padding: spacing.m,
    alignItems: 'center',
  },
  count: {
    fontFamily: 'GeistMono_600SemiBold',
    fontSize: fontSize.xxl,
  },
  label: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
    marginTop: 2,
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.l,
    gap: spacing.l,
    paddingBottom: spacing.xxxl,
  },
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
  callout: {
    backgroundColor: colors.card,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.l,
    gap: spacing.s,
  },
  calloutTitle: {
    color: colors.body,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.l,
  },
  calloutBody: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
  },
  connectBtn: {
    marginTop: spacing.s,
    backgroundColor: colors.accent,
    paddingVertical: spacing.m,
    borderRadius: radius.m,
    alignItems: 'center',
  },
  connectLabel: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.m,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    flexWrap: 'wrap',
  },
  scanBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: radius.m,
  },
  scanBtnDisabled: {
    opacity: 0.6,
  },
  scanLabel: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.m,
  },
  error: {
    color: colors.error,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  sectionTitle: {
    color: colors.mutedStrong,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.s,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.s,
  },
  empty: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
    fontStyle: 'italic',
  },
  reportBlock: {
    marginTop: spacing.l,
    backgroundColor: colors.card,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.l,
    gap: spacing.s,
  },
  reportTitle: {
    color: colors.body,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.l,
  },
  reportBody: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  reportRow: {
    flexDirection: 'row',
    gap: spacing.m,
    alignItems: 'center',
    marginTop: spacing.s,
  },
  reportBtn: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s + 2,
    borderRadius: radius.m,
  },
  reportBtnLabel: {
    color: colors.body,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.s,
  },
  reportPreview: {
    marginTop: spacing.m,
    backgroundColor: colors.bg,
    borderRadius: radius.m,
    padding: spacing.m,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportPreviewText: {
    color: colors.mutedStrong,
    fontFamily: 'GeistMono_400Regular',
    fontSize: fontSize.xs,
  },
});
