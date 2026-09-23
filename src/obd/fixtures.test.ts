import { readFileSync } from 'fs';
import { join } from 'path';
import {
  detectOBDError,
  parseBatteryVoltage,
  parseDTCs,
  parseFreezeFrameDTC,
  parseMode09Ascii,
  parseReadiness,
  parseVIN,
} from './parsers';
import {
  parseFreezeFramePidResponse,
  parsePidResponse,
  parseSupportedPids,
  PID_BY_ID,
} from './pid-registry';
import { initProbeError, recoveryAction } from './protocol';
import { responseMessages } from './response';

/**
 * Fixture-based parser tests. See __fixtures__/README.md: these are
 * representative samples until real captures from the car replace them.
 * Every fixture is exercised with `\n` (as stored) and `\r` (as the ELM327
 * actually sends) line endings.
 */
function load(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
}

const VIN = 'WVWZZZ3CZWE123456';

function variants(name: string): Array<[string, string]> {
  const raw = load(name);
  return [
    ['LF', raw],
    ['CR', raw.replace(/\n/g, '\r')],
  ];
}

describe.each([['LF'], ['CR']])('fixtures (%s line endings)', (ending) => {
  const get = (name: string) => {
    const raw = load(name);
    return ending === 'CR' ? raw.replace(/\n/g, '\r') : raw;
  };

  describe('Mode 01 live PIDs', () => {
    it('RPM, CAN 11-bit', () => {
      expect(parsePidResponse(PID_BY_ID.RPM, get('can11_010C_rpm.txt'))).toBe(850);
    });
    it('RPM with echo on', () => {
      expect(parsePidResponse(PID_BY_ID.RPM, get('can11_echo_010C.txt'))).toBe(850);
    });
    it('RPM with CAN 29-bit headers and AA padding', () => {
      expect(parsePidResponse(PID_BY_ID.RPM, get('can29_hdr_010C.txt'))).toBe(850);
    });
    it('RPM with ISO 9141 headers + checksum', () => {
      expect(parsePidResponse(PID_BY_ID.RPM, get('iso9141_hdr_010C.txt'))).toBe(1726);
    });
    it('RPM with KWP2000 headers + checksum', () => {
      expect(parsePidResponse(PID_BY_ID.RPM, get('kwp_hdr_010C.txt'))).toBe(1726);
    });
    it('ECT = 83 C', () => {
      expect(parsePidResponse(PID_BY_ID.ECT, get('can11_0105_ect.txt'))).toBe(83);
    });
  });

  describe('supported PIDs (0100)', () => {
    it('ignores the SEARCHING... banner', () => {
      const s = parseSupportedPids(get('can11_0100_searching.txt'), '00');
      expect(s).toEqual(expect.arrayContaining(['01', '04', '05', '0C', '0D', '20']));
    });
    it('parses spaces-on output identically', () => {
      expect(parseSupportedPids(get('can11_0100_spaces.txt'), '00')).toEqual(
        parseSupportedPids(get('can11_0100_searching.txt'), '00')
      );
    });
    it('uses the first ECU when two answer with headers on', () => {
      expect(parseSupportedPids(get('can11_hdr_0100_two_ecus.txt'), '00')).toEqual(
        parseSupportedPids(get('can11_0100_searching.txt'), '00')
      );
      expect(responseMessages(get('can11_hdr_0100_two_ecus.txt'))).toEqual(['4100BE3FA813', '410098180001']);
    });
    it('ignores the BUS INIT: ...OK banner on ISO 9141', () => {
      expect(parseSupportedPids(get('iso9141_0100_businit.txt'), '00')).toContain('0C');
      expect(detectOBDError(get('iso9141_0100_businit.txt'))).toBeNull();
    });
  });

  describe('DTCs', () => {
    it('CAN single frame with count byte', () => {
      expect(parseDTCs(get('can11_03_single.txt'))).toEqual(['P0133', 'P0420']);
    });
    it('CAN count byte 00 means no codes', () => {
      expect(parseDTCs(get('can11_03_none.txt'))).toEqual([]);
    });
    it('CAN multi-frame, trimmed to the ISO-TP length (ignores 55 padding)', () => {
      expect(parseDTCs(get('can11_03_multiframe.txt'))).toEqual(['P0143', 'P0420', 'P0301', 'P0202']);
    });
    it('echo on', () => {
      expect(parseDTCs(get('can11_echo_03.txt'))).toEqual(['P0133', 'P0420']);
    });
    it('Mode 07 pending', () => {
      expect(parseDTCs(get('can11_07_pending.txt'))).toEqual(['P0171']);
    });
    it('Mode 0A NO DATA = none', () => {
      expect(parseDTCs(get('can11_0A_nodata.txt'))).toEqual([]);
      expect(detectOBDError(get('can11_0A_nodata.txt'))).toBe('NO_DATA');
    });
    it('ISO 9141: no count byte, codes spread over several lines', () => {
      expect(parseDTCs(get('iso9141_03_two_lines.txt'))).toEqual(['P0133', 'P0420', 'P0301', 'P0202']);
    });
  });

  describe('Mode 09', () => {
    it('VIN, CAN multi-frame with length line', () => {
      expect(parseVIN(get('can11_0902_vin.txt'))).toBe(VIN);
    });
    it('VIN, CAN headers on (first + consecutive frames)', () => {
      expect(parseVIN(get('can11_hdr_0902_vin.txt'))).toBe(VIN);
    });
    it('VIN, ISO 9141 numbered lines', () => {
      expect(parseVIN(get('iso9141_0902_vin.txt'))).toBe(VIN);
    });
    it('Calibration ID, padded and trimmed', () => {
      expect(parseMode09Ascii(get('can11_0904_calid.txt'), '4904')).toBe('03L906022FG');
    });
  });

  describe('readiness and freeze frame', () => {
    it('0101: MIL on, 3 DTCs, evap not ready, EGR unsupported', () => {
      const r = parseReadiness(get('can11_0101_readiness.txt'));
      expect(r?.milOn).toBe(true);
      expect(r?.dtcCount).toBe(3);
      const m = Object.fromEntries((r?.monitors ?? []).map((x) => [x.name, x]));
      expect(m['Buharlaşma sistemi']).toMatchObject({ supported: true, ready: false });
      expect(m['Katalitik konv.']).toMatchObject({ supported: true, ready: true });
      expect(m['EGR sistemi']).toMatchObject({ supported: false });
    });
    it('020200: frame stored by P0133', () => {
      expect(parseFreezeFrameDTC(get('can11_020200_ffdtc.txt'))).toBe('P0133');
    });
    it('020C00: frame RPM', () => {
      expect(parseFreezeFramePidResponse(PID_BY_ID.RPM, get('can11_020C00_ffrpm.txt'))).toBe(1726);
    });
  });

  describe('adapter status responses', () => {
    it('UNABLE TO CONNECT after SEARCHING fails the init probe', () => {
      expect(initProbeError(get('can11_0100_unable.txt'))).toBe('UNABLE_TO_CONNECT');
      expect(parseSupportedPids(get('can11_0100_unable.txt'), '00')).toEqual([]);
    });
    it('STOPPED triggers one retry', () => {
      expect(recoveryAction(get('can11_stopped.txt'), 0)).toBe('retry');
    });
    it('BUS INIT: ...ERROR triggers protocol re-detection', () => {
      expect(recoveryAction(get('iso9141_bus_init_error.txt'), 0)).toBe('reprotocol');
    });
    it('? is an unknown command and yields no data', () => {
      expect(detectOBDError(get('elm_unknown.txt'))).toBe('UNKNOWN_COMMAND');
      expect(responseMessages(get('elm_unknown.txt'))).toEqual([]);
    });
    it('ATRV and ATZ banners', () => {
      expect(parseBatteryVoltage(get('elm_atrv.txt'))).toBe(12.6);
      expect(responseMessages(get('elm_atz.txt'))).toEqual([]);
    });
  });
});

describe('fixture sanity', () => {
  it('every fixture ends with the > prompt', () => {
    const { readdirSync } = require('fs') as typeof import('fs');
    const files = readdirSync(join(__dirname, '__fixtures__')).filter((f) => f.endsWith('.txt'));
    expect(files.length).toBeGreaterThanOrEqual(25);
    for (const f of files) {
      for (const [, raw] of variants(f)) expect(raw.trimEnd().endsWith('>')).toBe(true);
    }
  });
});
