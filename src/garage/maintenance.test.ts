import {
  durationText,
  everyText,
  evaluatePlan,
  hiddenByBrand,
  intervalText,
  leftLine,
  maintStatus,
  nextService,
  planFor,
} from './maintenance';
import type { ServiceRecord } from './types';

const rec = (id: string, date: string, km: number, items: string[]): ServiceRecord => ({
  id, date, km, items, service: '', cost: null, note: '',
});

describe('planFor', () => {
  it('picks fuel-specific items and intervals', () => {
    const benzin = planFor({ fuel: 'Benzin', brand: 'Renault' }).map((i) => i.id);
    expect(benzin).toContain('buji');
    expect(benzin).not.toContain('kizdirma');
    const dizel = planFor({ fuel: 'Dizel', brand: 'Renault' });
    expect(dizel.map((i) => i.id)).toContain('kizdirma');
    expect(dizel.find((i) => i.id === 'yakit')?.intervalKm).toBe(30000);
    const ev = planFor({ fuel: 'Elektrik', brand: 'Tesla' }).map((i) => i.id);
    expect(ev).not.toContain('yag');
    expect(ev).toContain('lastik');
  });
  it('applies brand tweaks: timing chain brands hide the belt', () => {
    expect(planFor({ fuel: 'Benzin', brand: 'Toyota' }).map((i) => i.id)).not.toContain('triger');
    expect(hiddenByBrand({ fuel: 'Benzin', brand: 'toyota' }).map((h) => h.id)).toEqual(['triger']);
    expect(planFor({ fuel: 'Benzin', brand: 'Peugeot' }).find((i) => i.id === 'triger')?.intervalKm).toBe(100000);
  });
  it('user overrides win over brand and catalog', () => {
    const p = planFor({ fuel: 'Benzin', brand: 'Toyota' }, { triger: { off: false }, yag: { intervalKm: 10000 } });
    expect(p.map((i) => i.id)).toContain('triger');
    expect(p.find((i) => i.id === 'yag')?.intervalKm).toBe(10000);
  });
});

describe('maintStatus', () => {
  const yag = { id: 'yag', name: 'Motor yağı', intervalKm: 15000, intervalMonths: 12, why: '' };
  const car = { km: 48612, year: 2021 };

  it('soon: 2.400 km left after the last oil change', () => {
    const s = maintStatus(yag, [rec('1', '2025-11-14', 36212, ['yag'])], car, '2026-10-10');
    expect(s.key).toBe('soon');
    expect(s.leftKm).toBe(2600);
    expect(leftLine(s)).toBe('2.600 km veya 1 ay kaldı');
  });
  it('over when time ran out even with km left', () => {
    const s = maintStatus(yag, [rec('1', '2025-01-10', 46000, ['yag'])], car, '2026-10-10');
    expect(s.key).toBe('over');
    expect(leftLine(s)).toMatch(/ay geçti$/);
  });
  it('estimates on-schedule service without a record', () => {
    const s = maintStatus(yag, [], car, '2026-10-10');
    expect(s.assumed).toBe(true);
    expect(s.last?.km).toBe(45000);
    expect(s.leftKm).toBe(11388);
    expect(leftLine(s)).toMatch(/ kaldı · tahmini$/);
  });
  it('estimates time-only items from the model year, unknown without one', () => {
    const hid = { id: 'hid', name: 'Fren hidroliği', intervalKm: 0, intervalMonths: 24, why: '' };
    const s = maintStatus(hid, [], { km: 48612, year: 2021 }, '2026-10-10');
    expect(s.assumed).toBe(true);
    expect(s.leftDays).toBeGreaterThan(0);
    expect(s.leftDays).toBeLessThanOrEqual(731);
    expect(maintStatus(hid, [], { km: 48612, year: null }, '2026-10-10').key).toBe('unknown');
  });
  it('km-only estimate when the model year is unknown', () => {
    const s = maintStatus(yag, [], { km: 48612, year: null }, '2026-10-10');
    expect(s.leftKm).toBe(11388);
    expect(s.leftDays).toBeNull();
  });
  it('assumes factory state for a new car with no record', () => {
    const s = maintStatus(yag, [], { km: 4000, year: 2026 }, '2026-06-01');
    expect(s.assumed).toBe(true);
    expect(s.key).toBe('ok');
    expect(s.leftKm).toBe(11000);
  });
  it('uses the latest record that includes the item', () => {
    const records = [rec('a', '2024-01-01', 20000, ['yag']), rec('b', '2025-11-14', 36212, ['yag', 'yagf']), rec('c', '2026-01-01', 40000, ['hava'])];
    expect(maintStatus(yag, records, car, '2026-10-10').last).toEqual({ date: '2025-11-14', km: 36212 });
  });
});

describe('plan helpers', () => {
  it('nextService merges oil + filter on the same schedule', () => {
    const items = planFor({ fuel: 'Benzin', brand: 'Renault' });
    const records = [rec('1', '2025-11-14', 36212, items.map((i) => i.id))];
    const rows = evaluatePlan(items, records, { km: 48612, year: 2021 }, '2026-10-10');
    expect(rows[0].status.key).not.toBe('ok');
    expect(nextService(rows)?.name).toBe('Yağ + filtre');
  });
  it('formats intervals and durations', () => {
    expect(intervalText({ intervalKm: 15000, intervalMonths: 12 })).toBe('15.000 km · 1 yıl');
    expect(everyText({ intervalKm: 15000, intervalMonths: 12 })).toBe('Her 15.000 km veya 1 yılda bir');
    expect(everyText({ intervalKm: 40000, intervalMonths: 0 })).toBe("Her 40.000 km'de bir");
    expect(everyText({ intervalKm: 0, intervalMonths: 18 })).toBe('Her 18 ayda bir');
    expect(intervalText({ intervalKm: 0, intervalMonths: 18 })).toBe('18 ay');
    expect(durationText(10)).toBe('10 gün');
    expect(durationText(400)).toBe('13 ay');
    expect(durationText(731)).toBe('2 yıl');
  });
});
