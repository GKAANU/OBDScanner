import {
  parseDTCs,
  parseVIN,
  parseReadiness,
  parseMode09Ascii,
  parseCVN,
  parseBatteryVoltage,
  detectOBDError,
} from './parsers';
import {
  parsePidResponse,
  PID_BY_ID,
  parseSupportedPids,
  extractDataBytes,
} from './pid-registry';

describe('parseDTCs', () => {
  it('parses single P-code', () => {
    expect(parseDTCs('43 01 33 00 00 00 00 >')).toEqual(['P0133']);
  });

  it('parses multiple codes', () => {
    expect(parseDTCs('43 02 01 43 04 20 00 00 >')).toEqual(['P0143', 'P0420']);
  });

  it('parses U-code', () => {
    expect(parseDTCs('43 01 C1 00 >')).toEqual(['U0100']);
  });

  it('handles multi-frame line prefixes', () => {
    expect(
      parseDTCs('0: 43 06 01 43 04 20\n1: 03 01 02 02 00 00\n')
    ).toEqual(['P0143', 'P0420', 'P0301', 'P0202']);
  });

  it('parses Mode 07 pending', () => {
    // Mode 07 with explicit count byte (ISO 15765 framing): 2 DTCs.
    expect(parseDTCs('47 02 01 33 04 20 >')).toEqual(['P0133', 'P0420']);
  });

  it('parses Mode 0A permanent', () => {
    expect(parseDTCs('4A 01 04 20 >')).toEqual(['P0420']);
  });

  it('returns empty for NO DATA', () => {
    expect(parseDTCs('NO DATA >')).toEqual([]);
  });

  it('returns empty for empty response', () => {
    expect(parseDTCs('>')).toEqual([]);
  });
});

describe('PID parsers', () => {
  it('RPM = 1726 from 0x1AF8', () => {
    expect(parsePidResponse(PID_BY_ID.RPM, '41 0C 1A F8 >')).toBe(1726);
  });

  it('ECT = 90°C from 0x82', () => {
    expect(parsePidResponse(PID_BY_ID.ECT, '41 05 82 >')).toBe(90);
  });

  it('LTFT B1 = -1.5625% from 0x7E', () => {
    const v = parsePidResponse(PID_BY_ID.LTFT1, '41 07 7E >') as number;
    expect(v).toBeCloseTo(-1.5625, 3);
  });

  it('Vehicle speed = 100 from 0x64', () => {
    expect(parsePidResponse(PID_BY_ID.SPD, '41 0D 64 >')).toBe(100);
  });

  it('IAT = 25°C from 0x41', () => {
    expect(parsePidResponse(PID_BY_ID.IAT, '41 0F 41 >')).toBe(25);
  });

  it('returns null when marker is missing', () => {
    expect(parsePidResponse(PID_BY_ID.RPM, 'NO DATA >')).toBeNull();
  });

  it('extractDataBytes handles multi-frame prefixes and whitespace', () => {
    const bytes = extractDataBytes('0: 41 0C 1A\n1: F8 00 00', '410C');
    expect(bytes?.slice(0, 2)).toEqual([0x1a, 0xf8]);
  });
});

describe('parseSupportedPids', () => {
  it('decodes a known supported-PIDs bitmap', () => {
    // 41 00 BE 1F A8 13 — typical first-bank response from a modern ECU.
    const supported = parseSupportedPids('41 00 BE 1F A8 13 >', '00');
    expect(supported).toContain('01');
    expect(supported).toContain('05');
    expect(supported).toContain('0C');
    expect(supported).toContain('0D');
  });

  it('returns empty for missing marker', () => {
    expect(parseSupportedPids('NO DATA >', '00')).toEqual([]);
  });
});

describe('parseVIN', () => {
  it('decodes 17-char VIN across multi-frame', () => {
    const raw =
      '0: 49 02 01 31 48 47\n1: 42 48 34 31 4A 58\n2: 4D 4E 31 30 39 31\n3: 38 36 00 00 00 00';
    expect(parseVIN(raw)).toBe('1HGBH41JXMN109186');
  });

  it('returns null when 4902 marker is missing', () => {
    expect(parseVIN('NO DATA >')).toBeNull();
  });
});

describe('parseMode09Ascii', () => {
  it('decodes Calibration ID payload', () => {
    // 49 04 01 + ASCII "CAL12345" + zero pad
    const raw = '49 04 01 43 41 4C 31 32 33 34 35 00 >';
    expect(parseMode09Ascii(raw, '4904')).toBe('CAL12345');
  });

  it('decodes ECU name', () => {
    const raw = '49 0A 01 45 43 4D 00 00 00 00 00 >';
    expect(parseMode09Ascii(raw, '490A')).toBe('ECM');
  });
});

describe('parseCVN', () => {
  it('returns 4-byte hex CVN', () => {
    expect(parseCVN('49 06 01 12 34 56 78 >')).toBe('12345678');
  });
});

describe('parseReadiness', () => {
  it('decodes MIL on with 2 DTCs', () => {
    // A = 0x82 -> MIL on, count = 2
    const r = parseReadiness('41 01 82 07 00 00 >');
    expect(r?.milOn).toBe(true);
    expect(r?.dtcCount).toBe(2);
  });

  it('marks continuous monitors as supported and ready', () => {
    // B bits 0-2 set (supported), bits 4-6 clear (ready)
    const r = parseReadiness('41 01 00 07 00 00 >');
    const misfire = r?.monitors.find((m) => m.name === 'Misfire');
    expect(misfire?.supported).toBe(true);
    expect(misfire?.ready).toBe(true);
  });

  it('returns null when 4101 marker is missing', () => {
    expect(parseReadiness('NO DATA >')).toBeNull();
  });
});

describe('parseBatteryVoltage', () => {
  it('parses ATRV response', () => {
    expect(parseBatteryVoltage('13.8V')).toBe(13.8);
  });

  it('parses with whitespace', () => {
    expect(parseBatteryVoltage('  12.4 V  >')).toBe(12.4);
  });

  it('returns null when no number', () => {
    expect(parseBatteryVoltage('?')).toBeNull();
  });
});

describe('detectOBDError', () => {
  it('detects NO DATA', () => {
    expect(detectOBDError('NO DATA')).toBe('NO_DATA');
  });
  it('detects UNABLE TO CONNECT', () => {
    expect(detectOBDError('UNABLE TO CONNECT')).toBe('UNABLE_TO_CONNECT');
  });
  it('detects STOPPED', () => {
    expect(detectOBDError('STOPPED')).toBe('STOPPED');
  });
  it('returns null for valid response', () => {
    expect(detectOBDError('41 0C 1A F8')).toBeNull();
  });
});
