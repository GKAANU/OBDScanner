import { batteryCharge, batteryCrank, batteryRest, batteryVerdict, inspectionVerdict, usedCarCheck } from './health';
import { dtcDetail } from './dtc-details';

const mon = (ready: boolean[]) => ready.map((r, i) => ({ name: `M${i}`, supported: true, ready: r }));

describe('inspectionVerdict', () => {
  it('passes with MIL off and one monitor not ready', () => {
    const v = inspectionVerdict({ milOn: false, monitors: mon([true, true, false]), battery: 12.6 });
    expect(v.pass).toBe(true);
    expect(v.reasons[1].tone).toBe('warn');
  });
  it('fails with MIL on', () => {
    expect(inspectionVerdict({ milOn: true, monitors: mon([true]), battery: null }).pass).toBe(false);
  });
  it('fails with two monitors not ready', () => {
    const v = inspectionVerdict({ milOn: false, monitors: mon([false, false, true]), battery: null });
    expect(v.pass).toBe(false);
    expect(v.reasons[1].text).toBe('2 monitör hazır değil: M0, M1');
  });
});

describe('usedCarCheck', () => {
  it('flags recently cleared codes', () => {
    const r = usedCarCheck({
      milOn: false, stored: [], permanent: ['P0420'], kmSinceClear: 12, warmupsSinceClear: 2,
      monitors: mon([true, false, false]), odometer: null, userKm: 48612,
    });
    expect(r.flags).toBe(4);
    expect(r.rows.find((x) => x.title === 'Kodlar silindiğinden beri')?.value).toBe('12 km');
  });
  it('clean car has no flags', () => {
    const r = usedCarCheck({
      milOn: false, stored: [], permanent: [], kmSinceClear: 1240, warmupsSinceClear: 38,
      monitors: mon([true, true, true]), odometer: 48700, userKm: 48612,
    });
    expect(r.flags).toBe(0);
  });
});

describe('battery', () => {
  it('grades rest, crank and charge', () => {
    expect(batteryRest(12.6).tone).toBe('ok');
    expect(batteryRest(12.1).tone).toBe('warn');
    expect(batteryCrank(10.4).tone).toBe('ok');
    expect(batteryCrank(8.0).tone).toBe('error');
    expect(batteryCharge(14.1).label).toBe('Normal');
    expect(batteryCharge(12.4).label).toBe('Şarj yok');
    expect(batteryVerdict(12.6, 10.4, 14.1)).toEqual({ text: 'Akü ve şarj sistemi iyi', tone: 'ok' });
    expect(batteryVerdict(12.6, 10.4, 12.3).text).toBe('Şarj sistemi kontrol edilmeli');
  });
});

describe('dtcDetail', () => {
  it('known code has plain-language detail', () => {
    const d = dtcDetail('P0420');
    expect(d.title).toBe('Katalizör verimi düşük');
    expect(d.urgency).toBe('warn');
    expect(d.causes.length).toBeGreaterThan(2);
  });
  it('unknown misfire-range code falls back as urgent', () => {
    const d = dtcDetail('P0399');
    expect(d.known).toBe(false);
    expect(d.urgency).toBe('error');
  });
});
