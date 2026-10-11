# Otova App Store metadata

Tüm sayımlar `python3 len()` ile doğrulandı (Türkçe karakterler 1 karakter sayılır). Bayt sayısı ayrıca verildi; App Store Connect anahtar kelime alanında karakter sayar, ama bir hata alırsan bayt-güvenli alternatifi kullan.

Kaynak: yalnızca doğrulanmış özellik listesi (facts.md). Emoji yok, abartılı iddia yok ("tüm araçlar", "arızayı giderir", "bayi seviyesi" gibi ifadeler kullanılmadı).

---

## tr (birincil dil)

### App adı (max 30)

| | Metin | Karakter |
|---|---|---|
| Önerilen | `Otova: Araç Asistanı ve OBD2` | 28 |
| Alternatif 1 | `Otova: OBD2 Arıza ve Bakım` | 26 |
| Alternatif 2 | `Otova - Araç Bakımı ve OBD2` | 27 |

Gerekçe: "Araç asistanı" yeni konumlandırmayı taşır, "OBD2" en yüksek niyetli arama terimidir. Ad, alt başlık ve anahtar kelimeler Apple tarafından birlikte indekslenir; kelimeler bu üç alan arasında tekrarlanmaz.

### Alt başlık (max 30)

`Arıza kodu, bakım ve muayene` (28 karakter)

### Tanıtım metni (max 170)

```
Aracının bakımını, muayene ve sigorta tarihlerini tek yerde takip et. ELM327 adaptörle arıza kodlarını sade Türkçe oku. Hesap yok, veriler telefonunda.
```
151 karakter. Bu alan sürüm göndermeden güncellenebilir; kampanya veya mevsimsel mesaj (örneğin muayene dönemi, kış bakımı) için kullan.

### Açıklama (max 4000)

2954 karakter. Düz metin; büyük harfli başlıklar ve "-" işaretleri App Store'da olduğu gibi görünür, sorun değildir.

```
Otova, aracın için cebindeki asistan. Bakım planını, servis geçmişini ve muayene, sigorta, MTV tarihlerini tek yerde tutar. Bir ELM327 OBD2 adaptör takarsan motor arıza kodlarını sade Türkçe ile okur, canlı sensör verilerini gösterir.

Dongle olmadan da çalışır. Aracını ekle, bakım planın hazır olsun.

GARAJ
- Aracının durumu tek ekranda: yaklaşan bakımlar ve tarihler
- Birden fazla araç (Pro)

BAKIM
- Kilometre ve zamana göre bakım planı (yakıt tipine göre genel aralıklar, markaya göre küçük ayarlar)
- Servis geçmişi: ücretsiz sürümde son 5 kayıt, Pro ile sınırsız kayıt ve dışa aktarma
- Bakım aralıklarını kendine göre düzenleme (Pro)

BELGELER VE TARİHLER
- Muayene, trafik sigortası, kasko ve MTV tarihleri
- Telefonunda yerel hatırlatmalar (Pro)

TANI (OBD2 adaptör ile)
- Kayıtlı, bekleyen ve kalıcı arıza kodları
- Kodların sade Türkçe açıklaması (ilk kod ücretsiz, diğerleri Pro)
- Donmuş kare verisi (Pro)
- Muayeneye hazır mı? kontrolü (gerekçeler Pro)
- Arıza kodlarını silme, açık bir uyarı ve onay ile

CANLI VERİ
- Devir, hız, soğutma sıvısı sıcaklığı gibi ana göstergeler
- Tüm sensör listesi, seçim ve grafikler (Pro)

DAHA FAZLA
- Araç bilgisi: VIN, ECU adı, kalibrasyon kimliği, hazırlık monitörleri, desteklenen PID tablosu
- Akü testi (Pro)
- İkinci el kontrolü ve PDF rapor (Pro)
- Terminal: ham AT ve OBD komutları (Pro)

KOPYALA VE PAYLAŞ
Her değer düz metin olarak kopyalanabilir. Raporu istediğin yere yapıştırabilir, PDF olarak paylaşabilirsin (tam rapor ve PDF Pro). Uygulamanın kendisi hiçbir yapay zekaya veya sunucuya veri göndermez.

HANGİ ADAPTÖRLER?
ELM327 uyumlu Wi-Fi ve Bluetooth LE (BLE) adaptörlerle çalışır. Klasik Bluetooth adaptörler iPhone ile çalışmaz. OBD2 portu çoğu benzinli araçta yaklaşık 2001, dizelde yaklaşık 2004 sonrası modellerde bulunur; uyumluluk araca göre değişebilir. Otova standart OBD2 motor ve emisyon verilerini okur, ABS veya hava yastığı gibi üreticiye özel modülleri okumaz.

Adaptörün yok mu? Demo moduyla tüm ekranları örnek verilerle deneyebilirsin.

GİZLİLİK
Hesap yok, reklam yok, takip yok. Verilerin yalnızca telefonunda saklanır, uygulamayı silince silinir. Uygulama kendi sunucusu olmadığı için verilerini hiçbir yere göndermez; tek bağlantı aracındaki OBD2 adaptörüdür.

OTOVA PRO
Temel özellikler ücretsizdir. Otova Pro tek seferlik ömür boyu satın alma veya yıllık abonelik olarak sunulur. Yıllık abonelik, dönem bitiminden en az 24 saat önce iptal edilmezse otomatik olarak yenilenir ve ücret Apple hesabından tahsil edilir. Aboneliği App Store hesap ayarlarından yönetebilir veya iptal edebilirsin.

Gizlilik: https://gkaanu.github.io/OBDScanner/gizlilik.html
Kullanım Koşulları (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

Not: Otova'daki bilgiler genel yönlendirme amaçlıdır, servis veya usta muayenesinin yerini tutmaz. Arıza kodlarını silmek arızayı çözmez, sadece lambayı söndürür. Otova hiçbir araç markası ile bağlantılı değildir.
```

