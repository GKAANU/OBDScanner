import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts as useGeist, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { useFonts as useGeistMono, GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold } from '@expo-google-fonts/geist-mono';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OBDProvider } from '../src/obd/context';
import { GarageProvider } from '../src/garage/store';
import { ToastProvider } from '../src/ui/toast';
import { ProProvider } from '../src/pro/entitlement';
import { ReminderSync } from '../src/notify/ReminderSync';
import { colors } from '../src/ui/theme';

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
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <GarageProvider>
        <OBDProvider>
          <ProProvider>
            <ToastProvider>
              <ReminderSync />
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
                <Stack.Screen name="pro" options={{ presentation: 'modal' }} />
              </Stack>
            </ToastProvider>
          </ProProvider>
        </OBDProvider>
      </GarageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
