/**
 * Maintenance plan: a bundled catalog of generic intervals per fuel type,
 * light brand adjustments, and a pure status calculator.
 *
 * Intervals are conservative general guidance (Turkey, normal use). Every
 * item says so and the user can edit any interval. Nothing here is fetched.
 */
import type { Fuel, IntervalOverride, ServiceRecord, Vehicle } from './types';
import { daysBetween, formatThousands } from '../utils/format';

export type MaintItemDef = {
  id: string;
  name: string;
  /** km between services (0 = not km-based). */
  intervalKm: number;
  /** months between services (0 = not time-based). */
  intervalMonths: number;
  why: string;
  note?: string;
};

type Base = Omit<MaintItemDef, 'intervalKm' | 'intervalMonths'> & {
  km: Partial<Record<Fuel, number>> & { default: number };
  mo: Partial<Record<Fuel, number>> & { default: number };
  fuels?: Fuel[]; // only for these fuels (default: all)
};

const ICE: Fuel[] = ['Benzin', 'Dizel', 'LPG', 'Hibrit'];

const CATALOG: Base[] = [
  { id: 'yag', name: 'Motor yağı', km: { default: 15000 }, mo: { default: 12 }, fuels: ICE,
    why: 'Yağ motoru yağlar ve soğutur; zamanla incelir ve koruma azalır.' },
  { id: 'yagf', name: 'Yağ filtresi', km: { default: 15000 }, mo: { default: 12 }, fuels: ICE,
    why: 'Yağla birlikte değişir; tıkanırsa yağ dolaşımı zayıflar.' },
  { id: 'hava', name: 'Hava filtresi', km: { default: 30000 }, mo: { default: 24 }, fuels: ICE,
    why: 'Motora giren havayı süzer; tıkanırsa performans ve tüketim kötüleşir.' },
  { id: 'polen', name: 'Polen filtresi', km: { default: 15000 }, mo: { default: 12 },
    why: 'Kabine giren havayı süzer; tıkanınca klima zayıflar, camlar buğulanır.' },
  { id: 'yakit', name: 'Yakıt filtresi', km: { default: 60000, Dizel: 30000 }, mo: { default: 48, Dizel: 24 }, fuels: ICE,
    why: 'Yakıttaki partikülleri ve suyu tutar; dizelde daha sık değişir.' },
  { id: 'buji', name: 'Buji', km: { default: 60000, LPG: 30000 }, mo: { default: 48, LPG: 24 }, fuels: ['Benzin', 'LPG', 'Hibrit'],
    why: 'Aşınmış buji tekleme ve yüksek tüketime yol açar. LPG bujiyi daha hızlı yıpratır.' },
  { id: 'kizdirma', name: 'Kızdırma bujileri', km: { default: 100000 }, mo: { default: 0 }, fuels: ['Dizel'],
    why: 'Soğuk marşı kolaylaştırır; zayıflayınca sabah marşı zorlaşır.' },
  { id: 'lpgf', name: 'LPG filtreleri', km: { default: 10000 }, mo: { default: 12 }, fuels: ['LPG'],
    why: 'Gaz ve sıvı faz filtreleri kirlenince LPG sistemi tekler, tüketim artar.' },
  { id: 'triger', name: 'Triger seti', km: { default: 120000 }, mo: { default: 72 }, fuels: ICE,
    why: 'Koparsa motor ciddi hasar görebilir; aralığı aşma. Zincirli motorlarda değişim gerekmez.' },
  { id: 'hid', name: 'Fren hidroliği', km: { default: 0 }, mo: { default: 24 },
    why: 'Zamanla nem çeker, kaynama noktası düşer; kilometreden bağımsız değişir.' },
  { id: 'bal', name: 'Fren balatası (ön)', km: { default: 40000, Hibrit: 60000, Elektrik: 60000 }, mo: { default: 0 },
    why: 'Aşınma sürüşe göre değişir; servis kalınlığı ölçerek teyit eder.' },
  { id: 'antifriz', name: 'Antifriz', km: { default: 60000 }, mo: { default: 48 },
    why: 'Donmayı ve korozyonu önler.' },
  { id: 'sanz', name: 'Şanzıman yağı', km: { default: 60000 }, mo: { default: 0 }, fuels: ICE,
    why: 'Otomatik şanzımanlarda önemlidir; manuelde üretici "ömürlük" diyebilir, kılavuza bak.' },
  { id: 'aku', name: 'Akü kontrolü', km: { default: 0 }, mo: { default: 12 },
    why: 'Kış öncesi voltaj ve marş testi önerilir. Otova\'da Akü testi ile ölçebilirsin.' },
  { id: 'lastik', name: 'Lastik rotasyonu', km: { default: 10000 }, mo: { default: 12 }, fuels: ['Elektrik', 'Hibrit'],
    why: 'Ağır ve torku yüksek araçlarda lastikler eşit aşınsın diye ön-arka yer değiştirir.' },
];

