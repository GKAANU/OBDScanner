# App Privacy (App Store Connect "nutrition label")

## What to enter

App Store Connect > App Privacy > Get Started:

1. **"Do you or your third-party partners collect data from this app?"** -> **No, we do not collect data from this app.**
2. Result: the label shows **"Data Not Collected"**.
3. **Privacy Policy URL:** `https://gkaanu.github.io/OBDScanner/gizlilik.html`. Enable GitHub Pages first and confirm the page loads.
4. Tracking: none. The app does not use App Tracking Transparency and must not.

Apple's definition: data is "collected" when it is transmitted off the device in a way that you or a third-party partner can access for longer than it takes to service the request in real time. Otova transmits nothing off the device, so "Data Not Collected" is the correct answer.

Purchases do not change this answer. StoreKit transactions go between iOS and Apple, and the developer receives no payment data. Apple's own data handling falls under Apple's policy, not your label.

## Code audit behind the answer (2026-10-11, working tree on main)

| Check | Result |
|---|---|
| `fetch(`, `XMLHttpRequest`, `WebSocket`, `axios` in `app/`, `src/`, `plugins/` | **None** |
| Hard-coded URLs | Only `app/pro.tsx` TERMS_URL / PRIVACY_URL. These open in Safari via `Linking.openURL` when the user taps them; the app makes no request itself. The only other match is the SVG `xmlns` namespace string in `src/ui/cars-data.ts`, which is not a request. |
| Analytics / crash / ads SDKs (Sentry, Firebase, Amplitude, Segment, Mixpanel, Bugsnag, PostHog, AppsFlyer, Adjust, Facebook) | **None** in `package.json` or source |
| OTA updates (`expo-updates`) | **Not installed**, so there is no update-server call |
| Push notifications | **None.** No `getExpoPushTokenAsync` or `getDevicePushTokenAsync`. `plugins/withoutPushEntitlement.js` strips `aps-environment`. Only `scheduleNotificationAsync` with local DATE triggers (`src/notify/ReminderSync.tsx`). |
| Sockets | `react-native-tcp-socket` to the user-configured dongle IP (default 192.168.0.10:35000), and `react-native-ble-plx` to the BLE adapter (`neverForLocation: true`). Demo mode opens no socket (`src/obd/context.tsx`). |
| `expo-network` | `src/ui/diag-header.ts` reads the phone's local IP and network type from the OS and adds them to a connection log that is **only copied to the clipboard on user action**. Nothing is sent. |
| `expo-print` / `expo-sharing` | PDF is rendered locally from HTML (`src/report/html.ts`, which has no remote URLs) and handed to the iOS share sheet on user action. |
| `expo-iap` | StoreKit 2 on-device (`src/pro/entitlement.tsx`). No receipt-validation server. The `fetch` strings in `node_modules/expo-iap/build` belong to optional helpers that Otova never calls. |
| Local storage (AsyncStorage, on device only) | `otova.reminders.v1`, OBD config and selected live PIDs (`src/obd/context.tsx`), garage data v1/v2 (`src/garage/store.tsx`), `otova.pro.v1` (Pro cache), `otova.pro.tester` (tester toggle, ignored in store builds) |
| `app.json` privacy manifest | `NSPrivacyTracking: false`, no tracking domains, `NSPrivacyCollectedDataTypes: []`, required-reason APIs declared (UserDefaults CA92.1, FileTimestamp, SystemBootTime, DiskSpace). This matches "Data Not Collected". |

The audit found no network, analytics or tracking code that contradicts "Data Not Collected".

## Keep it true

Re-run this audit before every release:

```bash
cd otova
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|axios" app src plugins | grep -v "\.test\.ts"
grep -rnoE "https?://[A-Za-z0-9./_-]+" app src plugins | grep -v w3.org
grep -nE "sentry|firebase|amplitude|segment|mixpanel|posthog|bugsnag|appsflyer|adjust" package.json
```

Any of the following changes the label, and the privacy policy too: a crash reporter, analytics, remote config, an AI or LLM call, cloud backup of garage data, a receipt-validation server, or push notifications. Update both before you ship such a change.

## Related answers elsewhere in ASC

- **Export compliance:** already answered in config (`ITSAppUsesNonExemptEncryption: false`).
- **Content rights:** "No, it does not contain, show, or access third-party content." The DTC texts and maintenance data are bundled original content.
- **Sign-in required:** No.
