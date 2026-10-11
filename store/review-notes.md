# App Review Information

Paste the block below into App Store Connect > the version > App Review Information > Notes.
Set **Sign-in required: No**. Contact fields: your name, phone, and the real support email (not `destek@ORNEK`).
Optional attachment: a 20-40 s screen recording of demo mode plus one real-car session. That helps with Guideline 2.1 for hardware apps.

---

```
Otova is a car companion app for Turkish drivers with a built-in OBD-II scanner.

NO ACCOUNT / NO SIGN-IN
The app has no accounts and no server. All data stays on the device.

HARDWARE
Car diagnostics need an ELM327 OBD-II adapter: a small third-party device
that plugs into the car's OBD port under the dashboard. Otova supports
Wi-Fi adapters (the adapter creates its own Wi-Fi network; the app connects
over the local network, default 192.168.0.10:35000) and Bluetooth LE
adapters. The app makes no internet connections of its own.

FEATURES THAT WORK WITHOUT HARDWARE
Garaj, Bakim (maintenance plan and service history) and
Daha fazla > Belgeler ve tarihler (inspection, insurance and tax due dates)
work without any adapter. On first launch, add any car (for example
Renault Clio, 2018, Benzin, 85000 km) and skip the adapter step.

HOW TO REVIEW DIAGNOSTICS WITHOUT AN ADAPTER (DEMO MODE)
Demo mode simulates a car with fault codes, a freeze frame, live sensor
data and vehicle info. No hardware needed. Any one of:
  1. Tani tab > "Baglan" > "Dongle'im yok, demo ile dene"
  2. Canli tab > "Demo modunu dene"
  3. Daha fazla > Baglanti ayarlari > turn on "Demo modu"
After that, Tani shows stored/pending codes with plain-language detail,
Canli shows live gauges, and Daha fazla > Arac bilgisi shows VIN and
readiness monitors. Values in demo mode are simulated and labeled as such.

CLEARING CODES (MODE 04)
"Kodlari sil" (clear fault codes) is the only command that changes ECU
state. It is behind a confirmation dialog that warns that clearing codes
does not fix the fault. All other functions are read-only. The app does no
tuning, coding or immobilizer access.

IN-APP PURCHASES (Otova Pro)
- otova.pro.lifetime: non-consumable, one-time purchase
- otova.pro.yearly: auto-renewable subscription, 1 year
Free features: Garaj, maintenance plan, the last 5 service records, due
dates, reading all fault codes, the detail of the first code, and the main
live gauges. Pro unlocks the rest: details of every code, freeze frame,
all live sensors, battery test, used-car check, terminal, full report and
PDF, multiple vehicles, unlimited history and reminders.
Open the paywall from Daha fazla > "Pro'ya gec", or tap any locked item.
The paywall shows prices, subscription terms, Restore Purchases, and links
to Terms of Use (EULA) and the Privacy Policy.
Note: purchases need internet. If the device is joined to an adapter's
Wi-Fi (which has no internet), the paywall asks the user to switch networks.

PERMISSIONS
- Local Network: only to reach the Wi-Fi OBD adapter.
- Bluetooth: only to connect to a Bluetooth LE OBD adapter (not used for
  location).
- Notifications (optional): local reminders for maintenance and document
  due dates. No push notifications.

Privacy policy: https://gkaanu.github.io/OBDScanner/gizlilik.html
Terms: https://gkaanu.github.io/OBDScanner/kosullar.html
```

---

Before you submit, check that the build attached to the version came from the **`store`** profile. In that build, "Test için Pro'yu aç" must not appear in Daha fazla or on the paywall. If the reviewer sees that toggle, the app is rejected under Guideline 3.1.1.

The review notes leave out Turkish diacritics (Tani, Baglan, Canli, gec) so they paste cleanly. The buttons in the app show the real spelling: Tanı, Bağlan, Canlı, Pro'ya geç, "Dongle'ım yok, demo ile dene".
