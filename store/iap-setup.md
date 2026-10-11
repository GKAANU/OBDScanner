# Otova Pro: In-App Purchase setup

After this guide, App Store Connect (ASC) is set up to sell both Pro products, and you have tested them end to end on TestFlight.

| Product ID (must match code) | Type | Price |
|---|---|---|
| `otova.pro.lifetime` | Non-consumable | 399.99 TRY (launch: 249.99 TRY, temporary) |
| `otova.pro.yearly` | Auto-renewable subscription, 1 year | 149.99 TRY |

The IDs are hardcoded in `src/pro/entitlement.tsx` (`PRO_LIFETIME`, `PRO_YEARLY`). A typo in ASC means the paywall shows no products.

> **Labels:** ASC menu names change often. Where this guide says *(verify in ASC)*, look for the closest matching label. In 2024 Apple renamed "Agreements, Tax, and Banking" to **Business**, so look under either name.

---

## a) Agreements, tax, and banking

You do this once per developer account. Only the **Account Holder** can accept agreements. On an individual account, that is you.

### Paid Apps Agreement
- [ ] ASC → **Business** (or **Agreements, Tax, and Banking**) → **Paid Apps** → review and accept.
- [ ] The status reads **Active** only after banking **and** tax are complete. Until then, products do not load in TestFlight and reviewers cannot buy (see section f, 2.1).

### Bank account
- [ ] Add a bank account at a Turkish bank. You need the **IBAN**, the bank's **SWIFT/BIC**, and the account currency (**TRY or USD**).
- [ ] Before you type anything, ask your bank for its exact format for **incoming international transfers**: the beneficiary name (Latin characters vs ş/ğ/ı, and whether it must match your ID exactly), the SWIFT code for your branch, and whether an intermediary bank is needed. A mismatch means returned payments, and you only find out weeks later.
- [ ] **If you plan to use GVK 20/B (see below), add the dedicated 20/B account here, not your everyday account.** The exemption requires all app-store proceeds to arrive in that account.
- Payment timing and the minimum payout threshold: *verify in ASC → Payments and Financial Reports*.

### U.S. tax form (W-8BEN)
- [ ] ASC → Business → **Tax Forms** → **W-8BEN** (individual, non-U.S. person). Use your T.C. kimlik no / Turkish vergi no as the foreign TIN.
- [ ] Claim treaty benefits under the **Türkiye–U.S. income tax treaty**. App-store income is usually treated under the royalties article. **Do not pick a rate or article yourself. Confirm both with a mali müşavir.**

### Turkish tax side: GVK mükerrer 20/B (decision for your mali müşavir)
The **GVK mükerrer madde 20/B** exemption ("sosyal içerik üreticiliği ve mobil cihazlar için uygulama geliştiriciliği kazanç istisnası") may cover an individual selling apps through app stores. As commonly described:
- You open a **dedicated account at a bank in Türkiye** and tell the bank it is for 20/B. **All** app-store proceeds must come in only through that account.
- The bank withholds **gelir vergisi stopajı** on each incoming transfer (reported as 15%). Below an annual limit tied to a tax-bracket amount, that withholding is final and you file no annual return. The limit changes every year.
- You may need to notify the vergi dairesi of the account. Stamp-duty and other details also apply.

- [ ] **Ask your mali müşavir to confirm:** your eligibility, the current annual limit and stopaj rate, the notification steps, and how it combines with your other income. **Do this before you enter banking in ASC**, so the correct account receives the first payment.
- [ ] Alternative they may suggest: a şahıs şirketi. If you go that way, your ASC tax and banking setup changes.

### KDV / VAT
- Apple sets customer prices tax-inclusive, and for many storefronts Apple collects and remits VAT itself. For **Türkiye storefront sales by a Türkiye-resident developer**, Apple's current Schedule 2 exhibits treat "local developers" differently in some countries. **Verify** in ASC → Business → Tax, and with your mali müşavir, whether Apple remits KDV for your Turkish sales or you must.

