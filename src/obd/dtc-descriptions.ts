/**
 * Turkish descriptions for common generic (SAE J2012) DTCs, plus a
 * subsystem fallback for codes not in the table. Pure module.
 *
 * Only generic codes (second char 0, or P2/P3 ranges that are generic) are
 * described exactly. Manufacturer-specific codes (P1xxx, B1xxx, C1xxx,
 * U1xxx ...) get "Üreticiye özel kod" plus their subsystem.
 */

const GENERIC: Record<string, string> = {
  // Fuel and air metering
  P0010: 'Eksantrik mili konum aktüatörü devresi (Sıra 1)',
  P0011: 'Eksantrik mili zamanlaması aşırı avanslı (Sıra 1)',
  P0016: 'Krank ve eksantrik mili konum korelasyonu (Sıra 1, sensör A)',
  P0030: 'O2 sensörü ısıtıcı kontrol devresi (Sıra 1, sensör 1)',
  P0087: 'Yakıt rayı / sistem basıncı çok düşük',
  P0088: 'Yakıt rayı / sistem basıncı çok yüksek',
  P0100: 'Hava kütle akış (MAF) devresi arızası',
  P0101: 'Hava kütle akış (MAF) devresi aralık / performans sorunu',
  P0102: 'Hava kütle akış (MAF) devresi düşük giriş',
  P0103: 'Hava kütle akış (MAF) devresi yüksek giriş',
  P0106: 'Emme manifold basıncı (MAP) devresi aralık / performans sorunu',
  P0107: 'Emme manifold basıncı (MAP) devresi düşük giriş',
  P0108: 'Emme manifold basıncı (MAP) devresi yüksek giriş',
  P0110: 'Emme havası sıcaklık sensörü devresi arızası',
  P0112: 'Emme havası sıcaklık sensörü devresi düşük giriş',
  P0113: 'Emme havası sıcaklık sensörü devresi yüksek giriş',
  P0115: 'Motor soğutma sıvısı sıcaklık devresi arızası',
  P0116: 'Motor soğutma sıvısı sıcaklık devresi aralık / performans sorunu',
  P0117: 'Motor soğutma sıvısı sıcaklık devresi düşük giriş',
  P0118: 'Motor soğutma sıvısı sıcaklık devresi yüksek giriş',
  P0120: 'Gaz kelebeği / pedal konum sensörü A devresi arızası',
  P0121: 'Gaz kelebeği / pedal konum sensörü A aralık / performans sorunu',
  P0122: 'Gaz kelebeği / pedal konum sensörü A devresi düşük giriş',
  P0123: 'Gaz kelebeği / pedal konum sensörü A devresi yüksek giriş',
  P0125: 'Kapalı döngü yakıt kontrolü için soğutma sıvısı sıcaklığı yetersiz',
  P0128: 'Termostat: soğutma sıvısı sıcaklığı termostat değerinin altında',
  P0130: 'O2 sensörü devresi arızası (Sıra 1, sensör 1)',
  P0131: 'O2 sensörü devresi düşük voltaj (Sıra 1, sensör 1)',
  P0132: 'O2 sensörü devresi yüksek voltaj (Sıra 1, sensör 1)',
  P0133: 'O2 sensörü devresi yavaş tepki (Sıra 1, sensör 1)',
  P0134: 'O2 sensörü devresinde aktivite yok (Sıra 1, sensör 1)',
  P0135: 'O2 sensörü ısıtıcı devresi arızası (Sıra 1, sensör 1)',
  P0136: 'O2 sensörü devresi arızası (Sıra 1, sensör 2)',
  P0137: 'O2 sensörü devresi düşük voltaj (Sıra 1, sensör 2)',
  P0138: 'O2 sensörü devresi yüksek voltaj (Sıra 1, sensör 2)',
  P0140: 'O2 sensörü devresinde aktivite yok (Sıra 1, sensör 2)',
  P0141: 'O2 sensörü ısıtıcı devresi arızası (Sıra 1, sensör 2)',
  P0143: 'O2 sensörü devresi düşük voltaj (Sıra 1, sensör 3)',
  P0171: 'Yakıt sistemi çok fakir karışım (Sıra 1)',
  P0172: 'Yakıt sistemi çok zengin karışım (Sıra 1)',
  P0174: 'Yakıt sistemi çok fakir karışım (Sıra 2)',
  P0175: 'Yakıt sistemi çok zengin karışım (Sıra 2)',
  P0190: 'Yakıt rayı basınç sensörü devresi arızası',
  P0191: 'Yakıt rayı basınç sensörü aralık / performans sorunu',
  P0201: 'Enjektör devresi arızası (Silindir 1)',
  P0202: 'Enjektör devresi arızası (Silindir 2)',
  P0203: 'Enjektör devresi arızası (Silindir 3)',
  P0204: 'Enjektör devresi arızası (Silindir 4)',
  P0217: 'Motor aşırı ısınma durumu',
  P0219: 'Motor aşırı devir durumu',
  P0234: 'Turbo / süperşarj aşırı basınç durumu',
  P0299: 'Turbo / süperşarj düşük basınç',
  // Ignition / misfire
  P0300: 'Rastgele / çoklu silindir ateşleme hatası algılandı',
  P0301: 'Silindir 1 ateşleme hatası algılandı',
  P0302: 'Silindir 2 ateşleme hatası algılandı',
  P0303: 'Silindir 3 ateşleme hatası algılandı',
  P0304: 'Silindir 4 ateşleme hatası algılandı',
  P0305: 'Silindir 5 ateşleme hatası algılandı',
  P0306: 'Silindir 6 ateşleme hatası algılandı',
  P0325: 'Vuruntu sensörü 1 devresi arızası (Sıra 1)',
  P0335: 'Krank mili konum sensörü A devresi arızası',
  P0336: 'Krank mili konum sensörü A aralık / performans sorunu',
  P0340: 'Eksantrik mili konum sensörü A devresi arızası (Sıra 1)',
  P0341: 'Eksantrik mili konum sensörü A aralık / performans sorunu (Sıra 1)',
  P0351: 'Ateşleme bobini A birincil / ikincil devre arızası',
  P0352: 'Ateşleme bobini B birincil / ikincil devre arızası',
  P0380: 'Kızdırma bujisi / ısıtıcı devresi A arızası',
  // Emission controls
  P0400: 'Egzoz gazı resirkülasyonu (EGR) akış arızası',
  P0401: 'Egzoz gazı resirkülasyonu (EGR) akışı yetersiz',
  P0402: 'Egzoz gazı resirkülasyonu (EGR) akışı aşırı',
  P0403: 'Egzoz gazı resirkülasyonu (EGR) kontrol devresi arızası',
  P0410: 'İkincil hava enjeksiyon sistemi arızası',
  P0420: 'Katalizör sistemi verimliliği eşiğin altında (Sıra 1)',
  P0421: 'Isınma katalizörü verimliliği eşiğin altında (Sıra 1)',
  P0430: 'Katalizör sistemi verimliliği eşiğin altında (Sıra 2)',
  P0440: 'Buharlaşma emisyon (EVAP) sistemi arızası',
  P0441: 'Buharlaşma emisyon (EVAP) sistemi hatalı tahliye akışı',
  P0442: 'Buharlaşma emisyon (EVAP) sistemi küçük kaçak algılandı',
  P0443: 'Buharlaşma emisyon (EVAP) tahliye valfi devresi arızası',
  P0446: 'Buharlaşma emisyon (EVAP) havalandırma kontrol devresi arızası',
  P0455: 'Buharlaşma emisyon (EVAP) sistemi büyük kaçak algılandı',
  P0456: 'Buharlaşma emisyon (EVAP) sistemi çok küçük kaçak algılandı',
  P0480: 'Soğutma fanı 1 kontrol devresi arızası',
  // Speed / idle control
  P0500: 'Araç hız sensörü A arızası',
  P0505: 'Rölanti kontrol sistemi arızası',
  P0506: 'Rölanti kontrol sistemi: devir beklenenden düşük',
  P0507: 'Rölanti kontrol sistemi: devir beklenenden yüksek',
  P0520: 'Motor yağ basıncı sensörü / anahtarı devresi arızası',
  P0562: 'Sistem voltajı düşük',
  P0563: 'Sistem voltajı yüksek',
  // Computer / output circuits
  P0600: 'Seri iletişim bağlantısı arızası',
  P0601: 'Kontrol modülü dahili bellek sağlama toplamı hatası',
  P0603: 'Kontrol modülü dahili KAM hatası',
  P0606: 'Kontrol modülü işlemci arızası',
  P0620: 'Şarj dinamosu kontrol devresi arızası',
  P0650: 'Arıza gösterge lambası (MIL) kontrol devresi arızası',
  P0670: 'Kızdırma bujisi kontrol modülü devresi arızası',
  // Transmission
  P0700: 'Şanzıman kontrol sistemi arızası (şanzıman modülünde kod var)',
  P0705: 'Vites konum sensörü devresi arızası (PRNDL girişi)',
  P0715: 'Türbin / giriş mili hız sensörü A devresi arızası',
  P0720: 'Çıkış mili hız sensörü devresi arızası',
  P0730: 'Hatalı vites oranı',
  P0740: 'Tork konvertörü kilitleme kavrama devresi arızası',
  P0750: 'Vites solenoidi A arızası',
  // Diesel / newer generic ranges
  P2002: 'Dizel partikül filtresi (DPF) verimliliği eşiğin altında (Sıra 1)',
  P2135: 'Gaz kelebeği / pedal konum sensörü A/B voltaj korelasyonu',
  P2463: 'Dizel partikül filtresi (DPF) kurum birikimi',
  // Network
  U0001: 'Yüksek hızlı CAN iletişim veri yolu arızası',
  U0073: 'Kontrol modülü iletişim veri yolu A kapalı',
  U0100: 'Motor kontrol modülü (ECM/PCM) ile iletişim kaybı',
  U0101: 'Şanzıman kontrol modülü (TCM) ile iletişim kaybı',
  U0121: 'ABS kontrol modülü ile iletişim kaybı',
  U0140: 'Gövde kontrol modülü (BCM) ile iletişim kaybı',
  U0155: 'Gösterge paneli modülü ile iletişim kaybı',
};

