/**
 * Plain-language detail for a DTC: short title, explanation, urgency,
 * "can I keep driving?" and likely causes. Common codes are described by
 * hand; the rest fall back to their subsystem. Pure module.
 */
import type { Tone } from '../ui/theme';
import { describeDtc, dtcSubsystem, isManufacturerSpecific } from './dtc-descriptions';

export type Urgency = 'ok' | 'warn' | 'error';

export type DtcDetail = {
  code: string;
  title: string;
  long: string;
  urgency: Urgency;
  drive: string;
  /** Likely causes, most likely first. */
  causes: string[];
  /** Short verdict for "can I keep driving?": "Evet." / "Dikkatli." / "Hayır, dur." */
  answer: string;
  /** Subsystem line under the title. */
  sys: string;
  /** What to do, cheap/easy first. `urgent` marks safety steps. */
  steps: DtcStep[];
  /** False when generated from the subsystem fallback. */
  known: boolean;
};

export type DtcStep = { t: string; m: string; urgent?: boolean };

/** One character group of a code, explained ("P" = Motor ve aktarma...). */
export type CodePart = { k: string; v: string };

export const URGENCY_LABEL: Record<Urgency, string> = { ok: 'Bilgi', warn: 'Dikkat', error: 'Acil' };
export const URGENCY_TONE: Record<Urgency, Tone> = { ok: 'ok', warn: 'warn', error: 'error' };

type Entry = Omit<DtcDetail, 'code' | 'known'>;

const MISFIRE: Entry = {
  title: 'Motor tekliyor',
  long: 'Bir veya daha fazla silindirde yanma düzgün olmuyor. Motor sarsılabilir, çekişi düşebilir.',
  urgency: 'error',
  drive: 'Kısa mesafe, sakin sür. Lamba yanıp sönüyorsa dur: yanmamış yakıt katalizöre zarar verir.',
  causes: ['Buji aşınmış veya arızalı', 'Ateşleme bobini arızalı', 'Enjektör tıkalı', 'Vakum kaçağı veya düşük kompresyon'],
  answer: 'Dikkatli.',
  sys: 'Ateşleme ve yanma',
  steps: [
    { t: 'Lamba yanıp sönüyorsa sürme; güvenli bir yerde dur.', m: 'Hemen', urgent: true },
    { t: 'Hangi silindirde olduğunu kod numarasından not al (P0301 = 1. silindir).', m: 'Ücretsiz' },
    { t: 'Bujileri ve ateşleme bobinlerini kontrol ettir; bobin yer değiştirme testi yaptır.', m: 'Usta · 20 dk' },
    { t: 'Enjektör ve kompresyon ölçümü yaptır.', m: 'Usta · ölçüm' },
  ],
};

const LEAN: Entry = {
  title: 'Karışım çok fakir',
  long: 'Motor ölçtüğünden fazla hava ya da az yakıt alıyor; ECU yakıt düzeltmesini sınıra kadar artırmış.',
  urgency: 'warn',
  drive: 'Evet, kısa vadede. Tüketim artabilir, motor tekleyebilir. Yakında kontrol ettir.',
  causes: ['Emme tarafında vakum kaçağı', 'Kirli veya arızalı MAF sensörü', 'Zayıf yakıt pompası / tıkalı filtre', 'Egzozda, O2 sensöründen önce kaçak'],
  answer: 'Dikkatli.',
  sys: 'Yakıt ve hava ölçümü',
  steps: [
    { t: 'Hava filtresi kutusu ve hortumlar yerinde mi bak.', m: 'Ücretsiz · 5 dk' },
    { t: 'Motor çalışırken tıslama sesi dinle; kaçağı ele verir.', m: 'Ücretsiz · 2 dk' },
    { t: 'MAF sensörünü özel spreyle temizlet.', m: 'Usta · 15 dk' },
    { t: 'Yakıt basıncını ölçtür.', m: 'Usta · ölçüm' },
    { t: 'Geçmezse duman testiyle kaçak aranır.', m: 'Usta · ileri tanı' },
  ],
};

