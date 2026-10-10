import { chooseChannel, chunk, fromBase64, fullUuid, isLikelyObd, toBase64, type GattChar } from './ble-profile';

const ch = (service: string, uuid: string, p: Partial<GattChar>): GattChar => ({
  service, uuid, notify: false, indicate: false, write: false, writeNoResponse: false, ...p,
});

describe('chooseChannel', () => {
  it('picks the common FFF0 clone layout', () => {
    const c = chooseChannel([
      ch('0000180a-0000-1000-8000-00805f9b34fb', '00002a29-0000-1000-8000-00805f9b34fb', {}),
      ch('0000fff0-0000-1000-8000-00805f9b34fb', '0000fff1-0000-1000-8000-00805f9b34fb', { notify: true }),
      ch('0000fff0-0000-1000-8000-00805f9b34fb', '0000fff2-0000-1000-8000-00805f9b34fb', { write: true, writeNoResponse: true }),
    ]);
    expect(c).toMatchObject({ profile: 'fff0', notifyChar: '0000fff1-0000-1000-8000-00805f9b34fb', withResponse: false });
  });
  it('handles HM-10 single characteristic and with-response writes', () => {
    const c = chooseChannel([ch('FFE0', 'FFE1', { notify: true, write: true })]);
    expect(c).toMatchObject({ profile: 'ffe0', notifyChar: 'FFE1', writeChar: 'FFE1', withResponse: true });
  });
  it('recognizes vLinker 18F0', () => {
    const c = chooseChannel([
      ch('18f0', '2af0', { notify: true }),
      ch('18f0', '2af1', { writeNoResponse: true }),
    ]);
    expect(c?.profile).toBe('18f0');
  });
  it('falls back to any non-system service with notify + write', () => {
    const c = chooseChannel([
      ch('1800', '2a00', { write: true, notify: true }),
      ch('abcd1234-0000-4000-8000-000000000001', 'aa01', { indicate: true }),
      ch('abcd1234-0000-4000-8000-000000000001', 'aa02', { write: true }),
    ]);
    expect(c).toMatchObject({ profile: 'generic', notifyChar: 'aa01', writeChar: 'aa02' });
  });
  it('returns null without a usable pair', () => {
    expect(chooseChannel([ch('fff0', 'fff1', { notify: true })])).toBeNull();
    expect(chooseChannel([])).toBeNull();
  });
});

describe('codec and helpers', () => {
  it('round-trips latin1 text through base64', () => {
    for (const s of ['ATZ\r', '41 0C 1A F8\r\r>', 'ab', 'a', '', '\xff\x00>']) {
      expect(fromBase64(toBase64(s))).toBe(s);
    }
    expect(toBase64('ATZ\r')).toBe('QVRaDQ==');
    expect(fromBase64('NDEgMEMNPg==')).toBe('41 0C\r>');
  });
  it('chunks writes to 20 bytes', () => {
    expect(chunk('0123456789012345678901234')).toEqual(['01234567890123456789', '01234']);
    expect(chunk('ATZ\r')).toEqual(['ATZ\r']);
  });
  it('expands short UUIDs and spots OBD adapters', () => {
    expect(fullUuid('FFF0')).toBe('0000fff0-0000-1000-8000-00805f9b34fb');
    expect(isLikelyObd('OBDII')).toBe(true);
    expect(isLikelyObd('IOS-Vlink')).toBe(true);
    expect(isLikelyObd('HH OBD Advanced')).toBe(true);
    expect(isLikelyObd('AirPods Pro')).toBe(false);
    expect(isLikelyObd(null, ['0000fff0-0000-1000-8000-00805f9b34fb'])).toBe(true);
  });
});
