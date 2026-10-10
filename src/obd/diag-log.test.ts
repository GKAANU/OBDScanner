import { DiagLog, escapeLogText, formatDiagLine, formatDiagLog, DIAG_LINE_MAX } from './diag-log';

/** Emoji, box drawing, block elements, ANSI escape. */
const FORBIDDEN = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u2500-\u259F\u001b]/u;

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('DiagLog ring buffer', () => {
  it('keeps the newest 300 of 400 entries', () => {
    const log = new DiagLog();
    for (let i = 0; i < 400; i++) log.log(`line ${i}`);
    const e = log.entries();
    expect(e).toHaveLength(300);
    expect(e[0].text).toBe('line 100');
    expect(e[299].text).toBe('line 399');
  });

  it('measures rel from the current attempt start', () => {
    const c = clock();
    const log = new DiagLog(c.now);
    c.advance(5000);
    log.startAttempt('connect');
    c.advance(1234);
    log.log('TX ATZ\r');
    const [a, b] = log.entries();
    expect(a.rel).toBe(0);
    expect(b.rel).toBe(1234);
    expect(formatDiagLine(b)).toMatch(/^\d\d:\d\d:\d\d\.\d{3} \+1234ms TX ATZ\\r$/);
  });

  it('truncates long entries to 200 chars', () => {
    const log = new DiagLog();
    log.log('RX ' + 'A'.repeat(1000));
    expect(log.entries()[0].text.length).toBeLessThanOrEqual(DIAG_LINE_MAX);
    expect(formatDiagLine(log.entries()[0]).length).toBeLessThanOrEqual(DIAG_LINE_MAX);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const log = new DiagLog();
    const fn = jest.fn();
    const off = log.subscribe(fn);
    log.log('a');
    off();
    log.log('b');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('escapeLogText', () => {
  it('escapes CR and LF as visible sequences', () => {
    expect(escapeLogText('ELM327 v1.5\r\r>')).toBe('ELM327 v1.5\\r\\r>');
    expect(escapeLogText('a\nb')).toBe('a\\nb');
  });
  it('escapes other control and high bytes as \\xNN', () => {
    expect(escapeLogText('\u0000\u0007\t\u00ff')).toBe('\\x00\\x07\\x09\\xFF');
    expect(escapeLogText('\u{1F697}')).toBe('\\u1F697');
  });
});

describe('formatDiagLog', () => {
  it('produces paste-friendly plain text', () => {
    const c = clock();
    const log = new DiagLog(c.now);
    log.startAttempt('connect start 192.168.0.10:35000');
    log.log('RX (12ms) \u001b[31mSEARCHING...\r41 00 BE 3E B8 11\u{1F600}\u2500');
    for (let i = 0; i < 50; i++) log.log('RX ' + 'X'.repeat(400));
    const text = formatDiagLog(log.entries(), ['Otova bağlantı günlüğü', 'Uygulama: 1.0.0 (7)']);
    expect(text).not.toMatch(FORBIDDEN);
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(DIAG_LINE_MAX);
    const lines = text.split('\n');
    expect(lines[0]).toBe('Otova bağlantı günlüğü');
    expect(lines[2]).toBe('');
    expect(text).toContain('SEARCHING...\\r41 00 BE 3E B8 11');
    expect(text).not.toContain('\r');
  });

  it('shows the empty state', () => {
    expect(formatDiagLog([], ['Otova bağlantı günlüğü'])).toBe('Otova bağlantı günlüğü\n\nHenüz kayıt yok.');
  });
});
