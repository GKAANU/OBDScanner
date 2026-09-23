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
import { DEFAULT_LIVE_PIDS } from './pid-registry';
import { userMessage } from './protocol';
import { TcpTransport } from './transport-tcp';
import { DemoTransport } from './transport-demo';

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
  /** Connect using the saved config; `overrides` (e.g. { demo: true }) are saved first. */
  connect: (overrides?: Partial<OBDConfig>) => Promise<void>;
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
  const connectingRef = useRef(false);
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
            setConfigState({
              host: parsed.host,
              port: parsed.port,
              timeoutMs: parsed.timeoutMs ?? DEFAULT_OBD_CONFIG.timeoutMs,
              slowEcu: !!parsed.slowEcu,
              demo: !!parsed.demo,
            });
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
      const v = await c.readBatteryVoltage();
      if (v != null) setBattery(v);
    } catch {
      // ignore
    }
  }, []);

  const clearSession = useCallback(() => {
    setBattery(null);
    setProtocolName(null);
    setAdapterVersion(null);
  }, []);

  // Link dropped without the user asking (dongle unplugged, Wi-Fi lost).
  useEffect(() => {
    const c = clientRef.current;
    c.setDisconnectListener((err) => {
      clearSession();
      setErrorMessage(userMessage(err));
      setState('error');
    });
    return () => c.setDisconnectListener(null);
  }, [clearSession]);

  const connect = useCallback(async (overrides?: Partial<OBDConfig>) => {
    const c = clientRef.current;
    if (c.isConnected() || connectingRef.current) return;
    connectingRef.current = true;
    const cfg: OBDConfig = overrides ? { ...config, ...overrides } : config;
    if (overrides) setConfig(cfg);
    setErrorMessage(null);
    setState('connecting');
    try {
      // Demo mode never opens a socket: it talks to the in-memory simulator.
      const transport = cfg.demo ? new DemoTransport() : new TcpTransport(cfg.host, cfg.port);
      await c.connect(transport, cfg);
      setState('initializing');
      await c.init();
      // Capture protocol + adapter version + battery for the status bar.
      try {
        setProtocolName(await c.readProtocolName());
      } catch {}
      try {
        setAdapterVersion(await c.readAdapterVersion());
      } catch {}
      try {
        const v = await c.readBatteryVoltage();
        if (v != null) setBattery(v);
      } catch {}
      setState('ready');
    } catch (e) {
      setErrorMessage(userMessage(e));
      setState('error');
      clearSession();
      try {
        c.disconnect();
      } catch {}
    } finally {
      connectingRef.current = false;
    }
  }, [config, setConfig, clearSession]);

  const disconnect = useCallback(() => {
    clientRef.current.disconnect();
    setErrorMessage(null);
    setState('idle');
    clearSession();
  }, [clearSession]);

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
