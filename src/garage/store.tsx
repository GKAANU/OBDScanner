import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DocDate, IntervalOverride, ScanSummary, ServiceRecord, Vehicle } from './types';
import {
  activeEntry,
  addVehicle as addVehicleTo,
  EMPTY_GARAGE,
  migrateV1,
  parseV2,
  removeVehicle as removeVehicleFrom,
  saveActiveVehicle,
  selectVehicle as selectVehicleIn,
  summaries,
  updateActive,
  type GarageState,
  type GarageV1,
  type VehicleSummary,
} from './garage-data';
import { todayISO } from '../utils/format';

/**
 * The user's garage: one or more vehicles, each with its service log,
 * interval edits, due dates and last scan. Stored as one JSON blob in
 * AsyncStorage ('otova.garage.v2'); local only.
 *
 * The single-vehicle fields (`vehicle`, `records`, ...) and their actions
 * always refer to the ACTIVE vehicle, so screens need not know about
 * multiple vehicles.
 */

const KEY_V1 = 'otova.garage.v1';
const KEY_V2 = 'otova.garage.v2';

type Ctx = {
  hydrated: boolean;
  // Active vehicle
  vehicle: Vehicle | null;
  records: ServiceRecord[];
  overrides: Record<string, IntervalOverride>;
  docs: DocDate[];
  lastScan: ScanSummary | null;
  /** Edit the active vehicle (creates the first one on a fresh install). */
  saveVehicle: (v: Vehicle) => void;
  /** Set the odometer; `source: 'obd'` when read from the car (PID A6). */
  setKm: (km: number, source?: Vehicle['kmSource']) => void;
  addRecord: (r: Omit<ServiceRecord, 'id'>) => void;
  deleteRecord: (id: string) => void;
  setOverride: (itemId: string, o: IntervalOverride | null) => void;
  upsertDoc: (d: Omit<DocDate, 'id'> & { id?: string }) => void;
  deleteDoc: (id: string) => void;
  setLastScan: (s: ScanSummary) => void;
  // All vehicles
  vehicles: VehicleSummary[];
  activeId: string | null;
  selectVehicle: (id: string) => void;
  /** Add a vehicle and make it active; returns its id. */
  addVehicle: (v: Vehicle) => string;
  /** Remove a vehicle (the last one cannot be removed). */
  removeVehicle: (id: string) => void;
};

const GarageContext = createContext<Ctx | null>(null);

