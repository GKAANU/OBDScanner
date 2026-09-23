# Releasing Otova to TestFlight and the App Store

All commands run from `otova/`. Nothing in this repo uploads anything by
itself. Every step that needs your Apple or Expo account is listed here.

## 0. What you need first (only you can do these)

- [ ] **Apple Developer Program membership** (99 USD/year), enrolled as an
      individual or an organization. <https://developer.apple.com/programs/>
- [ ] **Expo account** (free). <https://expo.dev/signup>
- [ ] **A real app icon.** `assets/icon.png`, `splash-icon.png`,
      `adaptive-icon.png` and `favicon.png` are still the stock Expo template
      images. They have the same md5 as `expo-template-blank-typescript@sdk-54`.
      Replace `icon.png` with a 1024x1024 PNG that has **no alpha channel**, then check it:
      `sips -g pixelWidth -g pixelHeight -g hasAlpha assets/icon.png`
- [ ] **Privacy policy URL** (App Store Connect requires one; see section 5).
- [ ] **A real-device test with your Wi-Fi ELM327 dongle and car**
      (see section 7). Demo mode and unit tests do not replace this.

## 1. Local checks

```bash
npm install
npx tsc --noEmit
npx jest
npx expo-doctor
npx expo install --check
```

Known expo-doctor note: `react-native-tcp-socket` is flagged "Untested on New
Architecture" (`newArchEnabled: true`). Confirm the TCP connection works on a
real device build (section 7). If it does, you can silence the check with:

```json
"expo": { "doctor": { "reactNativeDirectoryCheck": { "exclude": ["react-native-tcp-socket"] } } }
```

If it does not work, set `"newArchEnabled": false` in `app.json` and rebuild.

## 2. Log in and link the project to EAS

```bash
npm install -g eas-cli
eas login
eas init            # creates the EAS project and writes expo.extra.eas.projectId into app.json
```

`eas.json` already exists. Do not re-run `eas build:configure` unless you want
to regenerate it. If you do, keep `appVersionSource: "remote"` and
`production.autoIncrement: true`.

## 3. Dev build on your iPhone (recommended before production)

```bash
eas device:create                                   # register your iPhone (ad hoc)
eas build --profile development --platform ios
# install from the link EAS prints, then:
npx expo start --dev-client
```

## 4. Production build and TestFlight

```bash
eas build --platform ios --profile production
```

- On the first run, let EAS create the distribution certificate and
  provisioning profile. The bundle identifier is `com.otova.scanner`.
  Change it in `app.json` before the first build if you want a different one,
  because it cannot be changed after the App Store Connect record exists.
- Version: `expo.version` in `app.json` (currently `1.0.0`) is the marketing
  version. The build number is managed remotely by EAS (`appVersionSource:
  remote`) and auto-increments on each production build.
  `ios.buildNumber` in `app.json` is only used for local prebuilds.
- Export compliance is answered in config
  (`ios.config.usesNonExemptEncryption: false`). The app uses no encryption:
  plain TCP to the dongle, no HTTPS.

Create the app record in App Store Connect (My Apps, +, New App): platform iOS,
name "Otova" (or whatever is available), primary language Turkish, bundle ID
`com.otova.scanner`, and any SKU. Then fill in `eas.json`:

```json
"submit": { "production": { "ios": {
  "appleId": "you@example.com",        // your Apple ID email (optional)
  "ascAppId": "1234567890",            // App Store Connect > App > App Information > Apple ID
  "appleTeamId": "ABCDE12345"          // developer.apple.com > Membership > Team ID
} } }
```

Submit the build to TestFlight:

```bash
eas submit --platform ios --profile production --latest
```

(Or build and submit in one step: `eas build -p ios --profile production --auto-submit`.)

After Apple processes the build (usually 10 to 30 minutes), add yourself as an
internal tester in App Store Connect under TestFlight.

## 5. App Store Connect listing

**Privacy policy URL (required).** The app collects nothing, so a short static
page is enough. Host it anywhere, for example GitHub Pages or a Notion public
page. Suggested content (Turkish, with English optional):

