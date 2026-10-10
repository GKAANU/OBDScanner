import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { CopyableValue } from './CopyButton';
import { colors, fonts, fontSize } from './theme';

/**
 * A connect error: the Turkish message plus a muted mono "Teknik ayrıntı"
 * line (long-press copies it).
 */
export function ConnectErrorText({
  message,
  detail,
  compact = false,
}: {
  message: string;
  detail: string | null;
  compact?: boolean;
}) {
  return (
    <>
      <Text style={[styles.message, compact && styles.messageCompact]}>{message}</Text>
      {detail ? (
        <CopyableValue text={`Teknik ayrıntı: ${detail}`}>
          <Text style={styles.detail} selectable={false}>
            Teknik ayrıntı: {detail}
          </Text>
        </CopyableValue>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  message: { color: colors.error, fontFamily: fonts.body, fontSize: fontSize.m },
  messageCompact: { fontSize: fontSize.s },
  detail: { color: colors.faint, fontFamily: fonts.mono, fontSize: fontSize.xs, marginTop: 2 },
});