let idSeq = 0;
function newId(): string {
  idSeq = (idSeq + 1) % 1000;
  return `${Date.now().toString(36)}${idSeq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function GarageProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GarageState>(EMPTY_GARAGE);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw2 = await AsyncStorage.getItem(KEY_V2);
        const v2 = raw2 ? parseV2(JSON.parse(raw2)) : null;
        if (v2) {
          setState(v2);
        } else {
          // First launch of the multi-vehicle build: migrate v1 (kept untouched).
          const raw1 = await AsyncStorage.getItem(KEY_V1);
          if (raw1) {
            const migrated = migrateV1(JSON.parse(raw1) as GarageV1, newId());
            setState(migrated);
            AsyncStorage.setItem(KEY_V2, JSON.stringify(migrated)).catch(() => {});
          }
        }
      } catch {
        // corrupt or unreadable: start empty
      } finally {
        hydratedRef.current = true;
        setHydrated(true);
      }
    })();
  }, []);

  /** Apply a change and persist (only after hydration, so saved data is never overwritten with EMPTY). */
  const update = useCallback((fn: (s: GarageState) => GarageState) => {
    setState((prev) => {
      const next = fn(prev);
      if (next !== prev && hydratedRef.current) AsyncStorage.setItem(KEY_V2, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const saveVehicle = useCallback((v: Vehicle) => update((s) => saveActiveVehicle(s, v, newId())), [update]);

  const setKm = useCallback(
    (km: number, source: Vehicle['kmSource'] = 'manual') =>
      update((s) => updateActive(s, (e) => ({ ...e, vehicle: { ...e.vehicle, km, kmSource: source, kmUpdatedAt: todayISO() } }))),
    [update]
  );

  const addRecord = useCallback(
    (r: Omit<ServiceRecord, 'id'>) =>
      update((s) =>
        updateActive(s, (e) => {
          const records = [{ ...r, id: newId() }, ...e.records].sort((a, b) =>
            b.date > a.date ? 1 : b.date < a.date ? -1 : b.km - a.km
          );
          // A record with a higher km than the odometer moves the odometer forward.
          const vehicle = r.km > e.vehicle.km ? { ...e.vehicle, km: r.km, kmUpdatedAt: todayISO() } : e.vehicle;
          return { ...e, records, vehicle };
        })
      ),
    [update]
  );

  const deleteRecord = useCallback(
    (id: string) => update((s) => updateActive(s, (e) => ({ ...e, records: e.records.filter((r) => r.id !== id) }))),
    [update]
  );

  const setOverride = useCallback(
    (itemId: string, o: IntervalOverride | null) =>
      update((s) =>
        updateActive(s, (e) => {
          const overrides = { ...e.overrides };
          if (o) overrides[itemId] = o;
          else delete overrides[itemId];
          return { ...e, overrides };
        })
      ),
    [update]
  );

  const upsertDoc = useCallback(
    (doc: Omit<DocDate, 'id'> & { id?: string }) =>
      update((s) =>
        updateActive(s, (e) => {
          const id = doc.id ?? newId();
          return { ...e, docs: [...e.docs.filter((x) => x.id !== id), { ...doc, id }] };
        })
      ),
    [update]
  );

  const deleteDoc = useCallback(
    (id: string) => update((s) => updateActive(s, (e) => ({ ...e, docs: e.docs.filter((x) => x.id !== id) }))),
    [update]
  );

  const setLastScan = useCallback(
    (scan: ScanSummary) => update((s) => updateActive(s, (e) => ({ ...e, lastScan: scan }))),
    [update]
  );

  const selectVehicle = useCallback((id: string) => update((s) => selectVehicleIn(s, id)), [update]);

  const addVehicle = useCallback(
    (v: Vehicle) => {
      const id = newId();
      update((s) => addVehicleTo(s, id, v));
      return id;
    },
    [update]
  );

  const removeVehicle = useCallback((id: string) => update((s) => removeVehicleFrom(s, id)), [update]);

  const value = useMemo<Ctx>(() => {
    const a = activeEntry(state);
    return {
      hydrated,
      vehicle: a?.vehicle ?? null,
      records: a?.records ?? EMPTY_RECORDS,
      overrides: a?.overrides ?? EMPTY_OVERRIDES,
      docs: a?.docs ?? EMPTY_DOCS,
      lastScan: a?.lastScan ?? null,
      saveVehicle,
      setKm,
      addRecord,
      deleteRecord,
      setOverride,
      upsertDoc,
      deleteDoc,
      setLastScan,
      vehicles: summaries(state),
      activeId: a?.id ?? null,
      selectVehicle,
      addVehicle,
      removeVehicle,
    };
  }, [state, hydrated, saveVehicle, setKm, addRecord, deleteRecord, setOverride, upsertDoc, deleteDoc, setLastScan, selectVehicle, addVehicle, removeVehicle]);

  return <GarageContext.Provider value={value}>{children}</GarageContext.Provider>;
}

// Stable empties so memoized consumers do not re-run on every render.
const EMPTY_RECORDS: ServiceRecord[] = [];
const EMPTY_OVERRIDES: Record<string, IntervalOverride> = {};
const EMPTY_DOCS: DocDate[] = [];

export function useGarage(): Ctx {
  const ctx = useContext(GarageContext);
  if (!ctx) throw new Error('useGarage must be used inside GarageProvider');
  return ctx;
}
