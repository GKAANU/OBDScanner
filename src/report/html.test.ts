import { escapeHtml, garageReportHtml, serviceHistoryHtml, usedCarReportHtml } from './html';
import { evaluatePlan, planFor } from '../garage/maintenance';
import type { ServiceRecord, Vehicle } from '../garage/types';

const car: Vehicle = {
  name: 'Clio <b>', brand: 'Renault', model: 'Clio V', year: 2021, plate: '34 ABC 123', km: 48612,
  kmUpdatedAt: '2026-10-10', kmSource: 'manual', fuel: 'Benzin',
};
const records: ServiceRecord[] = [
  { id: '1', date: '2025-11-14', km: 36212, items: ['yag', 'yagf'], service: 'Yıldız & Oto', cost: 7450, note: '' },
];
const NOW = new Date(2026, 9, 10, 14, 32);

describe('report html', () => {
  it('escapes user text', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    const html = serviceHistoryHtml(car, records, [], NOW);
    expect(html).toContain('Clio &lt;b&gt;');
    expect(html).not.toContain('Clio <b>');
    expect(html).toContain('Yıldız &amp; Oto');
  });
  it('service history lists records, totals and plan status', () => {
    const rows = evaluatePlan(planFor(car), records, car, '2026-10-10');
    const html = serviceHistoryHtml(car, records, rows, NOW);
    expect(html).toContain('14.11.2025');
    expect(html).toContain('Motor yağı, Yağ filtresi');
    expect(html).toContain('toplam ₺7.450');
    expect(html).toContain('Bakım durumu');
    expect(html).toContain('2026-10-10 14:32');
    expect(html).toContain('internete gönderilmez');
  });
  it('used-car report shows flags, rows and scanned codes with titles', () => {
    const html = usedCarReportHtml(
      car,
      [{ title: 'Kodlar silindiğinden beri', value: '12 km', note: 'Çok az mesafe', tone: 'warn', flag: true }],
      1,
      { at: '2026-10-10T10:00:00Z', stored: [], pending: [], permanent: ['P0420'], milOn: false, monitors: [], battery: 12.6 },
      NOW
    );
    expect(html).toContain('1 konuya bak');
    expect(html).toContain('12 km');
    expect(html).toContain('P0420');
    expect(html).toContain('Katalizör verimi düşük');
    expect(html).toContain('Akü 12.6 V');
  });
  it('garage report handles no scan and no history', () => {
    const html = garageReportHtml(car, null, [], [], [], NOW);
    expect(html).toContain('Henüz tarama yapılmadı.');
    expect(html).toContain('Kayıt yok.');
  });
});
