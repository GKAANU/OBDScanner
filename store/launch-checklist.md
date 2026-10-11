# Otova launch checklist: from now to "Ready for Sale"

Work top to bottom. You run every `eas` command yourself, from the `otova/` folder. IAP details are in [iap-setup.md](iap-setup.md).

## TODO for you (blocking)

- [ ] Replace **`destek@ORNEK`** in `docs/*.html` with your real support email.
- [ ] Fill in **`[Geliştirici adı]`** in `docs/*.html` (and in the Copyright line).
- [ ] **Enable GitHub Pages** and check that the 4 URLs load (Phase A).
- [ ] **Agreements, tax, and banking**, plus a **mali müşavir** call about GVK 20/B, W-8BEN, and KDV ([iap-setup.md §a](iap-setup.md#a-agreements-tax-and-banking)).
- [ ] **DSA decision:** Türkiye-only launch, or EU trader status with a public address.
- [ ] **Icon check:** `assets/icon.png` is the real Otova icon (Phase A).
- [ ] **Screenshots** captured per `store/screenshots-plan.md`.

---

## Phase A: Prerequisites

- [ ] **Real app icon.** RELEASE.md noted that the assets were Expo template images. Open `assets/icon.png` and confirm it is the Otova logo (">" prompt with an amber cursor), then run:
  ```bash
  sips -g pixelWidth -g pixelHeight -g hasAlpha assets/icon.png
  ```
  Expect `1024`, `1024`, `hasAlpha: no`. Also check `splash-icon.png`. A template icon risks a 4.2 / 2.3 rejection.
- [ ] **Web pages:** replace `destek@ORNEK` and `[Geliştirici adı]` in every `docs/*.html` file, then commit and push.
- [ ] **GitHub Pages:** in the GKAANU/OBDScanner repo, go to **Settings → Pages → Source: Deploy from a branch → `main` → `/docs` → Save**. Wait a few minutes, then open each URL on your phone:
  - [ ] <https://gkaanu.github.io/OBDScanner/>
  - [ ] <https://gkaanu.github.io/OBDScanner/gizlilik.html>
  - [ ] <https://gkaanu.github.io/OBDScanner/kosullar.html>
  - [ ] <https://gkaanu.github.io/OBDScanner/destek.html>
- [ ] **Agreements / tax / banking** active, and Small Business Program applied for ([iap-setup.md §a–b](iap-setup.md)).

## Phase B: App Store Connect listing (version 1.0)

- [ ] **Metadata:** paste the name, subtitle, promotional text, description, and keywords from `store/metadata-tr.md`. Add the EULA link to the description (see iap-setup.md §f, 3.1.2).
- [ ] **URLs:** Support URL `…/destek.html`, Marketing URL `…/` (optional), Privacy Policy URL `…/gizlilik.html`.
- [ ] **Screenshots:** follow `store/screenshots-plan.md` (6.9" iPhone required; no iPad, since `supportsTablet` is false).
- [ ] **App Privacy:** fill in per `store/privacy-nutrition.md` ("Data Not Collected").
- [ ] **App Review Information:** paste the notes from `store/review-notes.md`, add a contact phone and email, and leave **Sign-in required unchecked**.
- [ ] **Age rating:** answer the questionnaire (no objectionable content, no web browser, no user-generated content). It should come out at the lowest rating.
- [ ] **Category:** as set in metadata-tr.md (for example, Utilities as primary).
- [ ] **Pricing:** the app is **Free** (revenue comes from IAP).
- [ ] **Availability (decision):**
  - *Türkiye only (recommended for v1.0):* no EU DSA exposure. The UI is Turkish-only anyway.
  - *All countries:* wider reach, but you need a DSA trader declaration (public address) for the EU.
- [ ] **Content Rights:** "No, it does not contain, show, or access third-party content."
- [ ] **Copyright:** `2026 [Geliştirici adı]`.

## Phase C: In-app purchases

- [ ] Create `otova.pro.lifetime` and `otova.pro.yearly` ([iap-setup.md §c–d](iap-setup.md)). Both must show **Ready to Submit**.
- [ ] Run the TestFlight purchase test plan ([iap-setup.md §e](iap-setup.md#e-sandbox-and-testflight-testing)) on the current TestFlight build (`production` profile), **with "Test için Pro'yu aç" turned OFF**.

## Phase D: Store build

**Why a separate profile:** the `production` profile sets `EXPO_PUBLIC_TESTER_UNLOCK=1`, which shows the "Test için Pro'yu aç" toggle. Unlocking paid features without IAP breaks **Guideline 3.1.1**. The `store` profile sets the variable to `"0"`. EAS `extends` **merges** `env` objects, so if you just deleted the key from `store`, it would inherit `"1"` from `production`. Keep the explicit `"0"`.

- [ ] Local checks:
  ```bash
  npx tsc --noEmit
  npx jest
  npx expo-doctor
  ```
- [ ] Build and upload. The `printf` trick produces the `@` character you cannot type:
  ```bash
  EXPO_APPLE_ID="gkaanu$(printf '\x40')icloud.com" eas build -p ios --profile store
  EXPO_APPLE_ID="gkaanu$(printf '\x40')icloud.com" eas submit -p ios --profile store --latest
  ```
- [ ] Install **that exact build** from TestFlight. Check the build number. Then confirm:
  - [ ] "Test için Pro'yu aç" is **not visible** in Daha fazla or on the paywall.
  - [ ] The paywall shows TRY prices, "/ yıl", and the auto-renew text, and the **Kullanım koşulları (EULA)** and **Gizlilik** links open.
  - [ ] Optional: repeat a quick purchase and restore (free in TestFlight).
  - [ ] Demo mode works from all three entry points (the reviewer depends on it).

## Phase E: Submit

- [ ] On the 1.0 version page, under **Build**, select the **store** build (not a `production` build).
- [ ] Under **In-App Purchases and Subscriptions**, add **both** products.
- [ ] Export compliance is already answered (`usesNonExemptEncryption: false`). Sign-in is not required.
- [ ] **Version release:** choose **"Manually release this version"**, so that you pick launch day. Turning on **Phased Release** is fine too, but it only staggers *automatic updates* for existing users over 7 days. New downloads always get the latest version, so phased release mainly matters from v1.0.1 on.
- [ ] **Add for Review → Submit.**
- [ ] **If rejected:** reply in the **Resolution Center** (App Review messages). Answer the exact guideline, keep it short, and attach a screen recording if useful. Fix and resubmit, or reply if it was a misunderstanding. Typical cases:
  - **2.1 (hardware needed):** point to Demo mode and the review notes, and add a screen recording of a real car connection.
  - **3.1.2 (subscription info):** check the paywall text, the EULA link in the description, and the Privacy URL.
  - **5.1.1 (privacy):** check that the Pages URLs load and that the nutrition label matches "Data Not Collected".

## Phase F: Launch day

- [ ] Status shows **Pending Developer Release** → tap **Release This Version**.
- [ ] Within a few hours: open the live listing on your phone and check the icon, screenshots, prices, and IAP list on the product page.
- [ ] Search the Turkish App Store for "Otova" and 2–3 keywords (indexing can take up to about 24 hours).
- [ ] Optional: make one real purchase with your own account to confirm live payment works. You can request a refund via reportaproblem.apple.com afterwards.
- [ ] Watch **TestFlight / ASC → Crashes** and reviews daily during week 1.

---

## v1.1: Rating prompt (do NOT install now)

Plan: add `expo-store-review` (`SKStoreReviewController`). It is **not installed**, and adding it requires a new native build.
- Trigger only after a positive moment: the **2nd successful scan with no errors**, or after saving the **3rd maintenance record**.
- Never on first launch, never after a failure or disconnect, never on or right after the paywall.
- iOS shows the prompt at most **3 times per 365 days**, whatever you request, and never in TestFlight. Call it sparingly and track locally that you have already asked.

---

## Post-launch growth (Türkiye, zero backend)

**Week 1**
- Share the launch price ("249,99 TL, [date] tarihine kadar") everywhere, with a real end date that matches the scheduled price change.
- Post in brand owner groups (Facebook: Fiat Egea, Renault Clio, Toyota Corolla, and similar clubs), the DonanımHaber otomobil forums, Kokpit, and r/Turkey / r/arabalar. Lead with help, not ads. Ekşi Sözlük: only with a genuine, non-promotional entry.
- Record 3 short vertical videos (Reels / TikTok / Shorts): "Motor arıza lambası yandı → 30 saniyede ne olduğunu öğren". Use a real car and dongle, and show Demo mode as a fallback.

**Month 1**
- **Dongle sellers:** contact ELM327 sellers on Trendyol, Hepsiburada, and n11, and offer an in-box card with a one-time **Offer Code** for Pro. ASC now supports offer codes for non-consumables as well as subscriptions; *verify in ASC*, and test that a redeemed code unlocks Pro (it should arrive as a transaction, and "Geri yükle" brings it back).
- YouTube how-tos per common code: "P0420 nedir", "P0171 nedir", "Muayeneden önce hazırlık durumu". They serve as your blog.
- Ask happy users to share copied reports. The plain-text "Tam raporu kopyala" output works as word of mouth.

**Months 2–3**
- **ASO:** revise keywords every 4–6 weeks using ASC Analytics impressions and conversions. Test terms such as "arıza lambası", "arıza kodu", "obd2", "elm327", "muayene", "akü testi", "araç bakım".
- **Product Page Optimization:** A/B test the first two screenshots (DTC detail vs. maintenance plan).
- **Seasonal pushes:** before TÜVTÜRK muayene appointments (muayene readiness), at the start of winter (akü testi), and around kasko / trafik sigortası renewals (Belgeler ve tarihler reminders).

**Metrics to watch** (ASC only; the app has no analytics)
1. Impressions → product page views → downloads (conversion rate).
2. Paywall conversion, approximated as Pro sales per download in ASC Sales and Trends.
3. Ratings count and average, plus review themes.
4. Crashes in ASC / TestFlight crash reports.
