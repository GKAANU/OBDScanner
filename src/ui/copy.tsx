import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { copyText } from './clipboard';
import { useToast } from './toast';
import { colors } from './theme';

/** Hold this long to copy (design: amber line fills over 500 ms). */
export const HOLD_MS = 500;
const FLASH_MS = 1900;

type CopyText = string | (() => string);

/**
 * Copy `text` (plain UTF-8), flash a toast. Returns a stable callback.
 * The toast shows `label` and the first line of the copied text.
 */
export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, label = 'Kopyalandı') => {
      if (!text) return false;
      const ok = await copyText(text);
      if (ok) toast(label, text);
      return ok;
    },
    [toast]
  );
}

/**
 * A pressable surface: short tap → `onPress`, hold 500 ms → copy.
 * While held an amber line grows along the top edge; after copying the
 * surface tints blue for 1.9 s. `children` may be a render function that
 * receives `flashed` (to swap a tag for "Kopyalandı").
 */
export function Copyable({
  text,
  onPress,
  style,
  restColor,
  pressedColor = colors.elevated,
  line = 'top',
  children,
  disabled,
}: {
  text: CopyText;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Background when idle (default: none, the style's own background shows). */
  restColor?: string;
  pressedColor?: string;
  line?: 'top' | 'bottom' | 'none';
  children: React.ReactNode | ((flashed: boolean) => React.ReactNode);
  disabled?: boolean;
}) {
  const copy = useCopy();
  const progress = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);
  const [flashed, setFlashed] = useState(false);
  const [width, setWidth] = useState(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const onPressIn = useCallback(() => {
    setPressed(true);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const onPressOut = useCallback(() => {
    setPressed(false);
    progress.stopAnimation();
    progress.setValue(0);
  }, [progress]);

  const onLongPress = useCallback(async () => {
    const value = typeof text === 'function' ? text() : text;
    if (await copy(value)) {
      setFlashed(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashed(false), FLASH_MS);
    }
  }, [text, copy]);

  const bg = flashed ? colors.flash : pressed ? pressedColor : restColor;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onLongPress={onLongPress}
      delayLongPress={HOLD_MS}
      disabled={disabled}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[style, styles.clip, bg ? { backgroundColor: bg } : null]}
    >
      {typeof children === 'function' ? children(flashed) : children}
      {line !== 'none' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.line,
            line === 'top' ? styles.lineTop : styles.lineBottom,
            {
              width,
              transform: [{ scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] }) }],
            },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  line: {
    position: 'absolute',
    left: 0,
    height: 2,
    backgroundColor: colors.amber,
    transformOrigin: 'left',
  },
  lineTop: { top: 0 },
  lineBottom: { bottom: 0 },
});