### Anahtar kelimeler (max 100)

```
obd,elm327,motor,lambası,akü,teşhis,tarayıcı,sigorta,mtv,kasko,servis,yağ,araba,dtc,canlı,ikinci,el
```
99 karakter / 106 bayt. Virgülden sonra boşluk yok. Ad ve alt başlıktaki kelimeler (otova, araç, asistanı, ve, obd2, arıza, kodu, bakım, muayene) tekrarlanmadı.

Kapsanan kombinasyonlar (Apple alanları birleştirir): "motor arıza lambası", "arıza kodu okuma", "obd tarayıcı", "elm327 obd2", "araç teşhis", "akü testi", "ikinci el araç kontrol", "trafik sigortası", "mtv", "kasko", "servis bakım", "canlı veri".

Bayt-güvenli alternatif (100 bayt altı, `yağ` ve `dtc` çıkarıldı):
```
obd,elm327,motor,lambası,akü,teşhis,tarayıcı,sigorta,mtv,kasko,servis,araba,canlı,ikinci,el
```
91 karakter / 97 bayt.

Takip: ilk 4-6 hafta sıralamaları izle; görünürlük getirmeyen terimleri (ör. `dtc`, `el`) "check engine", "hata", "oto" ile test et.

### Bu sürümdeki yenilikler (1.0.0)

```
İlk sürüm. Garaj, bakım planı, belgeler ve tarihler, ELM327 ile arıza kodları ve canlı veri. Dongle olmadan demo moduyla deneyebilirsin.
```
136 karakter.

### URL'ler

- Destek URL'si: https://gkaanu.github.io/OBDScanner/destek.html
- Pazarlama URL'si: https://gkaanu.github.io/OBDScanner/
- Gizlilik politikası URL'si: https://gkaanu.github.io/OBDScanner/gizlilik.html

Not: GitHub Pages henüz açık değil (Settings > Pages > Deploy from branch > main > /docs). İncelemeye göndermeden önce üç adresin de açıldığını kontrol et. Destek sayfasındaki `destek@ORNEK` gerçek bir e-posta ile değiştirilmeli.

### Kategori

- Birincil: **Utilities (Araçlar)** — OBD tarayıcılar ve araç teşhis uygulamalarının çoğu burada; "obd" aramalarıyla aynı rakip kümesinde yer alır ve kategori sıralamasında rekabet makul.
- İkincil: **Navigation (Navigasyon)** — Türk ve global araç uygulamalarının bir kısmı burada; araç sahiplerinin göz attığı ikinci kategori. Alternatif: Lifestyle, ama orada araç uygulaması aranmaz ve rekabet çok geniştir.

### Yaş derecelendirmesi anketi

Tüm içerik soruları: **Yok (None)**
- Karikatür veya fantastik şiddet, gerçekçi şiddet, uzun süreli grafik şiddet: Yok
- Cinsellik veya çıplaklık, grafik cinsel içerik: Yok
- Küfür veya kaba mizah: Yok
- Alkol, tütün, uyuşturucu kullanımı veya referansları: Yok
- Korku / ürkütücü temalar: Yok
- Yetişkin / müstehcen temalar: Yok
- Tıbbi / tedavi bilgisi: Yok
- Benzetimli kumar: Yok

