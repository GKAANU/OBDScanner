/**
 * Print-friendly HTML report builders (A4, light background). Pure: no React
 * Native imports, so Jest can check them. Rendered to PDF on the device by
 * expo-print (see share.ts); nothing is sent anywhere.
 */
import type { ScanSummary, ServiceRecord, Vehicle } from '../garage/types';
import { itemName, leftLine, intervalText, STATUS_LABEL, type PlanRow } from '../garage/maintenance';
import type { DueRow } from '../garage/dates';
import { daysText } from '../garage/dates';
import type { UsedCarRow } from '../obd/health';
import { dtcDetail } from '../obd/dtc-details';
import { formatDateTR, formatLira, formatThousands, formatTimestamp } from '../utils/format';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

const LOGO_SVG =
  '<svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden="true">' +
  '<path d="M17 18L33 32L17 46" stroke="#111" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<rect x="37" y="40" width="12" height="6" rx="1.5" fill="#f2b100"/></svg>';

const CSS = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; background: #fff; font-size: 11pt; line-height: 1.45; margin: 0; }
header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #f2b100; padding-bottom: 8px; margin-bottom: 14px; }
.brand { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14pt; letter-spacing: -0.3px; }
.meta { color: #555; font-size: 9pt; text-align: right; }
h1 { font-size: 18pt; margin: 0 0 4px; letter-spacing: -0.4px; }
h2 { font-size: 12.5pt; margin: 18px 0 6px; }
.sub { color: #555; margin: 0 0 10px; }
table { width: 100%; border-collapse: collapse; margin-top: 4px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e3e1dd; vertical-align: top; }
th { font-size: 9pt; color: #555; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mono { font-family: Menlo, Courier, monospace; }
.chip { display: inline-block; padding: 1px 6px; border-radius: 5px; font-size: 9pt; font-weight: 600; }
.ok { color: #157a3a; background: #e6f4ea; }
.warn { color: #9a5b00; background: #fdf1dc; }
.error { color: #b42318; background: #fde7e5; }
.neutral { color: #555; background: #efedea; }
.box { border: 1px solid #e3e1dd; border-radius: 8px; padding: 10px 12px; margin-top: 8px; }
footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e3e1dd; color: #777; font-size: 8.5pt; }
`;

function vehicleLine(v: Vehicle): string {
  const parts = [`${v.brand} ${v.model}`.trim(), v.year ? String(v.year) : '', v.fuel, `${formatThousands(v.km)} km`];
  return parts.filter(Boolean).join(' · ');
}

function page(title: string, v: Vehicle, body: string, now: Date): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${e(title)}</title><style>${CSS}</style></head><body>
<header><div class="brand">${LOGO_SVG}<span>otova</span></div><div class="meta">${e(formatTimestamp(now))}</div></header>
<h1>${e(title)}</h1>
<p class="sub">${e(v.name)}${v.plate ? ` · ${e(v.plate)}` : ''} · ${e(vehicleLine(v))}</p>
${body}
<footer>Otova ile oluşturuldu · Otova raporu cihazda üretir, internete gönderilmez. Bilgiler genel rehberdir; kesin karar için servise danış.</footer>
</body></html>`;
}

function toneClass(t: string): string {
  return t === 'ok' || t === 'warn' || t === 'error' ? t : 'neutral';
}

const STATUS_CLASS: Record<string, string> = { over: 'error', soon: 'warn', ok: 'ok', unknown: 'neutral' };

function planTable(planRows: PlanRow[]): string {
  if (planRows.length === 0) return '';
  const rows = planRows
    .map(
      (r) =>
        `<tr><td>${e(r.item.name)}</td><td><span class="chip ${STATUS_CLASS[r.status.key]}">${e(STATUS_LABEL[r.status.key])}</span></td><td>${e(leftLine(r.status))}</td><td>${e(intervalText(r.item))}</td></tr>`
    )
    .join('');
  return `<h2>Bakım durumu</h2><table><thead><tr><th>Kalem</th><th>Durum</th><th>Kalan</th><th>Aralık</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function historyTable(records: ServiceRecord[]): string {
  if (records.length === 0) return '<h2>Servis geçmişi</h2><p class="sub">Kayıt yok.</p>';
  const total = records.reduce((s, r) => s + (r.cost ?? 0), 0);
  const rows = records
    .map(
      (r) =>
        `<tr><td class="num">${e(formatDateTR(r.date))}</td><td class="num">${e(formatThousands(r.km))} km</td><td>${e(r.items.map(itemName).join(', '))}${r.note ? `<br><span class="sub">${e(r.note)}</span>` : ''}</td><td>${e(r.service || '—')}</td><td class="num">${e(formatLira(r.cost))}</td></tr>`
    )
    .join('');
  return `<h2>Servis geçmişi</h2><table><thead><tr><th>Tarih</th><th>Km</th><th>Yapılanlar</th><th>Servis</th><th>Tutar</th></tr></thead><tbody>${rows}</tbody></table>
<p class="sub" style="margin-top:6px">${records.length} kayıt · toplam ${e(formatLira(total))}</p>`;
}

/** "Araç satarken": service history + current maintenance state. */
export function serviceHistoryHtml(vehicle: Vehicle, records: ServiceRecord[], planRows: PlanRow[], now = new Date()): string {
  return page('Servis geçmişi', vehicle, historyTable(records) + planTable(planRows), now);
}

function scanBlock(scan: ScanSummary | null): string {
  if (!scan) return '<h2>Arıza kodları</h2><p class="sub">Henüz tarama yapılmadı.</p>';
  const groups: Array<[string, string[]]> = [
    ['Kayıtlı', scan.stored],
    ['Bekleyen', scan.pending],
    ['Kalıcı', scan.permanent],
  ];
  const rows = groups
    .map(([name, codes]) =>
      codes.length
        ? codes.map((c) => `<tr><td>${e(name)}</td><td class="mono">${e(c)}</td><td>${e(dtcDetail(c).title)}</td></tr>`).join('')
        : `<tr><td>${e(name)}</td><td colspan="2" class="sub">Kod yok</td></tr>`
    )
    .join('');
  const supported = scan.monitors.filter((m) => m.supported);
  const ready = supported.filter((m) => m.ready).length;
  const when = scan.at.slice(0, 10);
  return `<h2>Arıza kodları</h2><p class="sub">Son tarama: ${e(formatDateTR(when))}${scan.milOn != null ? ` · MIL ${scan.milOn ? 'açık' : 'kapalı'}` : ''}${supported.length ? ` · Hazırlık ${ready}/${supported.length}` : ''}${scan.battery != null ? ` · Akü ${scan.battery.toFixed(1)} V` : ''}</p>
<table><thead><tr><th>Grup</th><th>Kod</th><th>Anlamı</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** İkinci el kontrolü raporu. */
export function usedCarReportHtml(
  vehicle: Vehicle,
  rows: UsedCarRow[],
  flags: number,
  scan: ScanSummary | null,
  now = new Date()
): string {
  const summary =
    flags > 0
      ? `<div class="box"><span class="chip warn">${flags} konuya bak</span> Satıcıya sor, ekspertizde kontrol ettir.</div>`
      : '<div class="box"><span class="chip ok">Temiz görünüyor</span> OBD verisinde yakın zamanda kod silindiğine dair iz yok.</div>';
  const table = `<h2>Kontroller</h2><table><thead><tr><th>Kontrol</th><th>Değer</th><th>Not</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td>${e(r.title)}</td><td class="num"><span class="chip ${toneClass(r.tone)}">${e(r.value)}</span></td><td>${e(r.note)}</td></tr>`
    )
    .join('')}</tbody></table>`;
  const note =
    '<p class="sub" style="margin-top:10px">Bu kontrol yalnızca OBD-II verisine dayanır; kaporta, şasi ve mekanik ekspertizin yerini tutmaz.</p>';
  return page('İkinci el kontrol raporu', vehicle, summary + table + scanBlock(scan) + note, now);
}

/** Full Garaj report: scan, maintenance, due dates and history. */
export function garageReportHtml(
  vehicle: Vehicle,
  scan: ScanSummary | null,
  planRows: PlanRow[],
  due: DueRow[],
  records: ServiceRecord[],
  now = new Date()
): string {
  const dates = due.length
    ? `<h2>Yaklaşan tarihler</h2><table><thead><tr><th>Ne</th><th>Tarih</th><th>Kalan</th></tr></thead><tbody>${due
        .map((d) => `<tr><td>${e(d.name)}</td><td class="num">${e(formatDateTR(d.date))}</td><td class="num">${e(daysText(d.days))}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  return page('Araç raporu', vehicle, scanBlock(scan) + planTable(planRows) + dates + historyTable(records), now);
}
