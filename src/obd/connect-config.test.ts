import { canStartConnect, resolveConnectConfig } from './connect-config';
import { DEFAULT_OBD_CONFIG, type OBDConfig } from './client';

const savedDemo: OBDConfig = { ...DEFAULT_OBD_CONFIG, host: '192.168.0.11', demo: true };

describe('resolveConnectConfig', () => {
  it('never enters demo mode from a saved flag (settings sheet Bağlan)', () => {
    const cfg = resolveConnectConfig(savedDemo, { host: '192.168.4.1', port: 35000, demo: false });
    expect(cfg).toMatchObject({ host: '192.168.4.1', port: 35000, demo: false });
  });
  it('defaults to demo: false even when the caller omits it', () => {
    expect(resolveConnectConfig(savedDemo).demo).toBe(false);
    expect(resolveConnectConfig(savedDemo, { host: '10.10.100.254', port: 8899 }).demo).toBe(false);
  });
  it('enters demo mode only when asked explicitly', () => {
    expect(resolveConnectConfig(DEFAULT_OBD_CONFIG, { demo: true }).demo).toBe(true);
  });
  it('keeps saved fields the caller did not override', () => {
    const cfg = resolveConnectConfig({ ...savedDemo, slowEcu: true }, { demo: false });
    expect(cfg).toMatchObject({ host: '192.168.0.11', slowEcu: true });
  });
});

describe('canStartConnect', () => {
  it('waits for settings hydration', () => {
    expect(canStartConnect({ hydrated: false, connected: false, connecting: false })).toBe(false);
    expect(canStartConnect({ hydrated: true, connected: false, connecting: false })).toBe(true);
  });
  it('refuses while connected or connecting', () => {
    expect(canStartConnect({ hydrated: true, connected: true, connecting: false })).toBe(false);
    expect(canStartConnect({ hydrated: true, connected: false, connecting: true })).toBe(false);
  });
});
