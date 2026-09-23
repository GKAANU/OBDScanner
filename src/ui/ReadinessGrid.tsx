import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from './theme';
import type { ReadinessReport } from '../obd/parsers';

export function ReadinessGrid({ report }: { report: ReadinessReport }) {
  const continuous = report.monitors.filter((m) => m.continuous);
  const nonCont = report.monitors.filter((m) => !m.continuous);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.summaryLabel}>MIL</Text>
        <Text style={[styles.summaryValue, report.milOn ? styles.milOn : styles.milOff]}>
          {report.milOn ? 'Yanıyor' : 'Sönük'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.summaryLabel}>DTC sayısı</Text>
        <Text style={styles.summaryValue}>{report.dtcCount}</Text>
      </View>

      <Section title="Sürekli izleyiciler" monitors={continuous} />
      <Section title="Periyodik izleyiciler" monitors={nonCont} />
    </View>
  );
}

function Section({
  title,
  monitors,
}: {
  title: string;
  monitors: ReadinessReport['monitors'];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {monitors.map((m) => {
        const status = !m.supported ? 'Desteklenmiyor' : m.ready ? 'Hazır' : 'Hazır değil';
        const color = !m.supported ? colors.muted : m.ready ? colors.ok : colors.warn;
        return (
          <View key={m.name} style={styles.monRow}>
            <Text style={styles.monLabel}>{m.name}</Text>
            <Text style={[styles.monStatus, { color }]}>{status}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.l,
    gap: spacing.s,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
  },
  summaryValue: {
    color: colors.body,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.m,
  },
  milOn: {
    color: colors.error,
  },
  milOff: {
    color: colors.ok,
  },
  section: {
    marginTop: spacing.m,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.mutedStrong,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.s,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  monRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  monLabel: {
    color: colors.body,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
  },
  monStatus: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.s,
  },
});
