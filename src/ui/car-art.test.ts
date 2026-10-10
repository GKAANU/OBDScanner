import { findCarArt } from './car-art';

describe('findCarArt', () => {
  it('matches brand + model with extras and casing', () => {
    expect(findCarArt({ brand: 'Peugeot', model: '508 GT Line', year: 2021 })?.id).toBe('peugeot-508-2018');
    expect(findCarArt({ brand: 'peugeot', model: '508', year: null })?.id).toBe('peugeot-508-2018');
    expect(findCarArt({ brand: 'RENAULT', model: 'Clio V', year: 2022 })?.id).toBe('renault-clio-5');
  });
  it('handles aliases and Turkish characters', () => {
    expect(findCarArt({ brand: 'VW', model: 'Golf 8', year: 2021 })?.id).toBe('volkswagen-golf-8');
    expect(findCarArt({ brand: 'Togg', model: 'T10X', year: 2024 })?.id).toBe('togg-t10x');
    expect(findCarArt({ brand: 'Fiat', model: 'Egea', year: 2019 })?.id).toBe('fiat-egea-sedan');
  });
  it('respects generation years', () => {
    expect(findCarArt({ brand: 'Peugeot', model: '508', year: 2014 })).toBeNull();
    expect(findCarArt({ brand: 'Volkswagen', model: 'Golf', year: 2016 })).toBeNull();
  });
  it('returns null for unknown cars', () => {
    expect(findCarArt({ brand: 'Opel', model: 'Astra', year: 2020 })).toBeNull();
    expect(findCarArt({ brand: '', model: '', year: null })).toBeNull();
  });
});
