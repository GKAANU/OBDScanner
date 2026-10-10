import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { copyText } from './clipboard';
import { colors, fonts, fontSize, radius, spacing } from './theme';

type Props = {
  /** Text to copy, or a function that builds it on press. */
  text: string | (() => Promise<string>);
  label?: string;
  variant?: 'primary' | 'ghost';
  compact?: boolean;
};

export function CopyButton({ text, label = 'Kopyala', variant = 'ghost', compact = false }: Props) {
  const [copied, flash] = useCopiedFlash(1500);

  const onPress = useCallback(async () => {
    const value = typeof text === 'function' ? await text() : text;
    if (!value) return;
    if (await copyText(value)) flash();
  }, [text, flash]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variant === 'primary' ? styles.primary : styles.ghost,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === 'primary' ? styles.labelPrimary : styles.labelGhost,
        ]}
      >
        {copied ? 'Kopyalandı' : label}
      </Text>
    </Pressable>
  );
}

export function CopyableValue({
  text,
  children,
  style,
}: {
  text: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [copied, flash] = useCopiedFlash(1200);
  const onLongPress = useCallback(async () => {
    if (await copyText(text)) flash();
  }, [text, flash]);
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={300}>
      <View style={style}>{children}</View>
      {copied ? (
        <Text style={styles.copiedHint}>Kopyalandı</Text>
      ) : null}
    </Pressable>
  );
}

/** "Kopyalandı" flag that resets after `ms`; the timer is cleared on unmount. */
function useCopiedFlash(ms: number): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const flash = useCallback(() => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), ms);
  }, [ms]);
  return [copied, flash];
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s + 2,
    borderRadius: radius.m,
    alignSelf: 'flex-start',
  },
  compact: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs + 2,
  },
  primary: {
    backgroundColor: colors.blue,
  },
  ghost: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.s,
    letterSpacing: 0.2,
  },
  labelPrimary: {
    color: '#fff',
  },
  labelGhost: {
    color: colors.text,
  },
  copiedHint: {
    color: colors.ok,
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
});
