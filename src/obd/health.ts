/**
 * Plain-language verdicts built from OBD readings. Pure functions.
 * They are guidance ("genel kural"), never a guarantee.
 */
import type { Tone } from '../ui/theme';
import { formatThousands } from '../utils/format';

export type Monitor = { name: string; supported: boolean; ready: boolean };

export type Reason = { text: string; tone: Tone; ok: boolean };

/* ---------- Muayeneye hazır mı? ---------- */

/**
 * Emission (OBD) part of the inspection, by the common EU rule: MIL off and
 * at most one supported monitor not ready.
 */
export function inspectionVerdict(input: {
  milOn: boolean;
  monitors: Monitor[];
  battery: number | null;
}): { pass: boolean; reasons: Reason[] } {
  const notReady = input.monitors.filter((m) => m.supported && !m.ready);
  const reasons: Reason[] = [];
  reasons.push(
    input.milOn
      ? { text: 'Arıza lambası (MIL) yanıyor', tone: 'error', ok: false }
      : { text: 'Arıza lambası (MIL) sönük', tone: 'ok', ok: true }
  );
  if (notReady.length === 0) reasons.push({ text: 'Tüm hazırlık monitörleri hazır', tone: 'ok', ok: true });
  else
    reasons.push({
      text: `${notReady.length} monitör hazır değil: ${notReady.map((m) => m.name).join(', ')}`,
      tone: notReady.length > 1 ? 'error' : 'warn',
      ok: notReady.length <= 1,
    });
  if (input.battery != null) {
    const ok = input.battery >= 12.2;
    reasons.push({ text: ok ? 'Akü voltajı normal' : 'Akü voltajı düşük', tone: ok ? 'ok' : 'warn', ok: true });
  }
  return { pass: !input.milOn && notReady.length <= 1, reasons };
}

/* ---------- İkinci el kontrolü ---------- */

export type UsedCarRow = { title: string; value: string; note: string; tone: Tone; flag: boolean };

/** Signs that codes were cleared shortly before a sale. */
export function usedCarCheck(input: {
  milOn: boolean;
  stored: string[];
  permanent: string[];
  /** PID 31, km since codes cleared. */
  kmSinceClear: number | null;
  /** PID 30, warm-ups since codes cleared. */
  warmupsSinceClear: number | null;
  monitors: Monitor[];
  /** PID A6 odometer when supported. */
  odometer: number | null;
  userKm: number | null;
}): { rows: UsedCarRow[]; flags: number } {
  const rows: UsedCarRow[] = [];
  rows.push(
    input.milOn
      ? { title: 'Arıza lambası (MIL)', value: 'Açık', note: `${input.stored.length} kayıtlı kod: ${input.stored.join(', ') || '—'}`, tone: 'warn', flag: true }
      : { title: 'Arıza lambası (MIL)', value: 'Kapalı', note: input.stored.length ? `${input.stored.length} kayıtlı kod var` : 'Kayıtlı kod yok', tone: input.stored.length ? 'warn' : 'ok', flag: input.stored.length > 0 }
  );
  rows.push(
    input.permanent.length
      ? { title: 'Kalıcı kod', value: `${input.permanent.length} kod`, note: `Silinse bile kalır; geçmişte arıza olduğunu gösterir: ${input.permanent.join(', ')}`, tone: 'warn', flag: true }
      : { title: 'Kalıcı kod', value: 'Yok', note: 'Geçmiş arıza izi yok', tone: 'ok', flag: false }
  );
  if (input.kmSinceClear != null) {
    const recent = input.kmSinceClear < 200;
    rows.push({
      title: 'Kodlar silindiğinden beri',
      value: `${formatThousands(input.kmSinceClear)} km`,
      note: recent ? 'Çok az mesafe: kodlar yakın zamanda silinmiş olabilir.' : 'Son silmeden bu yana yeterli mesafe yapılmış.',
      tone: recent ? 'warn' : 'ok',
      flag: recent,
    });
  }
  if (input.warmupsSinceClear != null) {
    const recent = input.warmupsSinceClear < 10;
    rows.push({
      title: 'Isınma döngüsü',
      value: String(input.warmupsSinceClear),
      note: recent
        ? `Son silmeden beri motor yalnızca ${input.warmupsSinceClear} kez ısındı.`
        : `Son silmeden beri motor ${input.warmupsSinceClear} kez ısındı.`,
      tone: recent ? 'warn' : 'ok',
      flag: recent,
    });
  }
  const supported = input.monitors.filter((m) => m.supported);
  if (supported.length) {
    const ready = supported.filter((m) => m.ready).length;
    const bad = supported.length - ready > 1;
    rows.push({
      title: 'Hazırlık monitörleri',
      value: `${ready}/${supported.length}`,
      note: 'Yeni silinmiş kodlarda çoğu monitör "hazır değil" görünür.',
      tone: bad ? 'warn' : 'ok',
      flag: bad,
    });
  }
  if (input.odometer != null && input.userKm != null) {
    const diff = Math.abs(input.odometer - input.userKm);
    const bad = diff > 1000;
    rows.push({
      title: 'Kilometre',
      value: `${formatThousands(input.odometer)} km`,
      note: bad ? `Gösterge / ilan kilometresinden ${formatThousands(diff)} km farklı.` : 'ECU kilometresi girilen kilometreyle uyumlu.',
      tone: bad ? 'warn' : 'ok',
      flag: bad,
    });
  } else {
    rows.push({
      title: 'Kilometre',
      value: input.userKm != null ? `${formatThousands(input.userKm)} km` : '—',
      note: 'Bu araç ECU kilometresini OBD üzerinden vermiyor; servis kayıtlarıyla karşılaştır.',
      tone: 'neutral',
      flag: false,
    });
  }
  return { rows, flags: rows.filter((r) => r.flag).length };
}