type BrandAdjust = { brands: string[]; items: Record<string, Partial<IntervalOverride> & { note?: string }> };

/** Brand-level tweaks. Kept small and phrased as guidance, not fact per model. */
const BRAND_ADJUST: BrandAdjust[] = [
  {
    brands: ['toyota', 'lexus', 'honda', 'mazda', 'suzuki'],
    items: { triger: { off: true, note: 'Bu markanın çoğu motorunda triger zinciri var; değişim gerekmez. Kılavuzla teyit et.' } },
  },
  {
    brands: ['bmw', 'mercedes', 'mercedes-benz', 'mini'],
    items: {
      triger: { off: true, note: 'Bu markanın çoğu motorunda triger zinciri var. Kılavuzla teyit et.' },
      yag: { note: 'Bu marka çoğu modelde servis göstergesine göre değişim önerir.' },
    },
  },
  {
    brands: ['hyundai', 'kia'],
    items: { triger: { off: true, note: 'Bu markanın çoğu benzinli motorunda triger zinciri var. Dizel ve bazı motorlarda kayış olabilir.' } },
  },
  {
    brands: ['peugeot', 'citroen', 'citroën', 'ds', 'opel'],
    items: { triger: { intervalKm: 100000, intervalMonths: 72, note: '1.2 PureTech motorlarda yağ içinde çalışan kayış daha kısa aralıkla kontrol edilir.' } },
  },
  {
    brands: ['ford'],
    items: { triger: { note: '1.0 EcoBoost motorlarda yağ içinde çalışan kayış var; aralık modele göre değişir.' } },
  },
  {
    brands: ['volkswagen', 'vw', 'skoda', 'škoda', 'seat', 'cupra', 'audi'],
    items: { yag: { note: 'LongLife yağ kullanılıyorsa aralık uzayabilir; Türkiye\'de çoğunlukla 15.000 km / 1 yıl uygulanır.' } },
  },
];

function brandAdjust(brand: string): BrandAdjust['items'] {
  const b = brand.trim().toLocaleLowerCase('tr');
  const hit = BRAND_ADJUST.find((a) => a.brands.includes(b));
  return hit?.items ?? {};
}

/** The item list for a vehicle: catalog ∩ fuel, then brand tweaks, then user overrides. */
export function planFor(
  vehicle: Pick<Vehicle, 'fuel' | 'brand'>,
  overrides: Record<string, IntervalOverride> = {}
): MaintItemDef[] {
  const adj = brandAdjust(vehicle.brand);
  const out: MaintItemDef[] = [];
  for (const c of CATALOG) {
    if (c.fuels && !c.fuels.includes(vehicle.fuel)) continue;
    let intervalKm = c.km[vehicle.fuel] ?? c.km.default;
    let intervalMonths = c.mo[vehicle.fuel] ?? c.mo.default;
    let off = false;
    const a = adj[c.id];
    if (a) {
      if (a.intervalKm != null) intervalKm = a.intervalKm;
      if (a.intervalMonths != null) intervalMonths = a.intervalMonths;
      if (a.off) off = true;
    }
    const o = overrides[c.id];
    if (o) {
      if (o.intervalKm != null) intervalKm = o.intervalKm;
      if (o.intervalMonths != null) intervalMonths = o.intervalMonths;
      if (o.off != null) off = o.off;
    }
    if (off || (intervalKm === 0 && intervalMonths === 0)) continue;
    out.push({ id: c.id, name: c.name, intervalKm, intervalMonths, why: c.why, note: a?.note });
  }
  return out;
}

