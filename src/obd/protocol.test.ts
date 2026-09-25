import {
  atstCommand,
  classifyConnectError,
  errorDetail,
  LOCAL_NETWORK_HINT,
  initProbeError,
  OBDError,
  recoveryAction,
  takeResponse,
  terminalPolicy,
  userMessage,
} from './protocol';

describe('takeResponse', () => {
  it('returns null until a prompt arrives', () => {
    expect(takeResponse('41 0C 1A')).toEqual({ response: null, rest: '41 0C 1A' });
  });
  it('splits at the first prompt and trims the response', () => {
    expect(takeResponse('41 0C 1A F8\r\r>')).toEqual({ response: '41 0C 1A F8', rest: '' });
  });
  it('keeps bytes that arrive after the prompt', () => {
    expect(takeResponse('OK\r\r>41 05')).toEqual({ response: 'OK', rest: '41 05' });
  });
  it('only consumes one response when two prompts are buffered', () => {
    const first = takeResponse('OK>ELM327 v1.5>');
    expect(first.response).toBe('OK');
    expect(takeResponse(first.rest).response).toBe('ELM327 v1.5');
  });
});

describe('recoveryAction', () => {
  it('retries once on STOPPED', () => {
    expect(recoveryAction('STOPPED', 0)).toBe('retry');
    expect(recoveryAction('STOPPED', 1)).toBe('none');
  });
  it('re-runs protocol detection on BUS INIT...ERROR', () => {
    expect(recoveryAction('BUS INIT: ...ERROR', 0)).toBe('reprotocol');
    expect(recoveryAction('BUS INIT: ...ERROR', 1)).toBe('none');
  });
  it('does not treat a successful BUS INIT as an error', () => {
    expect(recoveryAction('BUS INIT: ...OK\r41 00 BE 3E B8 11', 0)).toBe('none');
  });
  it('does nothing for normal responses and NO DATA', () => {
    expect(recoveryAction('41 0C 1A F8', 0)).toBe('none');
    expect(recoveryAction('NO DATA', 0)).toBe('none');
  });
});

describe('initProbeError', () => {
  it('flags UNABLE TO CONNECT after SEARCHING', () => {
    expect(initProbeError('SEARCHING...\rUNABLE TO CONNECT')).toBe('UNABLE_TO_CONNECT');
  });
  it('flags NO DATA and CAN ERROR', () => {
    expect(initProbeError('NO DATA')).toBe('NO_DATA');
    expect(initProbeError('CAN ERROR')).toBe('CAN_ERROR');
  });
  it('accepts a valid 0100 reply', () => {
    expect(initProbeError('SEARCHING...\r4100BE3FA813')).toBeNull();
  });
});

describe('atstCommand', () => {
  it('encodes ~600 ms as ATST92 (4.096 ms units)', () => {
    expect(atstCommand(600)).toBe('ATST92');
  });
  it('clamps to 01..FF', () => {
    expect(atstCommand(0)).toBe('ATST01');
    expect(atstCommand(5000)).toBe('ATSTFF');
  });
  it('pads to two hex digits', () => {
    expect(atstCommand(40)).toBe('ATST0A');
  });
});

describe('userMessage', () => {
  it('maps OBDError codes to Turkish, actionable text', () => {
    expect(userMessage(new OBDError('TIMEOUT', 'x'))).toMatch(/Adaptör cevap vermedi/);
    expect(userMessage(new OBDError('UNABLE_TO_CONNECT', 'x'))).toMatch(/Kontağı açıp/);
    expect(userMessage(new OBDError('CONNECTION_CLOSED', 'x'))).toMatch(/bağlantı koptu/);
  });
  it('maps errno-style native socket errors by kind', () => {
    // Was the generic "bağlanılamadı" text; refused now has its own copy.
    expect(userMessage(new Error('connect ECONNREFUSED 192.168.0.10:35000'))).toMatch(/reddetti/);
    expect(userMessage(new Error('connect EHOSTUNREACH'))).toMatch(/ulaşılamıyor/);
  });
  it('never leaks raw English messages', () => {
    expect(userMessage(new Error('something odd'))).toBe('Beklenmeyen hata. Bağlantıyı kapatıp tekrar dene.');
  });
});

describe('terminalPolicy', () => {
  it('allows AT commands and read-only OBD services', () => {
    for (const c of ['ATRV', 'at dp', 'ATH1', 'STI', '010C', '01 0c', '03', '07', '0A', '0902', '020200', '0600']) {
      expect(terminalPolicy(c)).toBe('allow');
    }
  });

  it('asks for confirmation before Mode 04', () => {
    expect(terminalPolicy('04')).toBe('confirm-clear');
    expect(terminalPolicy(' 0 4 ')).toBe('confirm-clear');
    expect(terminalPolicy('4')).toBe('confirm-clear');
  });

  it('blocks monitor commands that never return a prompt', () => {
    for (const c of ['ATMA', 'at ma', 'ATMR 10', 'ATMT 10', 'STMA', 'ATMP 0C']) {
      expect(terminalPolicy(c)).toBe('block-monitor');
    }
  });

  it('blocks services that write to or actuate the vehicle', () => {
    for (const c of ['08', '2E F190 00', '31 01 FF 00', '3B', '14 FF FF FF', '10 03', '27 01', '11 01']) {
      expect(terminalPolicy(c)).toBe('block-write');
    }
  });

  it('lets unknown text through for the adapter to reject', () => {
    expect(terminalPolicy('HELLO')).toBe('allow');
  });
});

