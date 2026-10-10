import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SubHeader } from '../../../src/ui/SubHeader';
import { Button, Card, Chip, Divider, Screen, SectionHeader, Toggle } from '../../../src/ui/primitives';
import { Icon } from '../../../src/ui/icons';
import { colors, fonts, tabular } from '../../../src/ui/theme';
import { usePro, useProGate } from '../../../src/pro/entitlement';
import { useReminderSettings } from '../../../src/notify/settings';
import { usePlannedReminders } from '../../../src/notify/ReminderSync';

type Perm = 'granted' | 'denied' | 'undetermined' | 'unknown';

const HOURS = [8, 10, 12, 18];

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function whenText(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HatirlatmalarScreen() {
  const [settings, update] = useReminderSettings();
  const { isPro } = usePro();
  const gate = useProGate();
  const planned = usePlannedReminders();
  const [perm, setPerm] = useState<Perm>('unknown');

  const readPerm = useCallback(async () => {
    try {
      const p = await Notifications.getPermissionsAsync();
      setPerm(p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined');
    } catch {
      setPerm('unknown');
    }
  }, []);

  useEffect(() => {
    void readPerm();
    // Re-check when returning from iOS Settings.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void readPerm();
    });
    return () => sub.remove();
  }, [readPerm]);

  const ask = async () => {
    try {
      await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    } catch {}
    await readPerm();
  };

  const proToggle = (key: 'maintenance' | 'seasonal') => (v: boolean) => {
    if (!isPro) {
      gate('reminders');
      return;
    }
    update({ [key]: v });
  };

  return (
    <Screen contentStyle={{ paddingTop: 2 }}>
      <SubHeader title="Hatırlatmalar" />

      {perm !== 'granted' ? (
        <Card hero style={styles.permCard}>
          <View style={styles.permRow}>
            <View style={styles.permIcon}>
              <Icon name="clock" size={20} color={colors.warn} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.permTitle}>{perm === 'denied' ? 'Bildirimler kapalı' : 'Bildirim izni gerekli'}</Text>
              <Text style={styles.permSub}>
                {perm === 'denied'
                  ? "Hatırlatmaların gelmesi için iPhone Ayarlar'dan Otova bildirimlerini aç."
                  : 'Muayene, sigorta, MTV ve bakım tarihleri yaklaşınca haber vermemiz için izin ver.'}
              </Text>
            </View>
          </View>
          {perm === 'denied' ? (
            <Button label="Ayarlar'dan aç" onPress={() => void Linking.openSettings()} compact style={styles.permBtn} />
          ) : (
            <Button label="Bildirimlere izin ver" onPress={() => void ask()} compact style={styles.permBtn} />
          )}
        </Card>
      ) : null}

      <Card style={styles.group}>
        <Row title="Hatırlatmalar açık" sub="Hepsini birden aç veya kapat." on={settings.enabled} onChange={(v) => update({ enabled: v })} />
        <Divider />
        <Row
          title="Belge ve tarihler"
          sub="Muayene, trafik sigortası, kasko, MTV ve eklediğin tarihler."
          on={settings.docs}
          onChange={(v) => update({ docs: v })}
          disabled={!settings.enabled}
        />
        <Divider />
        <Row
          title="Bakım"
          sub="Tarihe göre ve kilometreden tahmin edilen bakım zamanları."
          on={settings.maintenance && isPro}
          onChange={proToggle('maintenance')}
          disabled={!settings.enabled}
          pro={!isPro}
        />
        <Divider />
        <Row
          title="Mevsimsel lastik"
          sub="Kasım'da kış, Nisan'da yaz lastiği hatırlatması."
          on={settings.seasonal && isPro}
          onChange={proToggle('seasonal')}
          disabled={!settings.enabled}
          pro={!isPro}
        />
      </Card>

      <SectionHeader title="Saat" />
      <View style={styles.chips}>
        {HOURS.map((h) => {
          const on = settings.hour === h;
          return (
            <Pressable
              key={h}
              onPress={() => update({ hour: h })}
              style={[styles.hourChip, on && styles.hourChipOn]}
            >
              <Text style={[styles.hourText, on && styles.hourTextOn, tabular]}>{`${pad(h)}:00`}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionHeader title="Yaklaşan hatırlatmalar" />
      <Card>
        {planned.length === 0 ? (
          <Text style={styles.empty}>
            {settings.enabled ? 'Planlanmış hatırlatma yok. Belgeler ve tarihler ekranından tarih ekleyebilirsin.' : 'Hatırlatmalar kapalı.'}
          </Text>
        ) : (
          planned.slice(0, 8).map((r, i) => (
            <View key={r.id}>
              {i ? <Divider /> : null}
              <View style={styles.item}>
                <View style={styles.flex}>
                  <Text style={styles.itemTitle}>{r.title}</Text>
                  <Text style={styles.itemSub} numberOfLines={2}>
                    {r.body}
                  </Text>
                </View>
                <Text style={[styles.itemWhen, tabular]}>{whenText(r.date)}</Text>
              </View>
            </View>
          ))
        )}
      </Card>
      {perm !== 'granted' && planned.length > 0 ? (
        <Text style={styles.note}>İzin verilene kadar bu hatırlatmalar gönderilmez.</Text>
      ) : null}

      <View style={styles.footer}>
        <Icon name="lock" size={12} color={colors.faint} />
        <Text style={styles.footerText}>Hatırlatmalar bu iPhone'da planlanır; internet gerekmez.</Text>
      </View>
    </Screen>
  );
}

function Row({
  title,
  sub,
  on,
  onChange,
  disabled,
  pro,
}: {
  title: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  pro?: boolean;
}) {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.flex}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{title}</Text>
          {pro ? <Chip label="Pro" t="warn" /> : null}
        </View>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Toggle on={on} onChange={onChange} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  permCard: { marginTop: 18, padding: 16 },
  permRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  permIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.warnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  permSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 3 },
  permBtn: { marginTop: 14 },
  group: { marginTop: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  rowSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  disabled: { opacity: 0.5 },
  chips: { flexDirection: 'row', gap: 8 },
  hourChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#171513',
    justifyContent: 'center',
  },
  hourChipOn: { borderColor: colors.blue, backgroundColor: colors.blueBg },
  hourText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  hourTextOn: { color: colors.text },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, padding: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  itemTitle: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14.5 },
  itemSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, marginTop: 2 },
  itemWhen: { color: colors.amber, fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  note: { color: colors.warn, fontFamily: fonts.body, fontSize: 12.5, marginTop: 8, marginHorizontal: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24 },
  footerText: { color: colors.faint, fontFamily: fonts.body, fontSize: 12 },
});