/** Items the brand turned off (e.g. timing chain), so the UI can offer to re-enable. */
export function hiddenByBrand(vehicle: Pick<Vehicle, 'fuel' | 'brand'>): Array<{ id: string; name: string; note?: string }> {
  const adj = brandAdjust(vehicle.brand);
  return CATALOG.filter((c) => (!c.fuels || c.fuels.includes(vehicle.fuel)) && adj[c.id]?.off).map((c) => ({
    id: c.id,
    name: c.name,
    note: adj[c.id]?.note,
  }));
}

export function itemName(id: string): string {
  return CATALOG.find((c) => c.id === id)?.name ?? id;
}

/* ---------- Status ---------- */

export type MaintStatusKey = 'over' | 'soon' | 'ok' | 'unknown';

export type MaintStatus = {
  key: MaintStatusKey;
  /** km left (negative = overdue); null when not km-based or unknown. */
  leftKm: number | null;
  /** days left (negative = overdue); null when not time-based or unknown. */
  leftDays: number | null;
  /** 0..1 of the interval used up (the more advanced dimension). */
  used: number;
  last: { date: string; km: number } | null;
  /** True when "last" is an assumption (new car, no record). */
  assumed: boolean;
};

export const STATUS_LABEL: Record<MaintStatusKey, string> = {
  over: 'Gecikmiş',
  soon: 'Yaklaşıyor',
  ok: 'İyi',
  unknown: 'Kayıt yok',
};

/** Latest record (by km, then date) that includes `itemId`. */
export function lastDone(itemId: string, records: ServiceRecord[]): { date: string; km: number } | null {
  let best: ServiceRecord | null = null;
  for (const r of records) {
    if (!r.items.includes(itemId)) continue;
    if (!best || r.km > best.km || (r.km === best.km && r.date > best.date)) best = r;
  }
  return best ? { date: best.date, km: best.km } : null;
}

const DAYS_PER_MONTH = 30.44;

/**
 * Where an item stands today.
 * With no record we assume the factory state (0 km, Jan 1 of the model year)
 * only while that assumption is still inside the interval; past it the
 * status is "unknown" (we cannot tell whether it was done).
 */
export function maintStatus(
  item: MaintItemDef,
  records: ServiceRecord[],
  vehicle: Pick<Vehicle, 'km' | 'year'>,
  today: string
): MaintStatus {
  let last = lastDone(item.id, records);
  let assumed = false;
  let timeKnown = true;
  if (!last) {
    // No record: estimate that the item was done on schedule, i.e. at the
    // last whole interval (48.612 km, every 15.000 -> last at 45.000).
    const factoryDate = vehicle.year ? `${vehicle.year}-01-01` : null;
    if (!item.intervalKm && !factoryDate) {
      return { key: 'unknown', leftKm: null, leftDays: null, used: 0, last: null, assumed: false };
    }
    const lastKm = item.intervalKm ? Math.floor(Math.max(0, vehicle.km) / item.intervalKm) * item.intervalKm : 0;
    let lastDate = today;
    if (item.intervalMonths && factoryDate) {
      const span = Math.round(item.intervalMonths * DAYS_PER_MONTH);
      const cycles = Math.floor(Math.max(0, daysBetween(factoryDate, today)) / span);
      lastDate = addDays(factoryDate, cycles * span);
    } else if (item.intervalMonths) {
      timeKnown = false; // km-based estimate only
    }
    last = { date: lastDate, km: lastKm };
    assumed = true;
  }

  const leftKm = item.intervalKm ? item.intervalKm - (vehicle.km - last.km) : null;
  const leftDays =
    item.intervalMonths && timeKnown
      ? Math.round(item.intervalMonths * DAYS_PER_MONTH) - daysBetween(last.date, today)
      : null;

  const usedKm = leftKm != null ? 1 - leftKm / item.intervalKm : 0;
  const usedTime = leftDays != null ? 1 - leftDays / (item.intervalMonths * DAYS_PER_MONTH) : 0;
  const used = Math.max(usedKm, usedTime);

  let key: MaintStatusKey = 'ok';
  if ((leftKm != null && leftKm < 0) || (leftDays != null && leftDays < 0)) key = 'over';
  else if (
    (leftKm != null && (leftKm <= 3000 || leftKm / item.intervalKm < 0.15)) ||
    (leftDays != null && leftDays <= 31)
  )
    key = 'soon';

  return { key, leftKm, leftDays, used: Math.max(0, Math.min(1, used)), last, assumed };
}