### EU Digital Services Act (DSA) trader status (decision)
ASC requires a trader-status declaration before your app can appear on **EU storefronts**. *Verify location: ASC → Business, or App Information.*
- **Trader:** your **address, phone, and email are shown publicly** on the EU product page, and Apple verifies them. Selling IAPs generally points toward trader status.
- **Non-trader:** not a good fit for a monetized app. Ask your mali müşavir.
- **Simplest path:** launch in **Türkiye only** (or exclude EU countries) first and declare later. If you skip the declaration, EU storefronts simply stay unavailable.
- [ ] Decide: Türkiye-only launch, or trader with a public business address.

---

## b) App Store Small Business Program (15% commission)
- [ ] Apply at <https://developer.apple.com/app-store/small-business-program/> **before your first sale**. The Paid Apps Agreement must already be accepted.
- [ ] The reduced rate applies from Apple's fiscal period after approval, not retroactively (*verify the exact start rule on the program page*).

---

## c) Non-consumable: Otova Pro Lifetime

ASC → Apps → Otova → **Monetization → In-App Purchases** → **+** (*verify in ASC*).

- [ ] Type: **Non-Consumable**
- [ ] Reference Name: `Otova Pro Lifetime` (internal only)
- [ ] Product ID: `otova.pro.lifetime` (permanent; it can never be reused, even after deletion)

### Price and the temporary launch price
ASC prices each product with a **price schedule**: a base country plus dated price entries.
- [ ] **Base country: Türkiye.** Other storefronts get automatically equalized prices.
- [ ] **Current price: 249.99 TRY**, starting today.
- [ ] **Scheduled change: 399.99 TRY**, starting on your chosen end date for the launch price (for example, launch + 30 days). In the price schedule, add a new price with a **start date**. The earlier price then ends automatically.
- Doing it the other way around (399.99 as the base and 249.99 as a temporary price with an end date) also works, if ASC offers an end date on that entry. Either way, **put the end date on the paywall or in marketing** only if you are sure it is right.
- If 249.99 or 399.99 is not an exact TRY price point, pick the closest one (*verify in the price point list*).

### Family Sharing (decision)
- [ ] When this is ON, up to 5 family members get Pro for free. **Once you turn it on, you cannot turn it off.** Recommendation: leave it **off** at launch and decide later.

### Availability
- [ ] Match the app's availability (Türkiye-only, or all chosen countries; see DSA above).

### Localizations (display name ≤ 30 chars, description ≤ 45 chars)
| Locale | Display Name | Description |
|---|---|---|
| Turkish | `Otova Pro Ömür Boyu` (19) | `Tüm Pro özellikleri, tek seferlik ödeme` (39) |
| English (U.S.) | `Otova Pro Lifetime` (18) | `All Pro features, one-time purchase` (35) |

### Review information
- [ ] **Screenshot:** a screenshot of the paywall (`app/pro.tsx`, opened from the Pro card in Daha fazla) from a TestFlight build, with prices visible. Any iPhone screenshot works (minimum 640x920).
- [ ] **Review note:**
  > Unlocks all Otova Pro features permanently (one-time purchase). Open Daha fazla → Pro card, or tap any locked feature, to see the paywall. Restore is available on the paywall ("Satın alımları geri yükle"). Pro features can be tried in Demo mode without an OBD adapter (Tanı → Bağlan → "Dongle'ım yok, demo ile dene").

Save. The status should become **Ready to Submit**.

---

## d) Auto-renewable subscription: Otova Pro Yearly

ASC → Monetization → **Subscriptions** (*verify in ASC*).

- [ ] Create the **subscription group**. Reference name: `Otova Pro`.
- [ ] Group localizations (*verify field names*):
  - Turkish: display name `Otova Pro`
  - English: display name `Otova Pro`
- [ ] In the group, **+** a subscription:
  - Reference Name: `Otova Pro Yearly`
  - Product ID: `otova.pro.yearly`
  - Duration: **1 Year**
  - Price: base country **Türkiye, 149.99 TRY**
  - Availability: same as the app
  - Family Sharing: same decision as the lifetime product (irreversible)
- [ ] Localizations:

| Locale | Display Name | Description |
|---|---|---|
| Turkish | `Otova Pro Yıllık` (16) | `Tüm Pro özellikleri, yıllık` (27) |
| English (U.S.) | `Otova Pro Yearly` (16) | `All Pro features, billed yearly` (31) |

