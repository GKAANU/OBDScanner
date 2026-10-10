import {
  activeEntry,
  addVehicle,
  EMPTY_GARAGE,
  migrateV1,
  parseV2,
  removeVehicle,
  saveActiveVehicle,
  selectVehicle,
  summaries,
  updateActive,
} from './garage-data';
import type { Vehicle } from './types';

const car = (name: string, km = 1000): Vehicle => ({
  name, brand: 'Renault', model: 'Clio', year: 2021, plate: '34 ABC 123', km,
  kmUpdatedAt: '2026-10-10', kmSource: 'manual', fuel: 'Benzin',
});

describe('migrateV1', () => {
  it('moves the single v1 vehicle with its data into one active entry', () => {
    const s = migrateV1(
      { vehicle: car('Clio'), records: [{ id: 'r', date: '2025-11-14', km: 900, items: ['yag'], service: '', cost: null, note: '' }], overrides: { yag: { intervalKm: 10000 } }, docs: [], lastScan: null },
      'v1'
    );
    expect(s.activeId).toBe('v1');
    expect(s.vehicles).toHaveLength(1);
    expect(activeEntry(s)?.records).toHaveLength(1);
    expect(activeEntry(s)?.overrides.yag?.intervalKm).toBe(10000);
  });
  it('returns an empty garage when v1 had no vehicle', () => {
    expect(migrateV1({ vehicle: null }, 'x')).toEqual(EMPTY_GARAGE);
    expect(migrateV1(null, 'x')).toEqual(EMPTY_GARAGE);
  });
});

describe('add / select / remove', () => {
  it('adding makes the new vehicle active; select switches; remove keeps at least one', () => {
    let s = saveActiveVehicle(EMPTY_GARAGE, car('Clio'), 'a');
    expect(s.activeId).toBe('a');
    s = addVehicle(s, 'b', car('Egea'));
    expect(activeEntry(s)?.vehicle.name).toBe('Egea');
    s = selectVehicle(s, 'a');
    expect(activeEntry(s)?.vehicle.name).toBe('Clio');
    expect(selectVehicle(s, 'nope')).toBe(s);
    s = removeVehicle(s, 'a');
    expect(s.activeId).toBe('b');
    expect(removeVehicle(s, 'b')).toBe(s); // last one stays
  });
  it('edits only the active vehicle', () => {
    let s = addVehicle(addVehicle(EMPTY_GARAGE, 'a', car('Clio')), 'b', car('Egea'));
    s = updateActive(s, (e) => ({ ...e, records: [{ id: 'r', date: '2026-01-01', km: 5, items: ['hava'], service: '', cost: 10, note: '' }] }));
    s = saveActiveVehicle(s, { ...car('Egea'), km: 2222 }, 'unused');
    expect(s.vehicles.find((v) => v.id === 'a')?.records).toHaveLength(0);
    expect(activeEntry(s)?.records).toHaveLength(1);
    expect(activeEntry(s)?.vehicle.km).toBe(2222);
    expect(summaries(s).map((v) => v.name)).toEqual(['Clio', 'Egea']);
  });
});

describe('parseV2', () => {
  it('drops broken entries and repairs a stale activeId', () => {
    const s = parseV2({ vehicles: [{ id: 'a', vehicle: car('Clio') }, { id: 3 }, null], activeId: 'gone' });
    expect(s?.vehicles).toHaveLength(1);
    expect(s?.activeId).toBe('a');
    expect(s?.vehicles[0].records).toEqual([]);
    expect(parseV2('junk')).toBeNull();
  });
});
