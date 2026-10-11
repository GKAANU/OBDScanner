import { codeParts, dtcDetail } from './dtc-details';

describe('dtcDetail', () => {
  it('gives known codes a verdict, subsystem and steps', () => {
    const d = dtcDetail('p0335');
    expect(d).toMatchObject({ code: 'P0335', urgency: 'error', answer: 'Hayır, dur.', known: true });
    expect(d.steps[0].urgent).toBe(true);
    expect(d.causes.length).toBeGreaterThan(1);
  });
  it('explains manufacturer codes without inventing causes', () => {
    const d = dtcDetail('P1336');
    expect(d).toMatchObject({ title: 'Üreticiye özel kod', known: false, causes: [] });
    expect(d.sys).toMatch(/^Alt sistem: ateşleme/);
    expect(d.steps.length).toBeGreaterThan(0);
  });
  it('every table entry has an answer and steps', () => {
    for (const c of ['P0300', 'P0171', 'P0172', 'P0420', 'P0456', 'P0131', 'P0101', 'P0117', 'P0128', 'P0217', 'P0401', 'P2002', 'P0299', 'P0562', 'U0100']) {
      const d = dtcDetail(c);
      expect(d.answer).toBeTruthy();
      expect(d.steps.length).toBeGreaterThan(1);
    }
  });
});

describe('codeParts', () => {
  it('splits a P code into four parts', () => {
    expect(codeParts('P1336')).toEqual([
      { k: 'P', v: 'Motor ve şanzıman' },
      { k: '1', v: 'Üreticiye özel' },
      { k: '3', v: 'Ateşleme sistemi veya tekleme' },
      { k: '36', v: 'Üretici tanımlı' },
    ]);
  });
  it('handles network codes and rejects junk', () => {
    expect(codeParts('U0100').map((p) => p.k)).toEqual(['U', '0', '100']);
    expect(codeParts('hello')).toEqual([]);
  });
});