const tcp = (raw: string) => new OBDError('CONNECT_FAILED', raw, { step: 'tcp', raw });

describe('classifyConnectError', () => {
  it('recognises iOS localizedDescription strings', () => {
    expect(classifyConnectError('Connection refused')).toBe('refused');
    expect(classifyConnectError('No route to host')).toBe('no_route');
    expect(classifyConnectError('Network is unreachable')).toBe('net_unreachable');
    expect(classifyConnectError('Operation timed out')).toBe('timeout');
    expect(classifyConnectError('Attempt to connect to host timed out')).toBe('timeout');
  });
  it('recognises errno names, case-insensitively', () => {
    expect(classifyConnectError('connect econnrefused')).toBe('refused');
    expect(classifyConnectError('EHOSTUNREACH')).toBe('no_route');
    expect(classifyConnectError('ENETUNREACH')).toBe('net_unreachable');
    expect(classifyConnectError('ETIMEDOUT')).toBe('timeout');
  });
  it('recognises our own JS backstop timer', () => {
    expect(classifyConnectError('Timed out connecting to 192.168.0.10:35000 (JS timer)')).toBe('timeout');
  });
  it('falls back to other', () => {
    expect(classifyConnectError('Socket is not connected')).toBe('other');
    expect(classifyConnectError('')).toBe('other');
  });
});

describe('connect error messages and detail', () => {
  it('refused: port copy, raw kept', () => {
    const e = tcp('Connection refused');
    expect(userMessage(e)).toBe(
      "Adaptör bağlantıyı reddetti. Port numarası yanlış olabilir. Portu kontrol et ya da Otomatik bul'u dene."
    );
    expect(e.raw).toBe('Connection refused');
    expect(errorDetail(e)).toBe('tcp · CONNECT_FAILED/refused · Connection refused');
  });
  it('no_route and net_unreachable add the Local Network hint', () => {
    const nr = userMessage(tcp('No route to host'));
    expect(nr.split('\n')[0]).toMatch(/^Adaptöre ulaşılamıyor\./);
    expect(nr.split('\n')[1]).toBe(LOCAL_NETWORK_HINT);
    const nu = userMessage(tcp('Network is unreachable'));
    expect(nu).toMatch(/^Wi-Fi bağlantısı yok\./);
    expect(nu).toContain(LOCAL_NETWORK_HINT);
  });
  it('timeouts (native and JS timer) share the IP copy', () => {
    for (const raw of ['Operation timed out', 'Attempt to connect to host timed out', 'Timed out connecting to x (JS timer)']) {
      expect(userMessage(tcp(raw))).toMatch(/^Adaptör bağlantıya cevap vermedi\. IP adresi yanlış olabilir/);
    }
    expect(errorDetail(tcp('Operation timed out'))).toBe('tcp · CONNECT_FAILED/timeout · Operation timed out');
  });
  it('unknown native text: generic copy, raw kept in detail', () => {
    const e = tcp('Socket closed by peer ???');
    expect(userMessage(e)).toBe('Adaptöre bağlanılamadı. Wi-Fi ağını, IP adresini ve portu kontrol et.');
    expect(errorDetail(e)).toBe('tcp · CONNECT_FAILED/other · Socket closed by peer ???');
  });
  it('reset / setup / probe steps map to their copy', () => {
    expect(userMessage(new OBDError('TIMEOUT', 'x', { step: 'reset' }))).toMatch(/^Wi-Fi bağlantısı kuruldu ama adaptör/);
    expect(userMessage(new OBDError('TIMEOUT', 'x', { step: 'setup' }))).toMatch(/^Wi-Fi bağlantısı kuruldu ama adaptör/);
    expect(userMessage(new OBDError('TIMEOUT', 'x', { step: 'probe' }))).toMatch(/^Adaptör çalışıyor ama araç cevap vermedi/);
    expect(userMessage(new OBDError('UNABLE_TO_CONNECT', 'x', { step: 'probe' }))).toMatch(/^Adaptör çalışıyor/);
  });
  it('escapes CR/LF in the detail line', () => {
    const e = new OBDError('PROBE_FAILED', 'm', { step: 'probe', raw: 'SEARCHING...\rUNABLE TO CONNECT' });
    expect(errorDetail(e)).toBe('probe · PROBE_FAILED · SEARCHING...\\rUNABLE TO CONNECT');
  });
  it('keeps the mid-session disconnect message, also when the link drops during init', () => {
    expect(userMessage(new OBDError('CONNECTION_CLOSED', 'socket closed'))).toMatch(/bağlantı koptu/);
    expect(userMessage(new OBDError('CONNECTION_CLOSED', 'x', { step: 'probe' }))).toMatch(/bağlantı koptu/);
  });
});
