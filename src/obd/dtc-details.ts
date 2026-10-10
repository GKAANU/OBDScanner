/**
 * Plain-language detail for a DTC: short title, explanation, urgency,
 * "can I keep driving?" and likely causes. Common codes are described by
 * hand; the rest fall back to their subsystem. Pure module.
 */
import type { Tone } from '../ui/theme';
import { describeDtc } from './dtc-descriptions';

export type Urgency = 'ok' | 'warn' | 'error';

export type DtcDetail = {
  code: string;
  title: string;
  long: string;
  urgency: Urgency;
  drive: string;
  causes: string[];
  /** False when generated from the subsystem fallback. */
  known: boolean;
};

export const URGENCY_LABEL: Record<Urgency, string> = { ok: 'Bilgi', warn: 'Dikkat', error: 'Acil' };
export const URGENCY_TONE: Record<Urgency, Tone> = { ok: 'ok', warn: 'warn', error: 'error' };

type Entry = Omit<DtcDetail, 'code' | 'known'>;

const MISFIRE: Entry = {
  title: 'Motor tekliyor',
  long: 'Bir veya daha fazla silindirde yanma düzgün olmuyor. Motor sarsılabilir, çekişi düşebilir.',
  urgency: 'error',
  drive: 'Kısa mesafe, sakin sür. Lamba yanıp sönüyorsa dur: yanmamış yakıt katalizöre zarar verir.',
  causes: ['Buji aşınmış veya arızalı', 'Ateşleme bobini arızalı', 'Enjektör tıkalı', 'Vakum kaçağı veya düşük kompresyon'],
};

const LEAN: Entry = {
  title: 'Karışım çok fakir',
  long: 'Motor ölçtüğünden fazla hava ya da az yakıt alıyor; ECU yakıt düzeltmesini sınıra kadar artırmış.',
  urgency: 'warn',
  drive: 'Evet, kısa vadede. Tüketim artabilir, motor tekleyebilir. Yakında kontrol ettir.',
  causes: ['Emme tarafında vakum kaçağı', 'Kirli veya arızalı MAF sensörü', 'Zayıf yakıt pompası / tıkalı filtre', 'Egzozda, O2 sensöründen önce kaçak'],
};

const RICH: Entry = {
  title: 'Karışım çok zengin',
  long: 'Motor gereğinden fazla yakıt alıyor; ECU yakıtı sınıra kadar azaltmış.',
  urgency: 'warn',
  drive: 'Evet, kısa vadede. Tüketim ve emisyon artar, katalizör zarar görebilir.',
  causes: ['Sızdıran enjektör', 'Arızalı MAF veya O2 sensörü', 'Yüksek yakıt basıncı', 'Tıkalı hava filtresi'],
};

const CAT: Entry = {
  title: 'Katalizör verimi düşük',
  long: 'Katalitik konvertör egzozu yeterince temizlemiyor. Arka oksijen sensörü, ön sensöre çok benzer sinyal görüyor.',
  urgency: 'warn',
  drive: 'Evet. Kısa vadede güvenli; yakıt tüketimi ve emisyon artabilir. Birkaç hafta içinde kontrol ettir.',
  causes: ['Katalizör yaşlanmış veya hasarlı', 'Arka oksijen sensörü arızalı', 'Katalizörden önce egzoz kaçağı', 'Uzun süre tekleme veya zengin karışım'],
};

const EVAP_LEAK: Entry = {
  title: 'Yakıt buharı kaçağı',
  long: 'Yakıt deposu buhar sisteminde kaçak algılandı. Çoğu zaman basit bir sebebi olur.',
  urgency: 'ok',
  drive: 'Evet. Sürüşü etkilemez; ama muayeneden kalabilirsin.',
  causes: ['Depo kapağı gevşek veya contası yıpranmış', 'Kanister hortumu çatlak', 'Tahliye (purge) valfi arızalı'],
};

const O2: Entry = {
  title: 'Oksijen sensörü sorunu',
  long: 'Egzozdaki oksijeni ölçen sensörün sinyali beklenen aralıkta değil veya ısıtıcısı çalışmıyor.',
  urgency: 'warn',
  drive: 'Evet. Tüketim artabilir; uzun süre bırakılırsa katalizör etkilenir.',
  causes: ['Sensör yaşlanmış', 'Kablo / soket hasarı', 'Isıtıcı devresi sigortası', 'Egzoz kaçağı'],
};

const MAF: Entry = {
  title: 'Hava akış sensörü (MAF) sorunu',
  long: 'Motora giren havayı ölçen sensörün sinyali mantıksız.',
  urgency: 'warn',
  drive: 'Evet, dikkatli. Motor güç kaybedebilir veya rölantide dalgalanabilir.',
  causes: ['Kirli MAF sensörü', 'Hava filtresi sonrası kaçak', 'Soket / kablo sorunu'],
};

const COOLANT: Entry = {
  title: 'Soğutma sıvısı sıcaklık sensörü',
  long: 'Motor sıcaklığını ölçen sensörün sinyali beklenen aralıkta değil.',
  urgency: 'warn',
  drive: 'Dikkatli sür ve göstergeden sıcaklığı izle. Fan düzgün çalışmayabilir.',
  causes: ['Sensör arızalı', 'Soket / kablo sorunu', 'Termostat'],
};

const THERMOSTAT: Entry = {
  title: 'Motor yeterince ısınmıyor',
  long: 'Soğutma sıvısı beklenen sürede çalışma sıcaklığına çıkmadı; genellikle termostat açık kalmıştır.',
  urgency: 'ok',
  drive: 'Evet. Tüketim artar, kalorifer zayıf ısıtır. Uygun bir zamanda termostatı değiştir.',
  causes: ['Termostat açık kalmış', 'Soğutma sıvısı sıcaklık sensörü'],
};