/* ---------- Akü testi ---------- */

export type BatteryReading = { value: number | null; tone: Tone; label: string };

export function batteryRest(v: number | null): BatteryReading {
  if (v == null) return { value: null, tone: 'neutral', label: '—' };
  if (v >= 12.4) return { value: v, tone: 'ok', label: 'İyi' };
  if (v >= 12.0) return { value: v, tone: 'warn', label: 'Zayıf' };
  return { value: v, tone: 'error', label: 'Düşük' };
}

export function batteryCrank(minV: number | null): BatteryReading {
  if (minV == null) return { value: null, tone: 'neutral', label: '—' };
  if (minV >= 9.6) return { value: minV, tone: 'ok', label: 'İyi' };
  if (minV >= 8.5) return { value: minV, tone: 'warn', label: 'Zayıf' };
  return { value: minV, tone: 'error', label: 'Yetersiz' };
}

/** Smart alternators may idle at ~12.8-13.2 V; 13.2-14.8 is normal charging. */
export function batteryCharge(v: number | null): BatteryReading {
  if (v == null) return { value: null, tone: 'neutral', label: '—' };
  if (v > 14.8) return { value: v, tone: 'error', label: 'Aşırı şarj' };
  if (v >= 13.2) return { value: v, tone: 'ok', label: 'Normal' };
  if (v >= 12.7) return { value: v, tone: 'warn', label: 'Düşük' };
  return { value: v, tone: 'error', label: 'Şarj yok' };
}

export function batteryVerdict(rest: number | null, crank: number | null, charge: number | null): { text: string; tone: Tone } {
  const r = [batteryRest(rest), batteryCrank(crank), batteryCharge(charge)].filter((x) => x.value != null);
  if (r.length === 0) return { text: 'Ölçüm yok', tone: 'neutral' };
  if (r.some((x) => x.tone === 'error')) {
    if (batteryCharge(charge).tone === 'error') return { text: 'Şarj sistemi kontrol edilmeli', tone: 'error' };
    return { text: 'Akü zayıf', tone: 'error' };
  }
  if (r.some((x) => x.tone === 'warn')) return { text: 'Akü takip edilmeli', tone: 'warn' };
  return { text: charge != null ? 'Akü ve şarj sistemi iyi' : 'Akü iyi', tone: 'ok' };
}