function addDays(iso: string, days: number): string {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** "Her 15.000 km veya 1 yılda bir" */
export function everyText(item: Pick<MaintItemDef, 'intervalKm' | 'intervalMonths'>): string {
  const km = item.intervalKm ? `${formatThousands(item.intervalKm)} km` : null;
  const mo = item.intervalMonths
    ? item.intervalMonths % 12 === 0
      ? `${item.intervalMonths / 12} yılda`
      : `${item.intervalMonths} ayda`
    : null;
  if (km && mo) return `Her ${km} veya ${mo} bir`;
  if (km) return `Her ${km}'de bir`;
  return `Her ${mo} bir`;
}

/** "2.400 km veya 1 ay kaldı" / "12.612 km geçti · 13 ay geçti"; estimates end with "· tahmini". */
export function leftLine(s: MaintStatus): string {
  if (s.key === 'unknown') return 'Model yılını gir ya da son yapılmayı işaretle';
  const line = leftCore(s);
  return s.assumed ? `${line} · tahmini` : line;
}

function leftCore(s: MaintStatus): string {
  const parts: string[] = [];
  if (s.key === 'over') {
    if (s.leftKm != null && s.leftKm < 0) parts.push(`${formatThousands(-s.leftKm)} km geçti`);
    if (s.leftDays != null && s.leftDays < 0) parts.push(`${durationText(-s.leftDays)} geçti`);
    return parts.join(' · ');
  }
  if (s.leftKm != null) parts.push(`${formatThousands(s.leftKm)} km`);
  if (s.leftDays != null) parts.push(durationText(s.leftDays));
  return `${parts.join(' veya ')} kaldı`;
}

/** 45 -> "1 ay", 400 -> "13 ay", 10 -> "10 gün", 800 -> "2 yıl". */
export function durationText(days: number): string {
  if (days < 31) return `${Math.max(0, Math.round(days))} gün`;
  const months = Math.round(days / DAYS_PER_MONTH);
  if (months >= 24 && months % 12 === 0) return `${months / 12} yıl`;
  return `${months} ay`;
}

/** "15.000 km · 1 yıl" */
export function intervalText(item: Pick<MaintItemDef, 'intervalKm' | 'intervalMonths'>): string {
  const p: string[] = [];
  if (item.intervalKm) p.push(`${formatThousands(item.intervalKm)} km`);
  if (item.intervalMonths) p.push(item.intervalMonths % 12 === 0 ? `${item.intervalMonths / 12} yıl` : `${item.intervalMonths} ay`);
  return p.join(' · ');
}

const ORDER: Record<MaintStatusKey, number> = { over: 0, soon: 1, ok: 2, unknown: 3 };

export type PlanRow = { item: MaintItemDef; status: MaintStatus };

/** Plan rows sorted most urgent first. */
export function evaluatePlan(
  items: MaintItemDef[],
  records: ServiceRecord[],
  vehicle: Pick<Vehicle, 'km' | 'year'>,
  today: string
): PlanRow[] {
  return items
    .map((item) => ({ item, status: maintStatus(item, records, vehicle, today) }))
    .sort((a, b) => ORDER[a.status.key] - ORDER[b.status.key] || b.status.used - a.status.used);
}

/**
 * The single "Sıradaki bakım" for Garaj: the most used-up known item.
 * Oil and oil filter on the same schedule read "Yağ + filtre".
 */
export function nextService(rows: PlanRow[]): { name: string; row: PlanRow } | null {
  const known = rows.filter((r) => r.status.key !== 'unknown');
  if (known.length === 0) return null;
  const top = known.reduce((a, b) => (b.status.used > a.status.used ? b : a));
  if (top.item.id === 'yag' || top.item.id === 'yagf') {
    const other = known.find((r) => r.item.id === (top.item.id === 'yag' ? 'yagf' : 'yag'));
    if (other && other.status.leftKm === top.status.leftKm && other.status.leftDays === top.status.leftDays) {
      return { name: 'Yağ + filtre', row: top };
    }
  }
  return { name: top.item.name, row: top };
}