const OVERHEAT: Entry = {
  title: 'Motor aşırı ısınıyor',
  long: 'Motor sıcaklığı güvenli sınırı aştı.',
  urgency: 'error',
  drive: 'Hayır. Güvenli bir yerde dur, motoru kapat ve soğumasını bekle.',
  causes: ['Soğutma sıvısı eksik / kaçak', 'Fan çalışmıyor', 'Su pompası veya termostat arızası'],
};

const EGR: Entry = {
  title: 'EGR akış sorunu',
  long: 'Egzoz gazı geri dönüş sistemi beklenen akışı sağlamıyor.',
  urgency: 'warn',
  drive: 'Evet. Vuruntu veya güç kaybı olabilir; yakında kontrol ettir.',
  causes: ['EGR valfi kurumla tıkanmış', 'EGR kanalları tıkalı', 'Valf kontrol devresi'],
};

const CRANK_CAM: Entry = {
  title: 'Krank / eksantrik sensörü',
  long: 'Motor konumunu ölçen sensörlerin sinyali kayıp veya uyumsuz.',
  urgency: 'error',
  drive: 'Motor aniden stop edebilir. Uzun yola çıkma, en kısa sürede servise götür.',
  causes: ['Sensör arızalı', 'Kablo / soket hasarı', 'Triger kayışı/zinciri atlamış olabilir'],
};

const DPF: Entry = {
  title: 'Partikül filtresi (DPF) dolu',
  long: 'Dizel partikül filtresinde kurum birikmiş; rejenerasyon yapılamıyor.',
  urgency: 'warn',
  drive: 'Evet. 15-20 dakika otoyolda sabit hızla sür; temizlenmezse servise götür.',
  causes: ['Hep kısa mesafe kullanım', 'Fark basınç sensörü', 'EGR / enjektör sorunu'],
};

const LOW_BOOST: Entry = {
  title: 'Turbo basıncı düşük',
  long: 'Turbo beklenen basıncı üretemiyor.',
  urgency: 'warn',
  drive: 'Evet, zorlamadan. Güç düşük olur; yakında kontrol ettir.',
  causes: ['Turbo hortumunda kaçak', 'Wastegate / aktüatör sorunu', 'Turbo aşınması'],
};

const VOLTAGE: Entry = {
  title: 'Sistem voltajı sorunu',
  long: 'Araç elektrik sistemi voltajı beklenen aralıkta değil.',
  urgency: 'warn',
  drive: 'Evet, ama akü veya şarj sistemini yakında kontrol ettir. Otova Akü testini kullanabilirsin.',
  causes: ['Akü zayıf', 'Şarj dinamosu (alternatör) arızası', 'Kutup başı / şase bağlantısı'],
};

const COMM: Entry = {
  title: 'Modüller arası iletişim kaybı',
  long: 'Araçtaki kontrol modüllerinden biri ağdaki diğerleriyle konuşamıyor.',
  urgency: 'warn',
  drive: 'Duruma göre değişir. Uyarı lambaları yanıyorsa servise götür.',
  causes: ['Akü voltajı düşükken oluşan geçici kayıt', 'Soket / kablo sorunu', 'Modül arızası'],
};

const TABLE: Record<string, Entry> = {
  P0300: MISFIRE, P0301: MISFIRE, P0302: MISFIRE, P0303: MISFIRE, P0304: MISFIRE, P0305: MISFIRE, P0306: MISFIRE,
  P0171: LEAN, P0174: LEAN,
  P0172: RICH, P0175: RICH,
  P0420: CAT, P0430: CAT,
  P0442: EVAP_LEAK, P0455: EVAP_LEAK, P0456: EVAP_LEAK,
  P0130: O2, P0131: O2, P0132: O2, P0133: O2, P0134: O2, P0135: O2, P0136: O2, P0137: O2, P0138: O2, P0140: O2, P0141: O2,
  P0100: MAF, P0101: MAF, P0102: MAF, P0103: MAF,
  P0115: COOLANT, P0116: COOLANT, P0117: COOLANT, P0118: COOLANT,
  P0128: THERMOSTAT,
  P0217: OVERHEAT,
  P0400: EGR, P0401: EGR, P0402: EGR, P0403: EGR,
  P0335: CRANK_CAM, P0336: CRANK_CAM, P0340: CRANK_CAM, P0341: CRANK_CAM, P0016: CRANK_CAM,
  P2002: DPF, P2463: DPF,
  P0299: LOW_BOOST,
  P0562: VOLTAGE, P0563: VOLTAGE,
  U0001: COMM, U0073: COMM, U0100: COMM, U0101: COMM, U0121: COMM, U0140: COMM, U0155: COMM,
};

function fallbackUrgency(code: string): Urgency {
  if (/^P03/.test(code)) return 'error'; // ignition / misfire
  return 'warn';
}

export function dtcDetail(code: string): DtcDetail {
  const c = code.toUpperCase();
  const e = TABLE[c];
  if (e) return { code: c, ...e, long: `${e.long} (${describeDtc(c)})`, known: true };
  const urgency = fallbackUrgency(c);
  return {
    code: c,
    title: describeDtc(c),
    long: 'Bu kod için ayrıntılı açıklama yok. Kodu ve aşağıdaki değerleri kopyalayıp bir uzmana veya yapay zekâya sorabilirsin.',
    urgency,
    drive:
      urgency === 'error'
        ? 'Motor tekliyor veya lamba yanıp sönüyorsa dur. Değilse kısa mesafe, sakin sür ve servise götür.'
        : 'Genelde kısa vadede sürülebilir. Lamba yanıp sönüyorsa ya da araç farklı davranıyorsa dur.',
    causes: [],
    known: false,
  };
}
