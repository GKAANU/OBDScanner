import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { diagLog, formatDiagLine } from '../obd/diag-log';
import { useOBD } from '../obd/context';
import { CopyButton } from './CopyButton';
import { diagLogText } from './diag-header';
import { colors, fonts, fontSize, radius, spacing } from './theme';

const VISIBLE_LINES = 30;

/** "Günlüğü kopyala": copies header + the whole in-memory connection log. */
export function CopyLogButton({ compact = false }: { compact?: boolean }) {
  const { config } = useOBD();
  const build = useCallback(() => diagLogText(config), [config]);
  return <CopyButton text={build} label="Günlüğü kopyala" variant="ghost" compact={compact} />;
}

/** Collapsible "Bağlantı günlüğü" block for the settings sheet. */
export function DiagLogSection() {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);

  // Re-render on new entries only while expanded.
  useEffect(() => {
    if (!open) return;
    return diagLog.subscribe(() => setTick((t) => t + 1));
  }, [open]);

  const lines = open ? diagLog.entries().slice(-VISIBLE_LINES).map(formatDiagLine) : [];

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.header} accessibilityRole="button">
        <Text style={styles.title}>Bağlantı günlüğü</Text>
        <Text style={styles.toggle}>{open ? 'Gizle' : 'Göster'}</Text>
      </Pressable>
      {open ? (
        <>
          <View style={styles.box}>
            {lines.length === 0 ? (
              <Text style={styles.empty}>Henüz kayıt yok.</Text>
            ) : (
              lines.map((l, i) => (
                <Text key={i} style={styles.line}>
                  {l}
                </Text>
              ))
            )}
          </View>
          <CopyLogButton compact />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.s, marginTop: spacing.s },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  title: { color: colors.body, fontFamily: fonts.bodyMedium, fontSize: fontSize.m },
  toggle: { color: colors.accent, fontFamily: fonts.bodyMedium, fontSize: fontSize.s },
  box: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    padding: spacing.s,
    gap: 2,
  },
  line: { color: colors.muted, fontFamily: fonts.mono, fontSize: 10 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: fontSize.s, fontStyle: 'italic' },
});