const RICH: Entry = {
  title: 'Karışım çok zengin',
  long: 'Motor gereğinden fazla yakıt alıyor; ECU yakıtı sınıra kadar azaltmış.',
  urgency: 'warn',
  drive: 'Evet, kısa vadede. Tüketim ve emisyon artar, katalizör zarar görebilir.',
  causes: ['Sızdıran enjektör', 'Arızalı MAF veya O2 sensörü', 'Yüksek yakıt basıncı', 'Tıkalı hava filtresi'],
  answer: 'Dikkatli.',
  sys: 'Yakıt ve hava ölçümü',
  steps: [
    { t: 'Hava filtresini kontrol et, kirliyse değiştir.', m: 'Ücretsiz · 5 dk' },
    { t: 'MAF sensörünü temizlet.', m: 'Usta · 15 dk' },
    { t: 'Yakıt basıncı ve enjektör sızıntı testi yaptır.', m: 'Usta · ölçüm' },
    { t: 'Oksijen sensörü sinyalini ölçtür.', m: 'Usta · ölçüm' },
  ],
};

const CAT: Entry = {
  title: 'Katalizör verimi düşük',
  long: 'Katalitik konvertör egzozu yeterince temizlemiyor. Arka oksijen sensörü, ön sensöre çok benzer sinyal görüyor.',
  urgency: 'warn',
  drive: 'Evet. Kısa vadede güvenli; yakıt tüketimi ve emisyon artabilir. Birkaç hafta içinde kontrol ettir.',
  causes: ['Katalizör yaşlanmış veya hasarlı', 'Arka oksijen sensörü arızalı', 'Katalizörden önce egzoz kaçağı', 'Uzun süre tekleme veya zengin karışım'],
  answer: 'Evet.',
  sys: 'Egzoz ve emisyon',
  steps: [
    { t: 'Egzozda katalizörden önce kaçak sesi var mı dinle.', m: 'Ücretsiz · 2 dk' },
    { t: 'Tekleme veya zengin karışım kodu varsa önce onları çözdür.', m: 'Usta' },
    { t: 'Arka oksijen sensörünü ölçtür.', m: 'Usta · ölçüm' },
    { t: 'Geçmezse katalizör kontrolü ve değişimi.', m: 'Usta · ileri tanı' },
  ],
};

const EVAP_LEAK: Entry = {
  title: 'Yakıt buharı kaçağı',
  long: 'Yakıt deposu buhar sisteminde kaçak algılandı. Çoğu zaman basit bir sebebi olur.',
  urgency: 'ok',
  drive: 'Evet. Sürüşü etkilemez; ama muayeneden kalabilirsin.',
  causes: ['Depo kapağı gevşek veya contası yıpranmış', 'Kanister hortumu çatlak', 'Tahliye (purge) valfi arızalı'],
  answer: 'Evet.',
  sys: 'Yakıt buharı (EVAP)',
  steps: [
    { t: 'Depo kapağını çıkar, klik sesi gelene kadar çevirerek tak.', m: 'Ücretsiz · 1 dk' },
    { t: 'Kapak contası çatlaksa kapağı değiştir.', m: 'Yedek parça' },
    { t: 'Birkaç gün normal sür; araç sistemi yeniden test eder.', m: 'Ücretsiz' },
    { t: 'Geçmezse duman testi yaptır.', m: 'Usta · ileri tanı' },
  ],
};

const O2: Entry = {
  title: 'Oksijen sensörü sorunu',
  long: 'Egzozdaki oksijeni ölçen sensörün sinyali beklenen aralıkta değil veya ısıtıcısı çalışmıyor.',
  urgency: 'warn',
  drive: 'Evet. Tüketim artabilir; uzun süre bırakılırsa katalizör etkilenir.',
  causes: ['Sensör yaşlanmış', 'Kablo / soket hasarı', 'Isıtıcı devresi sigortası', 'Egzoz kaçağı'],
  answer: 'Evet.',
  sys: 'Egzoz ve emisyon',
  steps: [
    { t: 'Sensör soketi ve kablosunda erime veya kopukluk var mı baktır.', m: 'Ücretsiz · 10 dk' },
    { t: 'Isıtıcı sigortasını kontrol et.', m: 'Ücretsiz · 5 dk' },
    { t: 'Sensörü ölçtür, gerekirse değiştir.', m: 'Usta · ölçüm' },
  ],
};

