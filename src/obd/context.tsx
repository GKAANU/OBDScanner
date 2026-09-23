import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OBDClient, type OBDConfig, DEFAULT_OBD_CONFIG } from './client';
import {
  detectOBDError,
  parseBatteryVoltage,
} from './parsers';
import { DEFAULT_LIVE_PIDS } from './pid-registry';

export type ConnectionState = 'idle' | 'connecting' | 'initializing' | 'ready' | 'error';

type Ctx = {
  client: OBDClient;
  config: OBDConfig;
  setConfig: (c: OBDConfig) => void;
  state: ConnectionState;
  errorMessage: string | null;
  protocolName: string | null;
  battery: number | null;
  adapterVersion: string | null;
  selectedLivePids: string[];
  setSelectedLivePids: (ids: string[]) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBattery: () => Promise<void>;
};

const OBDContext = createContext<Ctx | null>(null);

const STORAGE_KEYS = {
  config: 'otova.obd.config',
  livePids: 'otova.live.pids',
} as const;

export function OBDProvider({ children }: { children: React.ReactNode }) {
  const clientRef = useRef<OBDClient>(new OBDClient());
  const [config, setConfigState] = useState<OBDConfig>(DEFAULT_OBD_CONFIG);
  const [state, setState] = useState<ConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [protocolName, setProtocolName] = useState<string | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [adapterVersion, setAdapterVersion] = useState<string | null>(null);
  const [selectedLivePids, setSelectedLivePidsState] = useState<string[]>(DEFAULT_LIVE_PIDS);

  // Hydrate persisted config + selected PIDs (Phase 4 persistence).
  useEffect(() => {
    (async () => {
      try {
        const rawCfg = await AsyncStorage.getItem(STORAGE_KEYS.config);
        if (rawCfg) {
          const parsed = JSON.parse(rawCfg) as Partial<OBDConfig>;
          if (parsed.host && parsed.port) {
            setConfigState({ host: parsed.host, port: parsed.port, timeoutMs: parsed.timeoutMs ?? 5000 });
          }
        }
        const rawPids = await AsyncStorage.getItem(STORAGE_KEYS.livePids);
        if (rawPids) {
          const arr = JSON.parse(rawPids);
          if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
            setSelectedLivePidsState(arr);
          }
        }
      } catch {
        // ignore — fall back to defaults
      }
    })();
  }, []);

  const setConfig = useCallback((c: OBDConfig) => {
    setConfigState(c);
    AsyncStorage.setItem(STORAGE_KEYS.config, JSON.stringify(c)).catch(() => {});
  }, []);

  const setSelectedLivePids = useCallback((ids: string[]) => {
    setSelectedLivePidsState(ids);
    AsyncStorage.setItem(STORAGE_KEYS.livePids, JSON.stringify(ids)).catch(() => {});
  }, []);

  const refreshBattery = useCallback(async () => {
    try {
      const c = clientRef.current;
      if (!c.isConnected()) return;
      const raw = await c.batteryVoltage();
      const v = parseBatteryVoltage(raw);
      if (v != null) setBattery(v);
    } catch {
      // ignore
    }
  }, []);

  const connect = useCallback(async () => {
    const c = clientRef.current;
    if (c.isConnected()) return;
    setErrorMessage(null);
    setState('connecting');
    try {
      await c.connect(config);
      setState('initializing');
      await c.init();
      // Capture protocol + adapter version + battery for the status bar.
      try {
        const proto = await c.protocolName();
        const err = detectOBDError(proto);
        if (!err) setProtocolName(proto.trim());
      } catch {}
      try {
        const ver = await c.adapterVersion();
        setAdapterVersion(ver.trim());
      } catch {}
      try {
        const raw = await c.batteryVoltage();
        const v = parseBatteryVoltage(raw);
        if (v != null) setBattery(v);
      } catch {}
      setState('ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMessage(translateError(msg));
      setState('error');
      try {
        c.disconnect();
      } catch {}
    }
  }, [config]);

  const disconnect = useCallback(() => {
    clientRef.current.disconnect();
    setState('idle');
    setBattery(null);
    setProtocolName(null);
    setAdapterVersion(null);
  }, []);

  // Periodic battery refresh while connected (every 30s).
  useEffect(() => {
    if (state !== 'ready') return;
    const id = setInterval(() => {
      void refreshBattery();
    }, 30_000);
    return () => clearInterval(id);
  }, [state, refreshBattery]);

  // Disconnect on unmount.
  useEffect(() => {
    return () => {
      try {
        clientRef.current.disconnect();
      } catch {}
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      client: clientRef.current,
      config,
      setConfig,
      state,
      errorMessage,
      protocolName,
      battery,
      adapterVersion,
      selectedLivePids,
      setSelectedLivePids,
      connect,
      disconnect,
      refreshBattery,
    }),
    [
      config,
      setConfig,
      state,
      errorMessage,
      protocolName,
      battery,
      adapterVersion,
      selectedLivePids,
      setSelectedLivePids,
      connect,
      disconnect,
      refreshBattery,
    ]
  );

  return <OBDContext.Provider value={value}>{children}</OBDContext.Provider>;
}

export function useOBD(): Ctx {
  const ctx = useContext(OBDContext);
  if (!ctx) throw new Error('useOBD must be used inside OBDProvider');
  return ctx;
}

function translateError(msg: string): string {
  if (/timeout/i.test(msg)) {
    return 'Adaptör cevap vermedi. Wi-Fi bağlantısını ve dongle’ı kontrol et.';
  }
  if (/ECONNREFUSED/i.test(msg) || /connect/i.test(msg)) {
    return 'Bağlanılamadı. Wi-Fi adı, IP ve port doğru mu?';
  }
  if (/UNABLE TO CONNECT/i.test(msg)) {
    return 'Araç ECU’suna ulaşılamadı. Kontağı açıp tekrar dene.';
  }
  return msg;
}
