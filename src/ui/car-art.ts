/**
 * Pick the illustration for a vehicle from its brand / model / year. Pure.
 * Matching is forgiving: case, Turkish characters, spaces and dashes are
 * ignored, and the model may be typed with extras ("508 GT Line", "Clio 5").
 */
import { CAR_ART, type CarArt } from './cars-data';

function norm(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/ë/g, 'e')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BRAND_ALIASES: Record<string, string> = {
  vw: 'volkswagen',
  'mercedes benz': 'mercedes',
};

function brandKey(b: string): string {
  const n = norm(b);
  return BRAND_ALIASES[n] ?? n;
}

/** First word of a catalog model ("Egea Sedan" -> "egea"). */
function modelHead(m: string): string {
  return norm(m).split(' ')[0] ?? '';
}

export function findCarArt(v: { brand: string; model: string; year: number | null }): CarArt | null {
  const brand = brandKey(v.brand);
  const model = norm(v.model);
  if (!brand || !model) return null;
  const words = model.split(' ');
  const candidates = CAR_ART.filter((c) => brandKey(c.brand) === brand && words.includes(modelHead(c.model)));
  if (candidates.length === 0) return null;
  const inYears = (c: CarArt) =>
    v.year == null || (v.year >= c.years[0] - 1 && (c.years[1] == null || v.year <= c.years[1]));
  // Prefer the generation covering the year, then the most specific model name.
  const scored = candidates
    .filter(inYears)
    .map((c) => ({ c, score: norm(c.model).split(' ').filter((w) => words.includes(w)).length }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.c ?? null;
}
