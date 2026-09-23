import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { Tabs } from 'expo-router';
import { useFonts as useGeist, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { useFonts as useGeistMono, GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold } from '@expo-google-fonts/geist-mono';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OBDProvider } from '../src/obd/context';
import { colors, fonts, fontSize } from '../src/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const FONT_TIMEOUT_MS = 4000;

export default function RootLayout() {
  const [geistLoaded, geistError] = useGeist({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold });
  const [monoLoaded, monoError] = useGeistMono({ GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold });
  // Never get stuck on the splash: if the fonts fail or take too long,
  // continue with the system font (unknown fontFamily falls back on iOS).
  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);
  const ready = ((geistLoaded || !!geistError) && (monoLoaded || !!monoError)) || fontTimeout;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Yükleniyor…</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <OBDProvider>
        <StatusBar style="light" />
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.bg },
            tabBarStyle: {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              borderTopWidth: 1,
            },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.muted,
            // Text-only tabs: without this React Navigation draws a
            // placeholder glyph where the icon would be.
            tabBarIcon: () => null,
            tabBarIconStyle: { display: 'none' },
            tabBarLabelStyle: {
              fontFamily: fonts.bodyMedium,
              fontSize: fontSize.m,
            },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Tanı' }} />
          <Tabs.Screen name="live" options={{ title: 'Canlı' }} />
          <Tabs.Screen name="vehicle" options={{ title: 'Araç' }} />
          <Tabs.Screen name="terminal" options={{ title: 'Terminal' }} />
        </Tabs>
      </OBDProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.mutedStrong,
    fontSize: fontSize.m,
  },
});
