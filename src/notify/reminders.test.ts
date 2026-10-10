import { DEFAULT_REMINDER_SETTINGS, MAX_REMINDERS, planReminders, type ReminderMaint } from './reminders';
import type { MaintStatus } from '../garage/maintenance';

const now = new Date(2026, 9, 10, 12, 0, 0); // 10 Oct 2026 12:00 local
const today = '2026-10-10';
const S = { ...DEFAULT_REMINDER_SETTINGS, seasonal: false, maintenance: false };

const status = (p: Partial<MaintStatus>): MaintStatus => ({
  key: 'ok', leftKm: null, leftDays: null, used: 0.5, last: null, assumed: false, ...p,
});

describe('planReminders', () => {
  it('muayene gets 30, 7 and 1 day reminders at the chosen hour', () => {
    const r = planReminders({ today, now, vehicleName: 'Clio', settings: S, maintenance: [],
      docs: [{ id: 'm', name: 'Muayene', date: '2026-12-20', kind: 'muayene' }] });
    expect(r.map((x) => x.id)).toEqual(['doc-m-30', 'doc-m-7', 'doc-m-1']);
    expect(r[1].title).toBe('Muayene 7 gün sonra');
    expect(r[1].body).toBe('Clio · 20.12.2026');
    expect(r[1].date).toEqual(new Date(2026, 11, 13, 10, 0, 0));
    expect(r[2].title).toBe('Muayene yarın');
  });
  it('MTV and custom dates only get 7 and 1 day reminders; past ones are skipped', () => {
    const r = planReminders({ today, now, vehicleName: 'Clio', settings: S, maintenance: [],
      docs: [
        { id: 'mtv', name: 'MTV · 1. taksit', date: '2027-01-31', kind: 'mtv' },
        { id: 'k', name: 'Kasko', date: '2026-10-11', kind: 'kasko' },
        { id: 'old', name: 'Eski', date: '2026-09-01', kind: 'custom' },
      ] });
    expect(r.map((x) => x.id)).toEqual(['doc-mtv-7', 'doc-mtv-1']);
  });
  it('time-based maintenance: 14 days before and on the day', () => {
    const m: ReminderMaint = { id: 'hid', name: 'Fren hidroliği', intervalKm: 0, intervalMonths: 24, status: status({ leftDays: 40 }) };
    const r = planReminders({ today, now, vehicleName: 'Clio', docs: [], maintenance: [m], settings: { ...S, maintenance: true } });
    expect(r.map((x) => x.id)).toEqual(['mnt-hid-14', 'mnt-hid-0']);
    expect(r[1].date).toEqual(new Date(2026, 10, 19, 10, 0, 0));
  });
  it('km-only maintenance is estimated from km per day', () => {
    const m: ReminderMaint = { id: 'bal', name: 'Fren balatası (ön)', intervalKm: 40000, intervalMonths: 0, status: status({ leftKm: 2000 }), vehicleKmPerDay: 50 };
    const r = planReminders({ today, now, vehicleName: 'Clio', docs: [], maintenance: [m], settings: { ...S, maintenance: true } });
    expect(r).toHaveLength(1);
    expect(r[0].body).toMatch(/Tahmini, kilometreye göre: 19\.11\.2026/);
    expect(r[0].date).toEqual(new Date(2026, 10, 5, 10, 0, 0));
  });
  it('overdue and unknown maintenance get no reminders', () => {
    const items: ReminderMaint[] = [
      { id: 'a', name: 'A', intervalKm: 1000, intervalMonths: 0, status: status({ key: 'over', leftKm: -10 }) },
      { id: 'b', name: 'B', intervalKm: 1000, intervalMonths: 0, status: status({ key: 'unknown' }) },
    ];
    expect(planReminders({ today, now, vehicleName: 'Clio', docs: [], maintenance: items, settings: { ...S, maintenance: true } })).toEqual([]);
  });
  it('seasonal tyre reminders on next Nov 10 and Apr 10', () => {
    const r = planReminders({ today, now, vehicleName: 'Clio', docs: [], maintenance: [], settings: { ...S, seasonal: true } });
    expect(r.map((x) => x.id)).toEqual(['season-kis-2026', 'season-yaz-2027']);
    expect(r[0].body).toMatch(/ticari araçlar için zorunlu/);
  });
  it('disabled settings produce nothing; total is capped', () => {
    expect(planReminders({ today, now, vehicleName: 'C', docs: [{ id: 'm', name: 'M', date: '2027-01-01' }], maintenance: [], settings: { ...S, enabled: false } })).toEqual([]);
    const docs = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, name: `D${i}`, date: '2027-03-01', kind: 'muayene' as const }));
    expect(planReminders({ today, now, vehicleName: 'C', docs, maintenance: [], settings: S })).toHaveLength(MAX_REMINDERS);
  });
});
