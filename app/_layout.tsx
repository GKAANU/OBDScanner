import React, { useEffect } from 'react';
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

export default function RootLayout() {
  const [geistLoaded] = useGeist({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold });
  const [monoLoaded] = useGeistMono({ GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold });
  const ready = geistLoaded && monoLoaded;

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
            tabBarLabelStyle: {
              fontFamily: fonts.bodyMedium,
              fontSize: fontSize.xs,
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
