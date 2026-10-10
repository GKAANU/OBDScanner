/**
 * Multi-vehicle garage data and its pure transitions. No React Native
 * imports, so Jest can drive it. The store (store.tsx) persists this shape
 * under 'otova.garage.v2' and exposes the ACTIVE vehicle's fields.
 */
import type { DocDate, IntervalOverride, ScanSummary, ServiceRecord, Vehicle } from './types';

export type VehicleEntry = {
  id: string;
  vehicle: Vehicle;
  records: ServiceRecord[];
  overrides: Record<string, IntervalOverride>;
  docs: DocDate[];
  lastScan: ScanSummary | null;
};

export type GarageState = {
  vehicles: VehicleEntry[];
  activeId: string | null;
};

export const EMPTY_GARAGE: GarageState = { vehicles: [], activeId: null };

/** Shape of the old single-vehicle blob ('otova.garage.v1'). */
export type GarageV1 = {
  vehicle?: Vehicle | null;
  records?: ServiceRecord[];
  overrides?: Record<string, IntervalOverride>;
  docs?: DocDate[];
  lastScan?: ScanSummary | null;
};

export function newEntry(id: string, vehicle: Vehicle): VehicleEntry {
  return { id, vehicle, records: [], overrides: {}, docs: [], lastScan: null };
}

/** v1 blob → v2 state (one entry, or empty when v1 had no vehicle). */
export function migrateV1(v1: GarageV1 | null | undefined, id: string): GarageState {
  if (!v1 || !v1.vehicle) return EMPTY_GARAGE;
  return {
    vehicles: [
      {
        id,
        vehicle: v1.vehicle,
        records: Array.isArray(v1.records) ? v1.records : [],
        overrides: v1.overrides ?? {},
        docs: Array.isArray(v1.docs) ? v1.docs : [],
        lastScan: v1.lastScan ?? null,
      },
    ],
    activeId: id,
  };
}

/** Parse a stored v2 blob defensively; invalid input → null. */
export function parseV2(raw: unknown): GarageState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<GarageState>;
  if (!Array.isArray(r.vehicles)) return null;
  const vehicles = r.vehicles
    .filter((e): e is VehicleEntry => !!e && typeof e === 'object' && typeof e.id === 'string' && !!e.vehicle)
    .map((e) => ({
      id: e.id,
      vehicle: e.vehicle,
      records: Array.isArray(e.records) ? e.records : [],
      overrides: e.overrides ?? {},
      docs: Array.isArray(e.docs) ? e.docs : [],
      lastScan: e.lastScan ?? null,
    }));
  const activeId = vehicles.some((v) => v.id === r.activeId) ? (r.activeId as string) : vehicles[0]?.id ?? null;
  return { vehicles, activeId };
}

export function activeEntry(s: GarageState): VehicleEntry | null {
  return s.vehicles.find((v) => v.id === s.activeId) ?? s.vehicles[0] ?? null;
}

/** Apply `fn` to the active entry (no-op without one). */
export function updateActive(s: GarageState, fn: (e: VehicleEntry) => VehicleEntry): GarageState {
  const a = activeEntry(s);
  if (!a) return s;
  return { ...s, vehicles: s.vehicles.map((v) => (v.id === a.id ? fn(v) : v)) };
}

export function addVehicle(s: GarageState, id: string, vehicle: Vehicle): GarageState {
  return { vehicles: [...s.vehicles, newEntry(id, vehicle)], activeId: id };
}

export function selectVehicle(s: GarageState, id: string): GarageState {
  return s.vehicles.some((v) => v.id === id) ? { ...s, activeId: id } : s;
}

/** Remove a vehicle; the last one cannot be removed. */
export function removeVehicle(s: GarageState, id: string): GarageState {
  if (s.vehicles.length <= 1) return s;
  const vehicles = s.vehicles.filter((v) => v.id !== id);
  if (vehicles.length === s.vehicles.length) return s;
  const activeId = s.activeId === id ? vehicles[0].id : s.activeId;
  return { vehicles, activeId };
}

/** Edit the active vehicle; on a fresh install (no vehicles) create the first. */
export function saveActiveVehicle(s: GarageState, vehicle: Vehicle, idIfNew: string): GarageState {
  if (!activeEntry(s)) return addVehicle(s, idIfNew, vehicle);
  return updateActive(s, (e) => ({ ...e, vehicle }));
}

export type VehicleSummary = { id: string; name: string; brand: string; model: string; plate: string; year: number | null; km: number };

export function summaries(s: GarageState): VehicleSummary[] {
  return s.vehicles.map((e) => ({
    id: e.id,
    name: e.vehicle.name,
    brand: e.vehicle.brand,
    model: e.vehicle.model,
    plate: e.vehicle.plate,
    year: e.vehicle.year,
    km: e.vehicle.km,
  }));
}
