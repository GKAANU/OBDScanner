import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, fonts, fontSize, radius, spacing } from './theme';
import type { PIDDef } from '../obd/pid-registry';
import { formatValue } from '../utils/format';

type Props = {
  def: PIDDef;
  value: number | string | null;
  rawHex?: string | null;
  min?: number | null;
  max?: number | null;
};

export function PidRow({ def, value, rawHex, min, max }: Props) {
  const display = formatValue(value, def.unit);
  const copyText = `${def.label}: ${display}`;

  const onLongPress = useCallback(async () => {
    await Clipboard.setStringAsync(copyText);
  }, [copyText]);

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={300} style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.label} numberOfLines={1}>
          {def.label}
        </Text>
        {min != null && max != null && typeof value === 'number' ? (
          <Text style={styles.range}>
            min {formatValue(min)} · max {formatValue(max)}
          </Text>
        ) : rawHex ? (
          <Text style={styles.range}>{rawHex}</Text>
        ) : null}
      </View>
      <Text style={styles.value}>{display}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    backgroundColor: colors.card,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.m,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.body,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
  },
  range: {
    color: colors.muted,
    fontFamily: 'GeistMono_400Regular',
    fontSize: fontSize.xs,
  },
  value: {
    color: colors.value,
    fontFamily: 'GeistMono_500Medium',
    fontSize: fontSize.l,
    minWidth: 90,
    textAlign: 'right',
  },
});
