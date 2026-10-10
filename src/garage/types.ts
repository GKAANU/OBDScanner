/** Data the user owns. Persisted locally (AsyncStorage), never sent anywhere. */

export type Fuel = 'Benzin' | 'Dizel' | 'LPG' | 'Hibrit' | 'Elektrik';
export const FUELS: Fuel[] = ['Benzin', 'Dizel', 'LPG', 'Hibrit', 'Elektrik'];

export type Vehicle = {
  name: string;
  brand: string;
  model: string;
  /** Model year, e.g. 2021. */
  year: number | null;
  plate: string;
  km: number;
  /** ISO date when `km` was last set (by hand or read from the car). */
  kmUpdatedAt: string;
  kmSource: 'manual' | 'obd';
  fuel: Fuel;
};

export type ServiceRecord = {
  id: string;
  /** ISO date. */
  date: string;
  km: number;
  /** Maintenance item ids done in this visit. */
  items: string[];
  service: string;
  cost: number | null;
  note: string;
};

/** User edits to an item's interval (0 = not used for that dimension). */
export type IntervalOverride = { intervalKm?: number; intervalMonths?: number; off?: boolean };

export type DocKind = 'muayene' | 'trafik' | 'kasko' | 'custom';

export type DocDate = {
  id: string;
  kind: DocKind;
  name: string;
  /** ISO date (due / expiry). */
  date: string;
  note: string;
};

/** The last Tanı scan, kept so Garaj can show health while offline. */
export type ScanSummary = {
  at: string; // ISO datetime
  stored: string[];
  pending: string[];
  permanent: string[];
  milOn: boolean | null;
  monitors: Array<{ name: string; supported: boolean; ready: boolean }>;
  battery: number | null;
};
