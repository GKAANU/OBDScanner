import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, Modal, TextInput, Alert } from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from './theme';
import { useOBD } from '../obd/context';
import { userMessage } from '../obd/protocol';

export function StatusBar() {
  const { state, config, protocolName, battery, errorMessage, connect, disconnect, setConfig, client } =
    useOBD();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hostInput, setHostInput] = useState(config.host);
  const [portInput, setPortInput] = useState(String(config.port));

  const dotColor =
    state === 'ready' ? colors.ok : state === 'error' ? colors.error : state === 'idle' ? colors.muted : colors.warn;
  const stateLabel: Record<typeof state, string> = {
    idle: 'Bağlı değil',
    connecting: 'Bağlanıyor…',
    initializing: 'Başlatılıyor…',
    ready: 'Hazır',
    error: 'Hata',
  };

  const openSettings = () => {
    setHostInput(config.host);
    setPortInput(String(config.port));
    setSettingsOpen(true);
  };

  const onSave = () => {
    const port = parseInt(portInput, 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
      Alert.alert('Geçersiz port', 'Port 1-65535 arasında bir sayı olmalı.');
      return;
    }
    if (!hostInput.trim()) {
      Alert.alert('Geçersiz host', 'Host boş olamaz.');
      return;
    }
    setConfig({ ...config, host: hostInput.trim(), port });
    setSettingsOpen(false);
  };

  const onClearDTCs = () => {
    Alert.alert(
      'Hata kodlarını sil?',
      'Hata kodlarını silmek arızayı çözmez, sadece lambayı söndürür. Altta yatan sorun sürerse kod tekrar gelecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.clearDTCs();
              Alert.alert('Tamam', 'Hata kodları silindi. Birkaç sürüş döngüsü sonrası kontrol et.');
            } catch (e) {
              Alert.alert('Hata', userMessage(e));
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Pressable onPress={openSettings} style={styles.bar}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={styles.host} numberOfLines={1}>
          {config.demo ? 'DEMO' : `${config.host}:${config.port}`}
        </Text>
        <Text style={styles.sep}>·</Text>
        <Text style={styles.label} numberOfLines={1}>
          {state === 'ready' && protocolName ? protocolName : stateLabel[state]}
        </Text>
        {battery != null ? (
          <>
            <Text style={styles.sep}>·</Text>
            <Text style={styles.battery}>{battery.toFixed(1)}V</Text>
          </>
        ) : null}
      </Pressable>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSettingsOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Bağlantı ayarları</Text>

            <View style={styles.flagRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.flagLabel}>Demo modu</Text>
                <Text style={styles.flagHint}>
                  Adaptör olmadan örnek bir araçla dene. Gösterilen veriler gerçek değildir.
                </Text>
              </View>
              <Switch
                value={!!config.demo}
                onValueChange={(v) => {
                  if (state !== 'idle' && state !== 'error') disconnect();
                  setConfig({ ...config, demo: v });
                }}
              />
            </View>

            <Text style={styles.fieldLabel}>Host</Text>
            <TextInput
              value={hostInput}
              onChangeText={setHostInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              placeholder="192.168.0.10"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Port</Text>
            <TextInput
              value={portInput}
              onChangeText={setPortInput}
              keyboardType="number-pad"
              placeholder="35000"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <View style={styles.flagRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.flagLabel}>Yavaş ECU modu</Text>
                <Text style={styles.flagHint}>
                  Eski / yavaş ECU’lar için (ATST 96, uzun zaman aşımı). Sonraki bağlantıda geçerli.
                </Text>
              </View>
              <Switch
                value={!!config.slowEcu}
                onValueChange={(v) => setConfig({ ...config, slowEcu: v })}
              />
            </View>

            <View style={styles.buttonRow}>
              <Pressable onPress={onSave} style={[styles.btn, styles.btnPrimary]}>
                <Text style={styles.btnPrimaryLabel}>Kaydet</Text>
              </Pressable>
              {state === 'idle' || state === 'error' ? (
                <Pressable
                  onPress={() => {
                    setSettingsOpen(false);
                    void connect();
                  }}
                  style={[styles.btn, styles.btnGhost]}
                >
                  <Text style={styles.btnGhostLabel}>Bağlan</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    disconnect();
                    setSettingsOpen(false);
                  }}
                  style={[styles.btn, styles.btnGhost]}
                >
                  <Text style={styles.btnGhostLabel}>Kapat</Text>
                </Pressable>
              )}
            </View>

            {state === 'ready' ? (
              <Pressable onPress={onClearDTCs} style={[styles.btn, styles.btnDanger]}>
                <Text style={styles.btnDangerLabel}>DTC’leri sil (Mode 04)</Text>
              </Pressable>
            ) : null}

            <Text style={styles.note}>
              Otova hiçbir veriyi internete göndermez. Tüm trafik sadece dongle’a gider.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginTop: spacing.m,
  },
  flagLabel: {
    color: colors.body,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.m,
  },
  flagHint: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.s,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  host: {
    color: colors.body,
    fontFamily: 'GeistMono_500Medium',
    fontSize: fontSize.m,
  },
  sep: {
    color: colors.muted,
  },
  label: {
    color: colors.mutedStrong,
    fontFamily: fonts.body,
    fontSize: fontSize.m,
    flexShrink: 1,
  },
  battery: {
    color: colors.value,
    fontFamily: 'GeistMono_500Medium',
    fontSize: fontSize.m,
  },
  error: {
    color: colors.error,
    backgroundColor: '#1f0d0d',
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
    fontFamily: fonts.body,
    fontSize: fontSize.s,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    padding: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: spacing.m,
    paddingBottom: spacing.xxxl,
  },
  sheetTitle: {
    color: colors.body,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xl,
    marginBottom: spacing.s,
  },
  fieldLabel: {
    color: colors.mutedStrong,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.s,
    marginTop: spacing.s,
  },
  input: {
    backgroundColor: colors.bg,
    color: colors.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    padding: spacing.m,
    fontFamily: 'GeistMono_400Regular',
    fontSize: fontSize.l,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.m,
    marginTop: spacing.m,
  },
  btn: {
    flex: 1,
    paddingVertical: spacing.m,
    borderRadius: radius.m,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.accent,
  },
  btnPrimaryLabel: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.m,
  },
  btnGhost: {
    backgroundColor: colors.cardElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhostLabel: {
    color: colors.body,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.m,
  },
  btnDanger: {
    backgroundColor: '#3b1414',
    borderWidth: 1,
    borderColor: colors.error,
    marginTop: spacing.m,
  },
  btnDangerLabel: {
    color: colors.error,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.m,
  },
  note: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    marginTop: spacing.s,
  },
});
