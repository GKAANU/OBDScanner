import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './icons';
import { colors, fonts } from './theme';

type ToastFn = (label: string, text?: string, ms?: number) => void;

const ToastContext = createContext<ToastFn>(() => {});

/** Space between the toast and the bottom safe-area edge (clears the tab bar). */
const TAB_BAR_CLEARANCE = 64;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ label: string; text: string } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const show = useCallback<ToastFn>(
    (label, text = '', ms = 1900) => {
      setToast({ label, text: text.split('\n')[0] });
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
      }, ms);
    },
    [anim]
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
          <Animated.View
            style={[
              styles.toast,
              {
                opacity: anim,
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
              },
            ]}
          >
            <View style={styles.check}>
              <Icon name="check" size={12} color={colors.ok} stroke={3} />
            </View>
            <Text style={styles.label}>{toast.label}</Text>
            {toast.text ? (
              <Text style={styles.text} numberOfLines={1}>
                {toast.text}
              </Text>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingLeft: 12,
    paddingRight: 16,
    backgroundColor: 'rgba(38,35,32,0.97)',
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 18,
    maxWidth: 340,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(34,197,94,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  text: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, flexShrink: 1 },
});
