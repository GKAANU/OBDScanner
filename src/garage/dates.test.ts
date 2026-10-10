import { daysText, dueRows, mtvDueDates } from './dates';
import { daysBetween, formatDateTR, formatThousands, parseDateTR, parseKm } from '../utils/format';

describe('MTV', () => {
  it('next installment is end of January or July', () => {
    expect(mtvDueDates('2026-10-10')).toEqual([{ id: 'mtv-2027-1', name: 'MTV · 1. taksit', date: '2027-01-31' }]);
    expect(mtvDueDates('2026-03-01')[0].date).toBe('2026-07-31');
    expect(mtvDueDates('2026-01-31')[0].date).toBe('2026-01-31');
  });
});

describe('dueRows', () => {
  it('sorts user dates and MTV soonest first', () => {
    const rows = dueRows(
      [
        { id: 'k', kind: 'kasko', name: 'Kasko', date: '2027-03-01', note: 'Yıllık' },
        { id: 'm', kind: 'muayene', name: 'Muayene', date: '2026-11-02', note: 'TÜVTÜRK' },
      ],
      '2026-10-10'
    );
    expect(rows.map((r) => r.name)).toEqual(['Muayene', 'MTV · 1. taksit', 'Kasko']);
    expect(rows[0].days).toBe(23);
    expect(daysText(0)).toBe('Bugün');
    expect(daysText(-3)).toBe('3 gün geçti');
  });
});

describe('Turkish formatting', () => {
  it('thousands, dates, km', () => {
    expect(formatThousands(48612)).toBe('48.612');
    expect(formatThousands(999)).toBe('999');
    expect(formatThousands(-12612)).toBe('-12.612');
    expect(formatDateTR('2026-10-10')).toBe('10.10.2026');
    expect(parseDateTR('2.11.2026')).toBe('2026-11-02');
    expect(parseDateTR('31.02.2026')).toBeNull();
    expect(parseDateTR('abc')).toBeNull();
    expect(parseKm('48.612 km')).toBe(48612);
    expect(daysBetween('2026-10-10', '2026-11-02')).toBe(23);
  });
});
