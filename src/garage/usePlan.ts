import { useMemo } from 'react';
import { useGarage } from './store';
import { evaluatePlan, nextService, planFor, type PlanRow } from './maintenance';
import { dueRows, type DueRow } from './dates';
import { todayISO } from '../utils/format';

/** The vehicle's maintenance plan evaluated for today (empty without a vehicle). */
export function usePlan(): {
  rows: PlanRow[];
  next: ReturnType<typeof nextService>;
  counts: { over: number; soon: number; ok: number; unknown: number };
} {
  const { vehicle, records, overrides } = useGarage();
  return useMemo(() => {
    if (!vehicle) return { rows: [], next: null, counts: { over: 0, soon: 0, ok: 0, unknown: 0 } };
    const rows = evaluatePlan(planFor(vehicle, overrides), records, vehicle, todayISO());
    const counts = { over: 0, soon: 0, ok: 0, unknown: 0 };
    for (const r of rows) counts[r.status.key]++;
    return { rows, next: nextService(rows), counts };
  }, [vehicle, records, overrides]);
}

/** Due dates (user docs + MTV) for today. */
export function useDueDates(): DueRow[] {
  const { docs } = useGarage();
  return useMemo(() => dueRows(docs, todayISO()), [docs]);
}
