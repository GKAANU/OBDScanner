/**
 * Local reminder planner. Pure: turns due dates, maintenance status and
 * settings into a list of dated notifications. Scheduling happens in
 * ReminderSync (iOS local notifications, no network).
 */
import type { MaintStatus } from '../garage/maintenance';
import { formatDateTR } from '../utils/format';

export type ReminderSettings = {
  enabled: boolean;
  docs: boolean;
  maintenance: boolean;
  seasonal: boolean;
  /** Local hour of day (0-23) reminders fire at. */
  hour: number;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  docs: true,
  maintenance: true,
  seasonal: true,
  hour: 10,
};

export type ReminderDoc = {
  id: string;
  name: string;
  /** ISO date. */
  date: string;
  kind?: 'muayene' | 'trafik' | 'kasko' | 'custom' | 'mtv';
};

export type ReminderMaint = {
  id: string;
  name: string;
  status: MaintStatus;
  intervalKm: number;
  intervalMonths: number;
  /** Average km per day used to estimate km-based due dates (default 40). */
  vehicleKmPerDay?: number;
};

export type PlannedReminder = { id: string; title: string; body: string; date: Date };

/** iOS keeps at most 64 pending local notifications; leave headroom. */
export const MAX_REMINDERS = 60;
export const DEFAULT_KM_PER_DAY = 40;

/** Local Date at `hour`:00 on ISO date `iso` shifted by `offsetDays`. */
export function atLocal(iso: string, offsetDays: number, hour: number): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d + offsetDays, hour, 0, 0, 0);
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function inText(days: number): string {
  if (days === 0) return 'bugün';
  if (days === 1) return 'yarın';
  return `${days} gün sonra`;
}

/** Next occurrence (on or after today) of month/day as ISO date. */
function nextAnnual(today: string, month: number, day: number): string {
  const y = parseInt(today.slice(0, 4), 10);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const thisYear = `${y}-${pad(month)}-${pad(day)}`;
  return thisYear >= today ? thisYear : `${y + 1}-${pad(month)}-${pad(day)}`;
}

export function planReminders(input: {
  today: string;
  now: Date;
  docs: ReminderDoc[];
  maintenance: ReminderMaint[];
  vehicleName: string;
  settings: ReminderSettings;
}): PlannedReminder[] {
  const { today, now, docs, maintenance, vehicleName, settings } = input;
  if (!settings.enabled) return [];
  const hour = settings.hour;
  const out: PlannedReminder[] = [];
  const push = (id: string, title: string, body: string, date: Date) => {
    if (date.getTime() > now.getTime()) out.push({ id, title, body, date });
  };

  if (settings.docs) {
    for (const d of docs) {
      if (d.date < today) continue;
      const offsets = d.kind === 'muayene' || d.kind === 'trafik' || d.kind === 'kasko' ? [30, 7, 1] : [7, 1];
      for (const off of offsets) {
        push(`doc-${d.id}-${off}`, `${d.name} ${inText(off)}`, `${vehicleName} · ${formatDateTR(d.date)}`, atLocal(d.date, -off, hour));
      }
    }
  }

  if (settings.maintenance) {
    for (const m of maintenance) {
      const s = m.status;
      if (s.key === 'unknown' || s.key === 'over') continue;
      if (s.leftDays != null) {
        const due = addDaysISO(today, s.leftDays);
        push(`mnt-${m.id}-14`, `${m.name} 14 gün sonra`, `${vehicleName} · ${formatDateTR(due)}`, atLocal(due, -14, hour));
        push(`mnt-${m.id}-0`, `${m.name} zamanı geldi`, `${vehicleName} · ${formatDateTR(due)}`, atLocal(due, 0, hour));
      } else if (s.leftKm != null) {
        const rate = m.vehicleKmPerDay && m.vehicleKmPerDay > 0 ? m.vehicleKmPerDay : DEFAULT_KM_PER_DAY;
        const days = Math.round(s.leftKm / rate);
        const due = addDaysISO(today, days);
        push(
          `mnt-${m.id}-km`,
          `${m.name} yaklaşıyor`,
          `${vehicleName} · Tahmini, kilometreye göre: ${formatDateTR(due)}`,
          atLocal(due, -14, hour)
        );
      }
    }
  }

  if (settings.seasonal) {
    const winter = nextAnnual(today, 11, 10);
    push(
      `season-kis-${winter.slice(0, 4)}`,
      'Kış lastiği zamanı',
      `${vehicleName} · 15 Kasım itibarıyla kış lastiği önerilir; ticari araçlar için zorunlu.`,
      atLocal(winter, 0, hour)
    );
    const summer = nextAnnual(today, 4, 10);
    push(
      `season-yaz-${summer.slice(0, 4)}`,
      'Yaz lastiğine geçiş',
      `${vehicleName} · 15 Nisan sonrası yaz lastiğine geçebilirsin.`,
      atLocal(summer, 0, hour)
    );
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, MAX_REMINDERS);
}