- [ ] **Introductory offer:** optional. Decide later (for example, a free trial). You can add it after launch without a new build.
- [ ] **Review screenshot:** the same paywall screenshot. **Review note:** same as above, but say "1-year auto-renewable subscription".

### First submission rule
**Your first IAPs must be submitted together with an app version.** On the version page (1.0), in the **In-App Purchases and Subscriptions** section, add **both** products **before** you tap Submit for Review. Products left out stay in "Ready to Submit" and are not reviewed.

---

## e) Sandbox and TestFlight testing

### Who buys with which account
- **TestFlight builds:** you buy with **your own Apple Account**. You are not charged, and you do not need a sandbox account. Subscriptions renew on an accelerated schedule: **once every 24 hours, up to 6 renewals**, regardless of duration (per Apple's "Subscription renewal rate in TestFlight" help page).
- **Development / dev-client builds:** use a **Sandbox Apple Account**.
  - [ ] ASC → **Users and Access → Sandbox → Test Accounts → +**. Use a fresh email alias (for example a `+otova` alias of your iCloud address). This is a web form, so typing "@" is fine. Set the storefront to **Türkiye**.
  - [ ] On the iPhone: **Settings → Developer → Sandbox Apple Account** on iOS 18 and later. Older iOS versions use Settings → App Store → Sandbox Account. *Verify on your iOS version.* In sandbox, 1 year renews in about 1 hour. You can also **clear purchase history** for the sandbox account in ASC to test the "not bought yet" state again. TestFlight has no such reset.

### Preconditions
- [ ] Paid Apps Agreement is **Active** (section a).
- [ ] Both products show **Ready to Submit** (metadata, price, and screenshot complete). Until then, the paywall shows no products.
- [ ] The phone has **internet**. On the dongle's Wi-Fi, StoreKit cannot reach Apple, and the paywall warns about this.
- [ ] **Turn OFF "Test için Pro'yu aç"** in Daha fazla. With it on, Pro is already unlocked and you are not testing anything.

### Test plan (in this order: a lifetime purchase on your Apple Account cannot be undone in TestFlight, and it would hide the subscription results)
- [ ] Paywall shows both products with **TRY prices**, "/ yıl" on the yearly product, the auto-renew text, and working **EULA** and **Gizlilik** links.
- [ ] Locked features (for example a second DTC detail, or Terminal) open the paywall.
- [ ] **Interrupted purchase:** start buying the yearly plan, then cancel in the Apple sheet. Expect no error message, Pro stays off, and the paywall stays usable.
- [ ] **Buy yearly.** Pro turns on immediately. Kill and relaunch the app: still Pro.
- [ ] **Offline:** join the dongle Wi-Fi (or turn on airplane mode). Pro stays on, because the status is cached.
- [ ] **Cancel** in Settings → [your name] → Subscriptions. After the current 24-hour TestFlight period ends, relaunch the app with internet. **Pro must turn off.** If cancelling fails in TestFlight (a known forum issue), wait for the 6 renewals to run out instead.
- [ ] **Buy lifetime.** Pro turns on.
- [ ] **Delete the app, reinstall from TestFlight**, open the paywall, and tap **Satın alımları geri yükle**. Pro comes back.
- [ ] Ask to Buy: not needed.

---

## f) Common IAP rejections and how Otova handles them

| Guideline | Typical cause | Otova status |
|---|---|---|
| **2.1** (performance / IAP not found) | The reviewer cannot see or buy the products: Paid Apps Agreement not Active, or products not attached to the version | Check section a and the "First submission rule" |
| **3.1.1** (in-app purchase) | Features unlocked without IAP, or no Restore button for non-consumables | The store build hides the tester toggle (`store` profile). Restore is on the paywall |
| **3.1.2** (subscriptions) | Missing title, length, price, auto-renew terms, or EULA / privacy links **in the app** | The paywall already shows these. **Also** put the EULA link in the **App Store description** (or set a custom License Agreement in App Information) and fill in the Privacy Policy URL in ASC: `https://gkaanu.github.io/OBDScanner/kosullar.html`, `https://gkaanu.github.io/OBDScanner/gizlilik.html` |
| **5.1.1** (privacy) | Privacy URL unreachable | Enable GitHub Pages first (see launch-checklist.md) |