Evet/Hayır soruları: **Hayır**
- Sınırsız web erişimi: Hayır (uygulamada web tarayıcı yok; yalnızca gizlilik/EULA linkleri sistem tarayıcısında açılır)
- Kumar ve yarışmalar / gerçek parayla kumar: Hayır
- Daha yeni sorular: uygulama içi ebeveyn denetimleri / yaş doğrulama: Hayır; tıbbi veya sağlıklı yaşam (wellness) içeriği: Hayır; kullanıcılar arası mesajlaşma, sohbet veya kullanıcı tarafından oluşturulan içerik: Hayır; reklam: Hayır
- Beklenen derecelendirme: **4+**

### Telif hakkı

`2026 <Ad Soyad>` (Apple Developer hesabındaki tam adınla değiştir)

---

## en-US (ikincil yerelleştirme)

| Alan | Metin | Karakter |
|---|---|---|
| Name | `Otova: Car Assistant & OBD2` | 27 |
| Subtitle | `Fault codes, service, dates` | 27 |
| Keywords | `obd,elm327,scanner,diagnostic,engine,light,dtc,maintenance,reminder,battery,used,check,reader` | 93 |

Promotional text (158):
```
Track your car's service plan and renewal dates in one place. Read fault codes in plain language with an ELM327 adapter. No account, data stays on your phone.
```

What's New 1.0.0 (137):
```
First release. Garage, maintenance plan, dates, fault codes and live data with an ELM327 adapter. Try it without an adapter in demo mode.
```

Description (1518 karakter; kısa sürüm, uygulamanın Türkçe olduğu açıkça belirtildi):
```
Otova is a car companion for your iPhone. Keep your service plan, service history and renewal dates in one place. Plug in an ELM327 OBD2 adapter to read engine fault codes in plain language and see live sensor data.

Works without an adapter: add your car and get a maintenance plan by mileage and time.

- Garage: your car's upcoming service and dates at a glance
- Maintenance plan and service history
- Inspection, insurance and road tax dates (Turkey) with local reminders (Pro)
- Stored, pending and permanent fault codes with plain-language detail
- Inspection readiness check, freeze frame (Pro)
- Live gauges; full sensor list and charts (Pro)
- Vehicle info: VIN, ECU name, readiness monitors
- Battery test, used-car check with PDF report, terminal (Pro)
- Copy any value as plain text
- Demo mode: try every screen without an adapter

Works with ELM327-compatible Wi-Fi and Bluetooth LE adapters. Classic Bluetooth adapters do not work with iPhone. Reads standard OBD2 engine and emissions data only. The app is in Turkish.

No account, no ads, no tracking. Data stays on your phone.

Otova Pro is available as a one-time lifetime purchase or a yearly subscription that renews automatically unless cancelled at least 24 hours before the period ends.

Privacy: https://gkaanu.github.io/OBDScanner/gizlilik.html
Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

Information is general guidance only. Clearing codes does not fix a fault. Not affiliated with any car brand.
```

---

## Uygulama içi satın almalar (görünen ad max 30, açıklama max 45)

| Ürün ID | Tür | TR ad | TR açıklama | EN ad | EN açıklama |
|---|---|---|---|---|---|
| `otova.pro.lifetime` | Non-Consumable | Otova Pro Ömür Boyu (19) | Tek seferlik ödeme, tüm Pro özellikleri (39) | Otova Pro Lifetime (18) | One-time purchase, all Pro features (35) |
| `otova.pro.yearly` | Auto-Renewable Subscription (1 yıl) | Otova Pro Yıllık (16) | Tüm Pro özellikleri, yıllık yenilenir (37) | Otova Pro Yearly (16) | All Pro features, renews every year (35) |

Abonelik grubu adı önerisi: `Otova Pro` (TR ve EN aynı). İnceleme notu için: Pro özellikleri, ücretsiz sürümde neyin açık olduğu ve demo modunun nasıl açılacağı (Tanı > Bağlan > "Dongle'ım yok, demo ile dene") App Review notlarına yazılmalı; inceleme ekibinde OBD adaptör yok.

Gönderim hatırlatması: App Store build'i `store` profiliyle alınmalı (`eas build -p ios --profile store`), aksi halde "Test için Pro'yu aç" anahtarı mağaza sürümünde görünür.
