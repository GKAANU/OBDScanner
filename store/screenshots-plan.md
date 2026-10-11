# Otova App Store screenshot plan

## Sizes

| Set | Pixels (portrait) | Status |
|---|---|---|
| 6.9" (primary masters) | 1320 x 2868 | Required. Capture on iPhone 16/17 Pro Max or the matching Simulator. |
| 6.5" | 1284 x 2778 (or 1242 x 2688) | App Store Connect can scale the 6.9" set down to smaller sizes, but upload a 6.5" set if ASC still asks for it. |

Making 6.5" from the 6.9" masters: both are close to 9:19.5 (1320/2868 = 0.4603, 1284/2778 = 0.4622). Scale the master to 1284 px wide (height becomes 2790), then crop 12 px off the bottom (or 6 top + 6 bottom) to reach 1284 x 2778. Better: build the frames in a design tool at 1320 x 2868 and re-export the same frame at 1284 x 2778 so the caption is laid out, not cropped. Quick command line version:

```
sips -Z 2790 in.png --out tmp.png && sips -c 2778 1284 tmp.png --out out-6.5.png
```

Count: max 10 allowed, plan 7. Export PNG or JPG, RGB, no transparency.

## Capture setup

1. Install a build that can run demo mode:
   - Real device (simplest): TestFlight build on an iPhone 16/17 Pro Max.
   - Simulator: TestFlight builds cannot be installed on the Simulator. Build a dev client for it: set `"ios": {"simulator": true}` on the `development` profile in eas.json, then `eas build --profile development --platform ios`, drag the .app onto the Simulator and run `npx expo start --dev-client`. Hide the dev menu/overlay before capturing.
2. The Simulator has no Bluetooth and cannot reach a dongle. That is fine: every frame uses Demo mode.
3. Clean status bar (Simulator):
   ```
   xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3
   xcrun simctl io booted screenshot frame1.png
   ```
   On a real device the status bar cannot be overridden: charge to 100%, turn on a Focus mode to block notifications, and keep Wi-Fi connected.
4. Onboarding: add a realistic car first (for example a common TR car: brand/model/year/fuel/km in "Aracını ekle"), plus one service record and the four dates (muayene, trafik sigortası, kasko, MTV) so Garaj and Bakım are not empty.
5. Pro: turn on "Test için Pro'yu aç" in Daha fazla (TestFlight/dev only) so Pro screens show full content. This toggle does not exist in the store build (profile `store`, `EXPO_PUBLIC_TESTER_UNLOCK=0`). Never capture the toggle itself.
6. Demo mode: Tanı -> "Bağlan" -> "Dongle'ım yok, demo ile dene" (alternatives: Canlı -> "Demo modunu dene", or Daha fazla -> Bağlantı ayarları -> "Demo modu"). Keep the demo notice visible where the app shows it; do not edit it out.

## Frames

| # | Caption (top) | Subline (optional) | Screen / steps | Pro | Data visible |
|---|---|---|---|---|---|
| 1 | Aracının cebindeki asistanı (27) | Bakım, tarihler ve arıza kodları tek yerde | Garaj tab, after onboarding + demo connected | Off is fine | Car card, next service due, upcoming muayene/sigorta date, connection status |
| 2 | Arıza kodları, sade Türkçe (26) | ELM327 adaptörle oku | Tanı -> demo connected -> tap the first code to open its detail | On (so more than the first code has detail; frame shows one code) | Code (Geist Mono amber), plain-language explanation, stored/pending/permanent counts |
| 3 | Bakımı zamanında yap (20) | Kilometre ve zamana göre plan | Bakım tab | Off is fine | Plan items with km/time due, one overdue/near item, a service history record |
| 4 | Motoru canlı izle (17) | Devir, hız, sıcaklık ve daha fazlası | Canlı tab, demo running, wait a few seconds so values move | On (full sensor list, no blur) | Main gauges: RPM, speed, coolant; part of the sensor list |
| 5 | Muayene, sigorta, MTV tarihleri (31) | Hatırlatma ile kaçırma | Daha fazla -> Belgeler ve tarihler | On (reminders are Pro) | Muayene, trafik sigortası, kasko, MTV with dates and days left |
| 6 | İkinci el almadan kontrol et (28) | Akü testi ve PDF rapor | Daha fazla -> İkinci el kontrolü (demo connected); alternative: Akü testi | On | Check summary: codes, readiness, km-related fields as shown by the app |
| 7 | Hesap yok. Veriler telefonunda. (31) | Reklam yok, takip yok | Option A: Garaj or Tanı with "Tümünü kopyala" toast visible. Option B: Muayeneye hazır mı? result | Off/On | Real UI only; the caption carries the privacy message |

Captions are plain text, no emoji, under about 32 characters. Do not imply anything not in the app (no ABS/airbag, no "all cars", no "fixes faults").

## Frame design spec

- Canvas 1320 x 2868, background `#0c0b0a`.
- Caption at top, about 180-260 px from the top edge: Geist SemiBold/Bold ~96-110 px, color `#f0ede8`; one key word may be amber `#fbbf24`. Subline Geist Regular ~48 px, `#a8a29e`-ish muted text.
- Screenshot below the caption, scaled to about 82-86% width, rounded corners (~60 px) or an optional iPhone frame. Keep the bottom tab bar visible so tabs read as one app.
- Optional subtle amber glow behind the device, no gradients that fight the dark UI. Same layout on all 7 frames.
- Small LogoMark (">" + amber cursor) only on frame 1, if at all.

## Rules

- Guideline 2.3.3: screenshots must show the app in use. Real app UI only; simulated demo data is fine. No mockups of screens that do not exist, no splash or login screens.
- Do not show the "Test için Pro'yu aç" toggle or any dev-client overlay.
- Prices are not shown in screenshots (they vary and come from StoreKit).
- Re-capture if the UI changes before submission.

## Optional App Preview (15-30 s)

Record in the Simulator with `xcrun simctl io booted recordVideo preview.mov` (or device screen recording), 886 x 1920 portrait export. Flow: 0-3 s Garaj with the car and upcoming dates; 3-10 s Tanı -> demo connect -> codes appear -> open a code's plain-language detail; 10-17 s Canlı gauges moving; 17-23 s Bakım plan scroll and Belgeler ve tarihler; 23-28 s long-press a value to show the copy toast, end on Garaj. Only real app footage, no voiceover needed; captions can be added as overlays. App Preview is optional and can ship in a later update.
