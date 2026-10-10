import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useGarage } from '../../src/garage/store';
import { usePlan } from '../../src/garage/usePlan';
import { Icon, type IconName } from '../../src/ui/icons';
import { colors, fonts } from '../../src/ui/theme';

function tabIcon(name: IconName, dot?: string) {
  return ({ color }: { color: string }) => (
    <View>
      <Icon name={name} size={25} color={color} stroke={1.5} />
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const { hydrated, vehicle, lastScan } = useGarage();
  const { counts } = usePlan();

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }
  if (!vehicle) return <Redirect href="/onboarding" />;

  const dtcCount = lastScan ? lastScan.stored.length + lastScan.pending.length : 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: 'rgba(12,11,10,0.96)', borderTopColor: '#1f1c19', borderTopWidth: 1 },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Garaj', tabBarIcon: tabIcon('tabGaraj') }} />
      <Tabs.Screen
        name="bakim"
        options={{ title: 'Bakım', tabBarIcon: tabIcon('tabBakim', counts.over > 0 ? colors.error : undefined) }}
      />
      <Tabs.Screen
        name="tani"
        options={{ title: 'Tanı', tabBarIcon: tabIcon('tabTani', dtcCount > 0 ? colors.warn : undefined) }}
      />
      <Tabs.Screen name="canli" options={{ title: 'Canlı', tabBarIcon: tabIcon('tabCanli') }} />
      <Tabs.Screen name="daha" options={{ title: 'Daha fazla', tabBarIcon: tabIcon('tabDaha') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
