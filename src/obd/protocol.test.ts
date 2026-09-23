import {
  atstCommand,
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
  it('maps native socket errors', () => {
    expect(userMessage(new Error('connect ECONNREFUSED 192.168.0.10:35000'))).toMatch(/bağlanılamadı/);
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
