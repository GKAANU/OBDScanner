# ELM327 response fixtures

**These are representative samples, not captures from a real vehicle.** They
were written by hand to match the documented ELM327 v1.5 output format for each
protocol and adapter setting. Replace or augment them with real captures from
your own car as soon as you can; synthetic data hides off-by-one and
whitespace bugs (see `CLAUDE.md` §9).

## Format

- One raw adapter response per file, exactly as received, including the
  trailing `>` prompt.
- Files use `\n` line endings for readability. The real adapter sends `\r`.
  `fixtures.test.ts` runs every fixture through the parsers with both.
- File name: `<protocol>[_hdr|_echo]_<request>_<what>.txt`
  - `can11` = ISO 15765-4 CAN 11-bit, `can29` = CAN 29-bit,
    `iso9141` = ISO 9141-2 K-line, `kwp` = ISO 14230-4 KWP2000, `elm` = AT command
  - `_hdr` = headers on (`ATH1`), `_echo` = echo on (`ATE1`)
  - Unless marked otherwise: headers off, echo off. CAN samples are spaces off
    (`ATS0`, what the app's init sends); K-line samples are spaces on.

| File | Request | Contents |
|---|---|---|
| can11_0100_searching.txt | 0100 | First request after ATSP0: `SEARCHING...` banner then the bitmap |
| can11_0100_unable.txt | 0100 | Ignition off: `UNABLE TO CONNECT` |
| can11_0100_spaces.txt | 0100 | Spaces on (`ATS1`) |
| can11_0101_readiness.txt | 0101 | MIL on, 3 DTCs, evap monitor not ready |
| can11_0105_ect.txt | 0105 | Coolant 83 °C |
| can11_010C_rpm.txt | 010C | 850 rpm |
| can11_03_single.txt | 03 | Count byte 02: P0133, P0420 |
| can11_03_none.txt | 03 | Count byte 00: no codes |
| can11_03_multiframe.txt | 03 | ISO-TP multi-frame (`00A` length line), 4 codes, padding `55` |
| can11_07_pending.txt | 07 | Pending P0171 |
| can11_0A_nodata.txt | 0A | `NO DATA` (no permanent codes) |
| can11_0902_vin.txt | 0902 | VIN, multi-frame with `014` length line |
| can11_0904_calid.txt | 0904 | Calibration ID, multi-frame, 00-padded, trailing `55` pad |
| can11_020200_ffdtc.txt | 020200 | Freeze frame 00 was stored by P0133 |
| can11_020C00_ffrpm.txt | 020C00 | Freeze frame RPM 1726 |
| can11_stopped.txt | any | `STOPPED` (interrupted) |
| can11_hdr_0100_two_ecus.txt | 0100 | Headers on, two ECUs (7E8 engine, 7E9 transmission) |
| can11_hdr_0902_vin.txt | 0902 | Headers on, ISO-TP first/consecutive frames |
| can29_hdr_010C.txt | 010C | 29-bit header `18 DA F1 10`, `AA` padding |
| can11_echo_010C.txt | 010C | Echo on: request echoed on the first line |
| can11_echo_03.txt | 03 | Echo on |
| iso9141_0100_businit.txt | 0100 | `BUS INIT: ...OK` banner (slow init) |
| iso9141_03_two_lines.txt | 03 | No count byte, 3 codes per line, 4 codes over 2 lines |
| iso9141_0902_vin.txt | 0902 | VIN over 5 numbered lines |
| iso9141_hdr_010C.txt | 010C | Headers on: `48 6B 11` + checksum |
| iso9141_bus_init_error.txt | any | `BUS INIT: ...ERROR` |
| kwp_hdr_010C.txt | 010C | Headers on: `84 F1 11` + checksum |
| elm_atz.txt | ATZ | Reset banner |
| elm_atrv.txt | ATRV | Battery voltage |
| elm_unknown.txt | any | `?` unknown command |

## Adding a real capture

1. In the Terminal tab, send the command and tap "Bunu kopyala" on the entry.
2. Save the response as a new file here, named after the protocol your car
   uses (shown in the status bar) and the request.
3. Add a case to `fixtures.test.ts` with the value you expect (for example the
   RPM shown on the dashboard at that moment).

Before committing a capture, remove the VIN if you do not want it in the repo.