const MAF: Entry = {
  title: 'Hava akış sensörü (MAF) sorunu',
  long: 'Motora giren havayı ölçen sensörün sinyali mantıksız.',
  urgency: 'warn',
  drive: 'Evet, dikkatli. Motor güç kaybedebilir veya rölantide dalgalanabilir.',
  causes: ['Kirli MAF sensörü', 'Hava filtresi sonrası kaçak', 'Soket / kablo sorunu'],
  answer: 'Dikkatli.',
  sys: 'Yakıt ve hava ölçümü',
  steps: [
    { t: 'Hava filtresi ve filtre sonrası hortumu kontrol et.', m: 'Ücretsiz · 5 dk' },
    { t: 'MAF soketini çıkarıp tak, oksitlenme var mı bak.', m: 'Ücretsiz · 5 dk' },
    { t: 'Sensörü özel spreyle temizlet.', m: 'Usta · 15 dk' },
    { t: 'Geçmezse sensörü değiştir.', m: 'Usta · parça' },
  ],
};

const COOLANT: Entry = {
  title: 'Soğutma sıvısı sıcaklık sensörü',
  long: 'Motor sıcaklığını ölçen sensörün sinyali beklenen aralıkta değil.',
  urgency: 'warn',
  drive: 'Dikkatli sür ve göstergeden sıcaklığı izle. Fan düzgün çalışmayabilir.',
  causes: ['Sensör arızalı', 'Soket / kablo sorunu', 'Termostat'],
  answer: 'Dikkatli.',
  sys: 'Soğutma sistemi',
  steps: [
    { t: 'Göstergeden motor sıcaklığını izle; yükseliyorsa dur.', m: 'Hemen', urgent: true },
    { t: 'Soğutma sıvısı seviyesini motor soğukken kontrol et.', m: 'Ücretsiz · 2 dk' },
    { t: 'Sensör soketini kontrol ettir, sensörü ölçtür.', m: 'Usta · ölçüm' },
    { t: 'Termostatı kontrol ettir.', m: 'Usta' },
  ],
};

const THERMOSTAT: Entry = {
  title: 'Motor yeterince ısınmıyor',
  long: 'Soğutma sıvısı beklenen sürede çalışma sıcaklığına çıkmadı; genellikle termostat açık kalmıştır.',
  urgency: 'ok',
  drive: 'Evet. Tüketim artar, kalorifer zayıf ısıtır. Uygun bir zamanda termostatı değiştir.',
  causes: ['Termostat açık kalmış', 'Soğutma sıvısı sıcaklık sensörü'],
  answer: 'Evet.',
  sys: 'Soğutma sistemi',
  steps: [
    { t: "Motor ısındıktan sonra sıcaklık 85-95°C'ye çıkıyor mu, Canlı'dan izle.", m: 'Ücretsiz' },
    { t: 'Soğutma sıvısı seviyesini kontrol et.', m: 'Ücretsiz · 2 dk' },
    { t: 'Termostatı değiştir.', m: 'Usta · parça' },
  ],
};

const OVERHEAT: Entry = {
  title: 'Motor aşırı ısınıyor',
  long: 'Motor sıcaklığı güvenli sınırı aştı.',
  urgency: 'error',
  drive: 'Hayır. Güvenli bir yerde dur, motoru kapat ve soğumasını bekle.',
  causes: ['Soğutma sıvısı eksik / kaçak', 'Fan çalışmıyor', 'Su pompası veya termostat arızası'],
  answer: 'Hayır, dur.',
  sys: 'Soğutma sistemi',
  steps: [
    { t: 'Güvenli bir yerde dur, motoru kapat.', m: 'Hemen', urgent: true },
    { t: 'Motor soğumadan radyatör kapağını açma.', m: 'Hemen', urgent: true },
    { t: 'Soğuyunca sıvı seviyesine ve kaçağa bak.', m: 'Ücretsiz · 5 dk' },
    { t: 'Fan, su pompası ve termostatı kontrol ettir.', m: 'Usta' },
  ],
};

