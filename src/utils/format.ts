/**
 * Pure formatters used by UI and copy-to-clipboard helpers.
 * All output is plain UTF-8 — no emoji, no box-drawing.
 */

export function formatValue(value: number | string | null | undefined, unit?: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return unit ? `${value} ${unit}` : value;
  let str: string;
  if (Math.abs(value) >= 100 || Number.isInteger(value)) {
    str = value.toFixed(0);
  } else if (Math.abs(value) >= 10) {
    str = value.toFixed(1);
  } else {
    str = value.toFixed(2);
  }
  return unit ? `${str} ${unit}` : str;
}

export function formatTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export type LiveSnapshotRow = {
  label: string;
  value: number | string | null;
  unit: string;
};

export function formatLiveSnapshot(rows: LiveSnapshotRow[], header?: string): string {
  const lines: string[] = [];
  lines.push(header ?? `Otova canlı veri — ${formatTimestamp()}`);
  for (const r of rows) {
    lines.push(`${r.label}: ${formatValue(r.value, r.unit)}`);
  }
  return lines.join('\n');
}

export function formatDTCList(dtcs: string[], heading: string): string {
  if (dtcs.length === 0) return `${heading}: yok`;
  return `${heading}:\n${dtcs.map((d) => `  ${d}`).join('\n')}`;
}

export type FullReport = {
  header?: string;
  vehicle?: { vin?: string | null; ecuName?: string | null; calId?: string | null; cvn?: string | null };
  protocol?: string | null;
  battery?: number | null;
  stored: string[];
  pending: string[];
  permanent: string[];
  live?: LiveSnapshotRow[];
  /** Freeze frame 00: the DTC that triggered it and the captured values. */
  freezeFrame?: { dtc: string; rows: LiveSnapshotRow[] };
  readiness?: Array<{ name: string; supported: boolean; ready: boolean }>;
};

export function formatFullReport(r: FullReport): string {
  const lines: string[] = [];
  lines.push(r.header ?? `Otova tam rapor — ${formatTimestamp()}`);
  lines.push('');

  if (r.vehicle) {
    lines.push('Araç bilgisi');
    if (r.vehicle.vin) lines.push(`  VIN: ${r.vehicle.vin}`);
    if (r.vehicle.ecuName) lines.push(`  ECU: ${r.vehicle.ecuName}`);
    if (r.vehicle.calId) lines.push(`  Kalibrasyon ID: ${r.vehicle.calId}`);
    if (r.vehicle.cvn) lines.push(`  CVN: ${r.vehicle.cvn}`);
    lines.push('');
  }

  if (r.protocol || r.battery != null) {
    lines.push('Bağlantı');
    if (r.protocol) lines.push(`  Protokol: ${r.protocol}`);
    if (r.battery != null) lines.push(`  Akü voltajı: ${r.battery.toFixed(1)} V`);
    lines.push('');
  }

  lines.push(formatDTCList(r.stored, 'Saklanan hata kodları (Mode 03)'));
  lines.push('');
  lines.push(formatDTCList(r.pending, 'Bekleyen hata kodları (Mode 07)'));
  lines.push('');
  lines.push(formatDTCList(r.permanent, 'Kalıcı hata kodları (Mode 0A)'));
  lines.push('');

  if (r.freezeFrame) {
    lines.push(`Anlık görüntü (Mode 02, kaydeden kod: ${r.freezeFrame.dtc})`);
    for (const row of r.freezeFrame.rows) {
      lines.push(`  ${row.label}: ${formatValue(row.value, row.unit)}`);
    }
    lines.push('');
  }

  if (r.readiness && r.readiness.length > 0) {
    lines.push('Hazırlık izleyicileri');
    for (const m of r.readiness) {
      const status = !m.supported ? 'desteklenmiyor' : m.ready ? 'hazır' : 'hazır değil';
      lines.push(`  ${m.name}: ${status}`);
    }
    lines.push('');
  }

  if (r.live && r.live.length > 0) {
    lines.push('Canlı veri (anlık)');
    for (const row of r.live) {
      lines.push(`  ${row.label}: ${formatValue(row.value, row.unit)}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/* ---------- Turkish number / date formatting (pure, no Intl) ---------- */

/** 48612 -> "48.612" (Turkish thousands separator). */
export function formatThousands(n: number): string {
  const sign = n < 0 ? '-' : '';
  const s = Math.round(Math.abs(n)).toString();
  return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "₺7.450" from 7450; null -> "₺—". */
export function formatLira(n: number | null | undefined): string {
  return n == null ? '₺—' : `₺${formatThousands(n)}`;
}

/** ISO "2026-10-10" -> "10.10.2026". */
export function formatDateTR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** "10.10.2026" (or "10/10/2026", "1.2.2026") -> ISO "2026-10-10"; null when invalid. */
export function parseDateTR(s: string): string | null {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(s);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null; // 31.02 etc.
  return toISODate(dt);
}

/** Date -> "YYYY-MM-DD" using its UTC parts. */
export function toISODate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Local "today" as ISO date. */
export function todayISO(now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days from ISO date `a` to ISO date `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((pb - pa) / 86_400_000);
}

/** Digits only -> integer (e.g. "48.612 km" -> 48612); null if none. */
export function parseKm(s: string): number | null {
  const d = s.replace(/\D/g, '');
  return d ? parseInt(d, 10) : null;
}
