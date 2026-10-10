/**
 * "Belgeler ve tarihler": user-entered due dates plus the MTV installments,
 * which are fixed by law (January and July, due by the end of the month).
 */
import type { DocDate, DocKind } from './types';
import { daysBetween } from '../utils/format';

export const DOC_KINDS: Array<{ kind: Exclude<DocKind, 'custom'>; name: string; note: string; spanDays: number }> = [
  { kind: 'muayene', name: 'Muayene', note: 'TÜVTÜRK', spanDays: 730 },
  { kind: 'trafik', name: 'Trafik sigortası', note: 'Yıllık', spanDays: 365 },
  { kind: 'kasko', name: 'Kasko', note: 'Yıllık', spanDays: 365 },
];

export type DueRow = {
  id: string;
  name: string;
  date: string;
  note: string;
  days: number;
  /** 0..1 of the period elapsed (for the ring). */
  elapsed: number;
  auto: boolean;
};

/** Next two MTV installment due dates on or after `today` (Jan 31, Jul 31). */
export function mtvDueDates(today: string): Array<{ id: string; name: string; date: string }> {
  const y = parseInt(today.slice(0, 4), 10);
  const out: Array<{ id: string; name: string; date: string }> = [];
  for (const year of [y, y + 1]) {
    out.push({ id: `mtv-${year}-1`, name: 'MTV · 1. taksit', date: `${year}-01-31` });
    out.push({ id: `mtv-${year}-2`, name: 'MTV · 2. taksit', date: `${year}-07-31` });
  }
  return out.filter((d) => d.date >= today).slice(0, 1);
}

function spanFor(kind: DocKind): number {
  return DOC_KINDS.find((k) => k.kind === kind)?.spanDays ?? 365;
}

/** All due dates (user + MTV) sorted soonest first. */
export function dueRows(docs: DocDate[], today: string, includeMtv = true): DueRow[] {
  const rows: DueRow[] = docs.map((d) => {
    const days = daysBetween(today, d.date);
    const span = spanFor(d.kind);
    return { id: d.id, name: d.name, date: d.date, note: d.note, days, elapsed: 1 - days / span, auto: false };
  });
  if (includeMtv) {
    for (const m of mtvDueDates(today)) {
      const days = daysBetween(today, m.date);
      rows.push({ id: m.id, name: m.name, date: m.date, note: m.date.slice(5, 7) === '01' ? 'Ocak taksiti' : 'Temmuz taksiti', days, elapsed: 1 - days / 182, auto: true });
    }
  }
  return rows.sort((a, b) => a.days - b.days);
}

/** "23 gün", "Bugün", "3 gün geçti". */
export function daysText(days: number): string {
  if (days === 0) return 'Bugün';
  if (days < 0) return `${-days} gün geçti`;
  return `${days} gün`;
}
