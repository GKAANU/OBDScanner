import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useGarage } from '../../../src/garage/store';
import { useProGate } from '../../../src/pro/entitlement';
import { Icon } from '../../../src/ui/icons';
import { Card, Hint, Screen } from '../../../src/ui/primitives';
import { SubHeader } from '../../../src/ui/SubHeader';
import { useToast } from '../../../src/ui/toast';
import { colors, fonts, tabular } from '../../../src/ui/theme';
import { formatThousands } from '../../../src/utils/format';

export default function AraclarScreen() {
  const { vehicles, activeId, selectVehicle, removeVehicle } = useGarage();
  const gate = useProGate();
  const toast = useToast();

  const confirmRemove = (id: string, name: string) => {
    if (vehicles.length <= 1) {
      Alert.alert('Silinemez', 'En az bir araç kalmalı. Bilgilerini Aracı düzenle ile değiştirebilirsin.');
      return;
    }
    Alert.alert(`${name} silinsin mi?`, 'Bu aracın bakım geçmişi, tarihleri ve son taraması da silinir. Geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => removeVehicle(id) },
    ]);
  };

  return (
    <Screen>
      <SubHeader title="Araçlarım" sub={`${vehicles.length} araç · aktif araç Garaj'da gösterilir`} />

      <Card style={{ marginTop: 18 }}>
        {vehicles.map((v, i) => {
          const active = v.id === activeId;
          return (
            <Pressable
              key={v.id}
              onPress={() => {
                if (active) return;
                selectVehicle(v.id);
                toast('Araç değişti', v.name);
              }}
              onLongPress={() => confirmRemove(v.id, v.name)}
              delayLongPress={450}
              style={({ pressed }) => [styles.row, i > 0 && styles.border, pressed && { opacity: 0.75 }]}
            >
              <View style={[styles.dot, { backgroundColor: active ? colors.blue : colors.track }]} />
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {v.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {[`${v.brand} ${v.model}`.trim(), v.year ? String(v.year) : null, v.plate || null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Text style={[styles.km, tabular]}>{formatThousands(v.km)} km</Text>
              {active ? <Icon name="check" size={18} color={colors.blue} stroke={2.4} /> : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => gate('multi-vehicle', () => router.push('/onboarding?mode=add'))}
          style={({ pressed }) => [styles.row, styles.border, pressed && { opacity: 0.75 }]}
        >
          <Icon name="plus" size={16} color={colors.blue} stroke={2} />
          <Text style={styles.add}>Araç ekle</Text>
          <Text style={styles.pro}>Pro</Text>
        </Pressable>
      </Card>

      <Hint>Dokun: aktif araç yap · Basılı tut: sil</Hint>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  border: { borderTopWidth: 1, borderTopColor: colors.line },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  sub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginTop: 2 },
  km: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  add: { flex: 1, color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 15 },
  pro: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 12 },
});