> Otova hiçbir kişisel veri toplamaz, saklamaz veya paylaşmaz. Uygulama yalnızca
> kullanıcının kendi Wi-Fi OBD-II adaptörüne yerel ağ üzerinden bağlanır;
> internete hiçbir veri gönderilmez. Bağlantı ayarları ve seçili canlı veri
> listesi yalnızca cihazda saklanır. Araç verileri, kullanıcı "kopyala" dediğinde
> panoya kopyalanır; bundan sonrası kullanıcının kontrolündedir.
> İletişim: <your email>

**App Privacy (nutrition label):** choose **"Data Not Collected"**. This matches
`ios.privacyManifests` in `app.json` (no tracking, no collected data types).

**Screenshots:** required for the 6.9" display (1320 x 2868 or 1290 x 2796).
Apple can scale those down for the 6.5" size, but add 6.5" (1284 x 2778 or
1242 x 2688) screenshots if App Store Connect asks for them. iPad is not needed
because `supportsTablet` is false. Demo mode is the easiest way to get
populated screens: take one each of Tanı (DTC list, expanded freeze frame),
Canlı, Araç (VIN plus readiness), and Terminal.

**Other fields:** category Utilities (or Navigation), age rating 4+, a
description in Turkish, keywords (OBD, OBD2, ELM327, arıza kodu, DTC), a
support URL, and a copyright line.

**Review notes (App Review Information > Notes).** Paste something like:

> Otova reads diagnostic data from a car through a Wi-Fi ELM327 OBD-II adapter
> (a small device plugged into the car's OBD port that creates its own Wi-Fi
> network). The app only talks to that adapter over the local network and
> makes no internet connections.
>
> To review without the hardware, use Demo Mode: on the first screen (Tanı),
> tap "Adaptörün yok mu? Demo modunda dene". Alternatively, tap the status bar
> at the top, enable "Demo modu", and tap "Bağlan". Demo Mode simulates a car
> with fault codes, a freeze frame, live sensor data (Canlı tab), vehicle info
> (Araç tab) and a raw command terminal. Values shown in demo mode are
> simulated.
>
> With real hardware: plug in the adapter, turn the ignition on, join the
> adapter's Wi-Fi network (usually "WiFi_OBDII", default IP 192.168.0.10, port
> 35000), then tap "Bağlan". iOS will ask for Local Network permission, which
> is required to reach the adapter.

Leave "Sign-in required" unchecked. The app has no accounts.

## 6. Submit for review

In App Store Connect, open the version, pick the TestFlight build, fill in the
remaining fields, and choose **Add for Review**, then **Submit**. Common
rejections for this kind of app:

- **2.1 (hardware-dependent):** addressed by Demo Mode and the review notes.
- **5.1.1 (privacy policy missing or unreachable):** make sure the URL works.
- **4.2 (minimum functionality):** placeholder icon or empty screens. Replace
  the icon and use demo data for the screenshots.

## 7. Real-device checklist (with your dongle)

Unit tests cover the parsers against representative samples only
(`src/obd/__fixtures__/README.md`). Before submitting:

- [ ] Connect: first launch shows the Local Network prompt; after you allow
      it, the status bar reaches "Hazır" and shows protocol and voltage.
- [ ] iOS may warn "no internet connection" on the dongle Wi-Fi. Stay on it
      (the app works fully offline).
- [ ] Tanı: stored, pending and permanent codes match another scanner. Expanding
      a code shows the freeze frame.
- [ ] Canlı: RPM and coolant update with the engine running. Leaving the tab
      stops polling.
- [ ] Araç: VIN, ECU name, readiness and the supported PID grid appear.
- [ ] Pull the dongle or switch off the ignition while connected: the app
      shows "Adaptörle bağlantı koptu..." instead of hanging.
- [ ] Mode 04 clear works and asks for confirmation first.
- [ ] Save real responses from the Terminal ("Bunu kopyala") into
      `src/obd/__fixtures__/` and add test cases for them.
