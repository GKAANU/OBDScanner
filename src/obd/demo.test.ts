import { OBDClient } from './client';
import { DEMO_VIN, DemoSimulator, demoLiveValue } from './demo';
import { parsePidResponse, PID_BY_ID, PID_REGISTRY } from './pid-registry';
import { DemoTransport } from './transport-demo';

async function demoClient(): Promise<OBDClient> {
  const c = new OBDClient();
  await c.connect(new DemoTransport(1), { timeoutMs: 3000 });
  await c.init();
  return c;
}

describe('demo mode end to end (OBDClient + parsers + DemoTransport)', () => {
  it('initializes and reports adapter info', async () => {
    const c = await demoClient();
    expect(await c.readProtocolName()).toMatch(/ISO 15765-4/);
    expect(await c.readAdapterVersion()).toBe('ELM327 v1.5');
    const v = await c.readBatteryVoltage();
    expect(v).toBeGreaterThan(13);
    c.disconnect();
  });

  it('reads DTCs, freeze frame and vehicle info', async () => {
    const c = await demoClient();
    expect(await c.readDTCs('stored')).toEqual(['P0133', 'P0420']);
    expect(await c.readDTCs('pending')).toEqual(['P0171']);
    expect(await c.readDTCs('permanent')).toEqual(['P0420']);

    const ff = await c.readFreezeFrame();
    expect(ff.dtc).toBe('P0133');
    const byId = Object.fromEntries(ff.values.map((x) => [x.def.id, x.value as number]));
    expect(byId.RPM).toBe(2120);
    expect(byId.ECT).toBe(88);
    expect(byId.SPD).toBe(64);

    const info = await c.readVehicleInfo();
    expect(info.vin).toBe(DEMO_VIN);
    expect(info.calId).toBe('DEMO-CAL-0001');
    expect(info.cvn).toBe('1A2B3C4D');
    expect(info.ecuName).toBe('ECM-DEMO MOTOR');

    const r = await c.readReadiness();
    expect(r?.milOn).toBe(true);
    expect(r?.dtcCount).toBe(2);
    c.disconnect();
  });

  it('supports every registry PID except bank 2 fuel trims', async () => {
    const c = await demoClient();
    const supported = await c.readSupportedPids();
    for (const p of PID_REGISTRY) {
      const expected = p.id !== 'STFT2' && p.id !== 'LTFT2';
      expect([p.id, supported.includes(p.pid)]).toEqual([p.id, expected]);
    }
    expect(await c.readPid('STFT2')).toMatchObject({ status: 'unsupported' });
    const rpm = await c.readPid('RPM');
    expect(rpm.status).toBe('ok');
    c.disconnect();
  });

  it('Mode 04 clears stored/pending codes and the freeze frame, not permanent ones', async () => {
    const c = await demoClient();
    await c.clearDTCs();
    expect(await c.readDTCs('stored')).toEqual([]);
    expect(await c.readDTCs('pending')).toEqual([]);
    expect(await c.readDTCs('permanent')).toEqual(['P0420']);
    expect((await c.readFreezeFrame()).dtc).toBeNull();
    const r = await c.readReadiness();
    expect(r?.milOn).toBe(false);
    expect(r?.monitors.filter((m) => m.supported && !m.ready).length).toBeGreaterThan(0);
    c.disconnect();
  });
});

describe('DemoSimulator live data', () => {
  const sim = new DemoSimulator();
  const at = (id: string, t: number) => {
    const def = PID_BY_ID[id];
    return parsePidResponse(def, sim.respond(`01${def.pid}`, t)) as number;
  };

  it('values change over time so the live tab animates', () => {
    const rpm = [0, 1, 2, 3, 4].map((t) => at('RPM', t));
    expect(new Set(rpm.map(Math.round)).size).toBeGreaterThan(3);
    expect(at('SPD', 0)).not.toBe(at('SPD', 10));
  });

  it('stays in physically plausible ranges', () => {
    for (let t = 0; t < 600; t += 7) {
      expect(at('RPM', t)).toBeGreaterThan(600);
      expect(at('RPM', t)).toBeLessThan(3500);
      expect(at('ECT', t)).toBeGreaterThanOrEqual(57);
      expect(at('ECT', t)).toBeLessThanOrEqual(91);
      expect(Math.abs(at('STFT1', t))).toBeLessThan(5);
    }
  });

  it('encodes values the registry decodes back (round trip within 1 LSB)', () => {
    const t = 12.3;
    for (const id of ['RPM', 'SPD', 'ECT', 'MAF', 'MAP', 'CMV', 'LAM', 'FRATE', 'ADV']) {
      const expected = demoLiveValue(id, t);
      expect([id, Math.abs(at(id, t) - expected) < 1]).toEqual([id, true]);
    }
  });

  it('answers unknown commands like an ELM327', () => {
    expect(sim.respond('HELLO', 0)).toBe('?\r\r>');
    expect(sim.respond('0199', 0)).toBe('NO DATA\r\r>');
    expect(sim.respond('ATE0', 0)).toBe('OK\r\r>');
  });
});
