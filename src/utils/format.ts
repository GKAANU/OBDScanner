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