const EGR: Entry = {
  title: 'EGR akış sorunu',
  long: 'Egzoz gazı geri dönüş sistemi beklenen akışı sağlamıyor.',
  urgency: 'warn',
  drive: 'Evet. Vuruntu veya güç kaybı olabilir; yakında kontrol ettir.',
  causes: ['EGR valfi kurumla tıkanmış', 'EGR kanalları tıkalı', 'Valf kontrol devresi'],
  answer: 'Dikkatli.',
  sys: 'Egzoz ve emisyon',
  steps: [
    { t: 'Çekiş kaybı veya rölanti dalgalanması not al.', m: 'Ücretsiz' },
    { t: 'EGR valfini temizlet.', m: 'Usta · 1 saat' },
    { t: 'Valf kontrol devresini ve kanalları kontrol ettir.', m: 'Usta · ileri tanı' },
  ],
};

const CRANK_CAM: Entry = {
  title: 'Krank / eksantrik sensörü',
  long: 'Motor konumunu ölçen sensörlerin sinyali kayıp veya uyumsuz.',
  urgency: 'error',
  drive: 'Motor aniden stop edebilir. Uzun yola çıkma, en kısa sürede servise götür.',
  causes: ['Sensör arızalı', 'Kablo / soket hasarı', 'Triger kayışı/zinciri atlamış olabilir'],
  answer: 'Hayır, dur.',
  sys: 'Motor · ateşleme zamanlaması',
  steps: [
    { t: 'Uzun yola çıkma; motor yolda durabilir.', m: 'Hemen', urgent: true },
    { t: 'Sensör soketi takılı mı, yağlı mı baktır.', m: 'Ücretsiz · 5 dk' },
    { t: 'Sensör kablosunda sürtünme veya kopukluk arat.', m: 'Ücretsiz · 10 dk' },
    { t: 'Sensörü ölçtür, gerekirse değiştir.', m: 'Usta · ölçüm' },
    { t: 'Geçmezse triger ayarı kontrol edilir.', m: 'Usta · ileri tanı' },
  ],
};

const DPF: Entry = {
  title: 'Partikül filtresi (DPF) dolu',
  long: 'Dizel partikül filtresinde kurum birikmiş; rejenerasyon yapılamıyor.',
  urgency: 'warn',
  drive: 'Evet. 15-20 dakika otoyolda sabit hızla sür; temizlenmezse servise götür.',
  causes: ['Hep kısa mesafe kullanım', 'Fark basınç sensörü', 'EGR / enjektör sorunu'],
  answer: 'Dikkatli.',
  sys: 'Dizel partikül filtresi',
  steps: [
    { t: '15-20 dakika otoyolda sabit hızla sür.', m: 'Ücretsiz · 20 dk' },
    { t: 'Lamba sönmezse servis rejenerasyonu yaptır.', m: 'Usta · 1 saat' },
    { t: 'Fark basınç sensörünü ve hortumlarını kontrol ettir.', m: 'Usta · ölçüm' },
  ],
};

const LOW_BOOST: Entry = {
  title: 'Turbo basıncı düşük',
  long: 'Turbo beklenen basıncı üretemiyor.',
  urgency: 'warn',
  drive: 'Evet, zorlamadan. Güç düşük olur; yakında kontrol ettir.',
  causes: ['Turbo hortumunda kaçak', 'Wastegate / aktüatör sorunu', 'Turbo aşınması'],
  answer: 'Dikkatli.',
  sys: 'Turbo ve emme',
  steps: [
    { t: 'Motor çalışırken turbo hortumlarında tıslama dinle.', m: 'Ücretsiz · 2 dk' },
    { t: 'Turbo hortum ve kelepçelerini kontrol ettir.', m: 'Usta · 15 dk' },
    { t: 'Wastegate ve aktüatörü kontrol ettir.', m: 'Usta · ölçüm' },
  ],
};

