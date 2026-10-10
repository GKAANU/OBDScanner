import React, { useEffect, useState } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useOBD } from '../../../src/obd/context';
import { HOST_PRESETS, sameEndpoint, type Endpoint } from '../../../src/obd/presets';
import { ConnectErrorText } from '../../../src/ui/ConnectError';
import { CopyLogButton, DiagLogSection } from '../../../src/ui/DiagLogSection';
import { Icon } from '../../../src/ui/icons';
import { Button, Card, Screen, Toggle } from '../../../src/ui/primitives';
import { SubHeader } from '../../../src/ui/SubHeader';
import { colors, fonts } from '../../../src/ui/theme';

/** Parse the typed host/port; null when invalid (no alert). */
function parseEndpoint(host: string, port: string): Endpoint | null {
  const p = parseInt(port, 10);
  if (!host.trim() || isNaN(p) || p <= 0 || p > 65535) return null;
  return { host: host.trim(), port: p };
}

export default function BaglantiScreen() {
  const {
    state,
    config,
    setConfig,
    connect,
    disconnect,
    autoDetect,
    statusText,
    errorMessage,
    errorDetail,
    battery,
    adapterVersion,
    protocolName,
    hydrated,
  } = useOBD();
  const [hostInput, setHostInput] = useState(config.host);
  const [portInput, setPortInput] = useState(String(config.port));

  // Otomatik bul (or a preset connect) saved a new endpoint: show it.
  useEffect(() => {
    setHostInput(config.host);
    setPortInput(String(config.port));
  }, [config.host, config.port]);

  const busy = state === 'connecting' || state === 'initializing';
  const ready = state === 'ready';

  /** Validate the fields; alert and return null when invalid. */
  const readEndpoint = (): Endpoint | null => {
    const p = parseInt(portInput, 10);
    if (isNaN(p) || p <= 0 || p > 65535) {
      Alert.alert('Geçersiz port', 'Port 1-65535 arasında bir sayı olmalı.');
      return null;
    }
    if (!hostInput.trim()) {
      Alert.alert('Geçersiz host', 'Host boş olamaz.');
      return null;
    }
    return { host: hostInput.trim(), port: p };
  };

  /** Save typed values on blur when valid and changed. */
  const saveIfValid = () => {
    const ep = parseEndpoint(hostInput, portInput);
    if (ep && !sameEndpoint(ep, config)) setConfig({ ...config, ...ep });
  };

  const onConnect = () => {
    const ep = readEndpoint();
    if (!ep) return;
    Keyboard.dismiss();
    // Real adapter only: a demo flag saved earlier must not leak in here.
    void connect({ ...ep, demo: false });
  };

  const onReconnect = () => {
    const ep = readEndpoint();
    if (!ep) return;
    disconnect();
    void connect({ ...ep, demo: !!config.demo });
  };

  const onAutoDetect = () => {
    Keyboard.dismiss();
    const typed = parseEndpoint(hostInput, portInput) ?? { host: config.host, port: config.port };
    void autoDetect(typed);
  };

  const dot =
    state === 'ready' ? colors.ok : state === 'error' ? colors.error : busy ? colors.warn : colors.faint;
  const title =
    state === 'ready' ? 'Bağlı' : busy ? 'Bağlanıyor…' : state === 'error' ? 'Bağlanamadı' : 'Bağlı değil';
  const sub = ready
    ? [config.demo ? 'Demo' : adapterVersion, protocolName, battery != null ? `${battery.toFixed(1)} V` : null]
        .filter(Boolean)
        .join(' · ')
    : busy
      ? statusText ?? `${config.host}:${config.port}`
      : "Dongle'ın Wi-Fi ağına katıl, sonra Bağlan'a dokun.";

  return (
    <Screen>
      <SubHeader title="Bağlantı ayarları" />

      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>{title}</Text>
          <Text style={styles.statusSub}>{sub}</Text>
        </View>
      </View>

      {state === 'error' && errorMessage ? (
        <View style={styles.errorBox}>
          <ConnectErrorText message={errorMessage} detail={errorDetail} />
          <View style={{ marginTop: 10 }}>
            <CopyLogButton compact />
          </View>
        </View>
      ) : null}

      <Card style={{ marginTop: 10 }}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Host</Text>
          <TextInput
            value={hostInput}
            onChangeText={setHostInput}
            onBlur={saveIfValid}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            placeholder="192.168.0.10"
            placeholderTextColor={colors.faint}
            editable={!busy}
            style={styles.fieldInput}
          />
        </View>
        <View style={[styles.field, styles.border]}>
          <Text style={styles.fieldLabel}>Port</Text>
          <TextInput
            value={portInput}
            onChangeText={(v) => setPortInput(v.replace(/\D/g, ''))}
            onBlur={saveIfValid}
            keyboardType="number-pad"
            placeholder="35000"
            placeholderTextColor={colors.faint}
            editable={!busy}
            style={styles.fieldInput}
          />
        </View>
      </Card>

      <Text style={styles.chipsLabel}>Sık kullanılan adresler</Text>
      <View style={styles.chips}>
        {HOST_PRESETS.map((p) => {
          const active = sameEndpoint(p, { host: hostInput.trim(), port: parseInt(portInput, 10) });
          return (
            <Pressable
              key={p.label}
              disabled={busy}
              onPress={() => {
                // Fill the fields only; the user still taps Bağlan.
                setHostInput(p.host);
                setPortInput(String(p.port));
              }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && { color: colors.text }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ marginTop: 14 }}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Demo modu</Text>
            <Text style={styles.toggleSub}>Dongle olmadan örnek verilerle dene. Gösterilen veriler gerçek değildir.</Text>
          </View>
          <Toggle
            on={!!config.demo}
            disabled={!hydrated || busy}
            onChange={(v) => {
              if (state !== 'idle' && state !== 'error') disconnect();
              // Demo is entered only on explicit request: start it now.
              if (v) void connect({ demo: true });
              else setConfig({ ...config, demo: false });
            }}
          />
        </View>
        <View style={[styles.toggleRow, styles.border]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Yavaş ECU modu</Text>
            <Text style={styles.toggleSub}>Eski / yavaş ECU'lar için (ATST 96, uzun zaman aşımı). Sonraki bağlantıda geçerli.</Text>
          </View>
          <Toggle on={!!config.slowEcu} onChange={(v) => setConfig({ ...config, slowEcu: v })} />
        </View>
      </Card>

      <View style={styles.buttons}>
        {ready ? (
          <>
            <Button label="Yeniden bağlan" onPress={onReconnect} style={{ flex: 1 }} />
            <Button label="Kapat" variant="secondary" onPress={disconnect} style={{ flex: 1 }} />
          </>
        ) : busy ? (
          <Button label="Vazgeç" variant="secondary" onPress={disconnect} style={{ flex: 1 }} />
        ) : (
          <>
            <Button label="Bağlan" onPress={onConnect} disabled={!hydrated} style={{ flex: 1 }} />
            <Button label="Otomatik bul" variant="secondary" onPress={onAutoDetect} disabled={!hydrated} style={{ flex: 1 }} />
          </>
        )}
      </View>
      {busy && statusText ? <Text style={styles.progress}>{statusText}</Text> : null}

      <View style={{ marginTop: 18 }}>
        <DiagLogSection />
      </View>

      <View style={styles.privacy}>
        <Icon name="lock" size={12} color={colors.muted} stroke={1.8} />
        <Text style={styles.privacyText}>Otova hiçbir veriyi internete göndermez. Tüm trafik sadece dongle'a gider.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: {
    marginTop: 18,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  statusSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  errorBox: {
    marginTop: 10,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.28)',
    borderRadius: 16,
    padding: 14,
  },
  field: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 16 },
  border: { borderTopWidth: 1, borderTopColor: colors.line },
  fieldLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, width: 80 },
  fieldInput: { flex: 1, color: colors.text, fontFamily: fonts.monoMedium, fontSize: 14, textAlign: 'right', paddingVertical: 0 },
  chipsLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13, marginTop: 14, marginBottom: 8, marginHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#171513', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { borderColor: colors.blue, backgroundColor: colors.blueBg },
  chipText: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  toggleTitle: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  toggleSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17.5, marginTop: 2 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 14 },
  progress: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12, marginTop: 10, marginHorizontal: 4 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 },
  privacyText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, textAlign: 'center', flexShrink: 1 },
});
