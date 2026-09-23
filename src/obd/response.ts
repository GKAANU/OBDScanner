/**
 * Pure normalization of raw ELM327 response text into byte-aligned hex
 * "messages" (one per ECU reply). Parsers search these for mode/PID markers.
 *
 * Handles:
 *  - trailing `>` prompt, CR/LF line endings, spaces on or off (ATS0/ATS1)
 *  - `SEARCHING...` and `BUS INIT: ...OK` banners
 *  - status lines (NO DATA, STOPPED, ?, ...) — dropped
 *  - command echo (ATE1) on the first line
 *  - ISO 15765 multi-frame with headers off: `014` length line + `0:`/`1:`
 *    frame lines, joined into one message and trimmed to the stated length
 *  - headers on (ATH1): CAN 11-bit (7E8..7EF), CAN 29-bit (18DAF1xx) with
 *    ISO-TP PCI bytes, ISO 9141 (48 6B xx) and KWP (8x F1 xx) with checksum
 */

type Assembly = { hex: string; lengthBytes: number | null };

/** Mode 01..0A request (what an echoed command looks like), no spaces. */
const ECHO_RE = /^0[1-9A][0-9A-F]{0,12}$/;
const FRAME_LINE_RE = /^([0-9A-F]{1,2}):([0-9A-F]*)$/;
const LENGTH_LINE_RE = /^[0-9A-F]{3}$/;
const HEX_RE = /^[0-9A-F]+$/;

export function responseMessages(raw: string): string[] {
  const text = raw
    .toUpperCase()
    .replace(/>/g, '')
    .replace(/SEARCHING\.*/g, '\n')
    .replace(/BUS INIT:?\s*\.*\s*OK/g, '\n');

  let lines = text
    .split(/[\r\n]+/)
    .map((l) => l.replace(/\s+/g, ''))
    .filter((l) => l.length > 0 && (HEX_RE.test(l) || FRAME_LINE_RE.test(l)));

  // Echo (ATE1): the first line repeats the request, e.g. "010C".
  if (lines.length > 0 && ECHO_RE.test(lines[0]) && !LENGTH_LINE_RE.test(lines[0])) {
    lines = lines.slice(1);
  }

  const messages: string[] = [];
  let current: Assembly | null = null; // headers-off multi-frame being joined
  let pendingLength: number | null = null; // from a "014"-style length line
  const byHeader = new Map<string, Assembly>(); // headers-on multi-frame per ECU

  const flush = () => {
    if (current) messages.push(trim(current));
    current = null;
  };

  for (const line of lines) {
    if (LENGTH_LINE_RE.test(line)) {
      flush();
      pendingLength = parseInt(line, 16);
      continue;
    }

    const frame = FRAME_LINE_RE.exec(line);
    if (frame) {
      if (parseInt(frame[1], 16) === 0 || !current) {
        flush();
        current = { hex: '', lengthBytes: pendingLength };
        pendingLength = null;
      }
      current.hex += frame[2];
      continue;
    }

    const headered = parseHeaderedLine(line);
    if (headered) {
      flush();
      const { ecu, kind, data, lengthBytes } = headered;
      if (kind === 'single') {
        messages.push(data);
      } else if (kind === 'first') {
        byHeader.set(ecu, { hex: data, lengthBytes });
      } else {
        const asm = byHeader.get(ecu);
        if (asm) asm.hex += data;
      }
      continue;
    }

    // Plain single-line message (headers off).
    flush();
    if (line.length % 2 === 0) messages.push(line);
  }
  flush();
  for (const asm of byHeader.values()) messages.push(trim(asm));

  return messages.filter((m) => m.length > 0);
}

/** All messages joined — for parsers that only need the first match. */
export function responseHex(raw: string): string {
  return responseMessages(raw).join('');
}

/**
 * Index of `marker` in `hex`, only at byte-aligned (even) offsets, so a
 * marker never matches across the nibbles of two adjacent bytes.
 */
export function findMarker(hex: string, marker: string): number {
  const m = marker.toUpperCase();
  for (let i = 0; i + m.length <= hex.length; i += 2) {
    if (hex.startsWith(m, i)) return i;
  }
  return -1;
}

function trim(a: Assembly): string {
  return a.lengthBytes != null ? a.hex.substring(0, a.lengthBytes * 2) : a.hex;
}

type Headered = {
  ecu: string;
  kind: 'single' | 'first' | 'consecutive';
  data: string;
  lengthBytes: number | null;
};

function parseHeaderedLine(line: string): Headered | null {
  // CAN 11-bit (7E8..7EF) or 29-bit (18 DA F1 xx) + ISO-TP PCI byte.
  const can = /^(7E[8-F]|18DAF1[0-9A-F]{2})([0-9A-F]{2})([0-9A-F]*)$/.exec(line);
  if (can) {
    const [, ecu, pciHex, rest] = can;
    const pci = parseInt(pciHex, 16);
    const type = pci >> 4;
    if (type === 0) {
      return { ecu, kind: 'single', data: rest.substring(0, (pci & 0x0f) * 2), lengthBytes: null };
    }
    if (type === 1 && rest.length >= 2) {
      const len = ((pci & 0x0f) << 8) | parseInt(rest.substring(0, 2), 16);
      return { ecu, kind: 'first', data: rest.substring(2), lengthBytes: len };
    }
    if (type === 2) return { ecu, kind: 'consecutive', data: rest, lengthBytes: null };
    return null;
  }

  // ISO 9141-2: 48 6B <src> <data...> <checksum>
  const iso = /^486B([0-9A-F]{2})([0-9A-F]*)$/.exec(line);
  if (iso && iso[2].length >= 4) {
    return { ecu: iso[1], kind: 'single', data: iso[2].substring(0, iso[2].length - 2), lengthBytes: null };
  }

  // ISO 14230 (KWP2000): <8x format/length> F1 <src> <data...> <checksum>
  const kwp = /^8([0-9A-F])F1([0-9A-F]{2})([0-9A-F]*)$/.exec(line);
  if (kwp) {
    const len = parseInt(kwp[1], 16);
    return { ecu: kwp[2], kind: 'single', data: kwp[3].substring(0, len * 2), lengthBytes: null };
  }
  return null;
}