const VOLTAGE: Entry = {
  title: 'Sistem voltajı sorunu',
  long: 'Araç elektrik sistemi voltajı beklenen aralıkta değil.',
  urgency: 'warn',
  drive: 'Evet, ama akü veya şarj sistemini yakında kontrol ettir. Otova Akü testini kullanabilirsin.',
  causes: ['Akü zayıf', 'Şarj dinamosu (alternatör) arızası', 'Kutup başı / şase bağlantısı'],
  answer: 'Evet.',
  sys: 'Elektrik ve şarj',
  steps: [
    { t: 'Otova Akü testini çalıştır.', m: 'Ücretsiz · 1 dk' },
    { t: 'Akü kutup başlarını temizle ve sık.', m: 'Ücretsiz · 10 dk' },
    { t: 'Şarj dinamosunu ölçtür.', m: 'Usta · ölçüm' },
  ],
};

const COMM: Entry = {
  title: 'Modüller arası iletişim kaybı',
  long: 'Araçtaki kontrol modüllerinden biri ağdaki diğerleriyle konuşamıyor.',
  urgency: 'warn',
  drive: 'Duruma göre değişir. Uyarı lambaları yanıyorsa servise götür.',
  causes: ['Akü voltajı düşükken oluşan geçici kayıt', 'Soket / kablo sorunu', 'Modül arızası'],
  answer: 'Dikkatli.',
  sys: 'Ağ iletişimi',
  steps: [
    { t: 'Akü voltajını kontrol et; düşükse önce aküyü şarj et.', m: 'Ücretsiz' },
    { t: 'Kodları silip birkaç sürüş izle; geri gelmezse geçici kayıttır.', m: 'Ücretsiz' },
    { t: 'Geri gelirse modül soket ve kablolarını kontrol ettir.', m: 'Usta · ileri tanı' },
  ],
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
  const maker = isManufacturerSpecific(c);
  const sys = dtcSubsystem(c);
  return {
    code: c,
    title: maker ? 'Üreticiye özel kod' : describeDtc(c),
    long: maker
      ? 'Bu kod aracın markasına özel ve veri tabanımızda karşılığı yok. Kodun yapısından yalnızca hangi sistemle ilgili olduğu anlaşılıyor. Kesin anlamı marka cihazıyla okunur.'
      : 'Bu kod için ayrıntılı açıklama yok. Kodu ve aşağıdaki değerleri kopyalayıp bir uzmana veya yapay zekâya sorabilirsin.',
    urgency,
    answer: 'Dikkatli.',
    sys: maker ? `Alt sistem: ${sys.toLocaleLowerCase('tr-TR')}` : sys,
    steps: [
      { t: 'Lamba yanıp sönüyor mu bak; sönüyorsa sürme.', m: 'Hemen', urgent: true },
      { t: 'Tekleme, sarsıntı, güç kaybı var mı not al.', m: 'Ücretsiz' },
      { t: maker ? 'Ustaya göster, marka cihazıyla okut.' : 'Ustaya göster, kodu ve donma verisini birlikte paylaş.', m: maker ? 'Usta · marka cihazı' : 'Usta' },
    ],
    drive:
      urgency === 'error'
        ? 'Motor tekliyor veya lamba yanıp sönüyorsa dur. Değilse kısa mesafe, sakin sür ve servise götür.'
        : 'Genelde kısa vadede sürülebilir. Lamba yanıp sönüyorsa ya da araç farklı davranıyorsa dur.',
    causes: [],
    known: false,
  };
}

/** Explain a code's structure: family, generic/manufacturer, subsystem, number. */
export function codeParts(code: string): CodePart[] {
  const c = code.toUpperCase();
  if (!/^[PCBU][0-3][0-9A-F]{3}$/.test(c)) return [];
  const fam: Record<string, string> = { P: 'Motor ve şanzıman', C: 'Şasi', B: 'Gövde', U: 'Ağ iletişimi' };
  const parts: CodePart[] = [
    { k: c[0], v: fam[c[0]] },
    { k: c[1], v: isManufacturerSpecific(c) ? 'Üreticiye özel' : 'Genel kod' },
  ];
  if (c[0] === 'P') parts.push({ k: c[2], v: dtcSubsystem(c) });
  parts.push({ k: c[0] === 'P' ? c.slice(3) : c.slice(2), v: isManufacturerSpecific(c) ? 'Üretici tanımlı' : 'Arıza numarası' });
  return parts;
}