/** Subsystem from the third character (P0xxx/P2xxx generic layout). */
const P_SUBSYSTEM: Record<string, string> = {
  '0': 'Yakıt, hava ölçümü ve emisyon',
  '1': 'Yakıt ve hava ölçümü',
  '2': 'Yakıt ve hava ölçümü (enjektör devresi)',
  '3': 'Ateşleme sistemi veya tekleme',
  '4': 'Yardımcı emisyon kontrolü',
  '5': 'Hız, rölanti kontrolü ve yardımcı girişler',
  '6': 'Kontrol modülü ve çıkış devreleri',
  '7': 'Şanzıman',
  '8': 'Şanzıman',
  '9': 'Şanzıman',
  A: 'Hibrit tahrik sistemi',
  B: 'Hibrit tahrik sistemi',
  C: 'Hibrit tahrik sistemi',
};

const FAMILY: Record<string, string> = {
  P: 'Motor ve aktarma',
  C: 'Şasi (fren, direksiyon, süspansiyon)',
  B: 'Gövde (hava yastığı, klima, aydınlatma)',
  U: 'Ağ iletişimi',
};

/** True when the code's second char marks it manufacturer-specific. */
function isManufacturerSpecific(code: string): boolean {
  const fam = code[0];
  const d2 = code[1];
  if (fam === 'P') return d2 === '1' || d2 === '3';
  return d2 === '1' || d2 === '2';
}

/** Exact description for a known generic code, else null. */
export function dtcDescription(code: string): string | null {
  return GENERIC[code.toUpperCase()] ?? null;
}

/**
 * Always returns a Turkish line: the exact description when known, else the
 * subsystem ("Ateşleme sistemi veya tekleme · genel kod").
 */
export function describeDtc(code: string): string {
  const c = code.toUpperCase();
  const exact = GENERIC[c];
  if (exact) return exact;
  if (!/^[PCBU][0-3][0-9A-F]{3}$/.test(c)) return 'Bilinmeyen kod biçimi';
  const fam = c[0];
  const area = fam === 'P' ? P_SUBSYSTEM[c[2]] ?? FAMILY.P : FAMILY[fam];
  return isManufacturerSpecific(c) ? `${area} · üreticiye özel kod` : `${area} · genel kod`;
}
