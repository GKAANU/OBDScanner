import { describeDtc, dtcDescription } from './dtc-descriptions';

describe('describeDtc', () => {
  it('returns the exact text for a known generic code', () => {
    expect(describeDtc('P0420')).toBe('Katalizör sistemi verimliliği eşiğin altında (Sıra 1)');
    expect(dtcDescription('p0300')).toBe('Rastgele / çoklu silindir ateşleme hatası algılandı');
  });
  it('falls back to the P subsystem for an unknown generic code', () => {
    expect(describeDtc('P0399')).toBe('Ateşleme sistemi veya tekleme · genel kod');
    expect(dtcDescription('P0399')).toBeNull();
  });
  it('marks manufacturer-specific codes', () => {
    expect(describeDtc('P1234')).toBe('Yakıt ve hava ölçümü (enjektör devresi) · üreticiye özel kod');
    expect(describeDtc('B1001')).toBe('Gövde (hava yastığı, klima, aydınlatma) · üreticiye özel kod');
    expect(describeDtc('U0100')).toBe('Motor kontrol modülü (ECM/PCM) ile iletişim kaybı');
  });
  it('rejects malformed input', () => {
    expect(describeDtc('X123')).toBe('Bilinmeyen kod biçimi');
  });
});
