import { findMarker, responseHex, responseMessages } from './response';

describe('findMarker', () => {
  it('only matches at byte boundaries', () => {
    // "0410C1" contains "410C" at an odd offset (nibble-shifted) — not a match.
    expect(findMarker('0410C1', '410C')).toBe(-1);
    expect(findMarker('00410C1AF8', '410C')).toBe(2);
  });
  it('is case-insensitive on the marker', () => {
    expect(findMarker('4A010420', '4a')).toBe(0);
  });
});

describe('responseMessages', () => {
  it('drops status lines and the prompt', () => {
    expect(responseMessages('NO DATA\r\r>')).toEqual([]);
    expect(responseMessages('STOPPED\r>')).toEqual([]);
  });
  it('drops a SEARCHING... banner on the same line as data', () => {
    expect(responseMessages('SEARCHING...4100BE3FA813\r>')).toEqual(['4100BE3FA813']);
  });
  it('drops an echoed OBD request on the first line only', () => {
    expect(responseMessages('0105\r41057B\r>')).toEqual(['41057B']);
  });
  it('joins 0:/1: frames and trims to the length line', () => {
    expect(responseMessages('008\r0:4902014142\r1:43444546AAAAAA\r>')).toEqual(['4902014142434445']);
  });
  it('joins frames without a length line', () => {
    expect(responseHex('0: 41 0C 1A\n1: F8 00 00')).toBe('410C1AF80000');
  });
  it('strips CAN 11-bit single-frame headers using the PCI length', () => {
    expect(responseMessages('7E8 03 41 05 7B 00 00 00 00\r>')).toEqual(['41057B']);
  });
  it('drops odd-length garbage lines instead of misaligning bytes', () => {
    expect(responseMessages('41057\r>')).toEqual([]);
  });
});
