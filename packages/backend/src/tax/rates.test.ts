import { describe, it, expect } from 'vitest';
import { percentFor, type TaxRates } from './rates.js';

const rates: TaxRates = { standard: 19, reduced: 7 };

describe('percentFor', () => {
  it('resolves standard to the configured standard rate', () => {
    expect(percentFor('standard', rates)).toBe(19);
  });

  it('resolves reduced to the configured reduced rate', () => {
    expect(percentFor('reduced', rates)).toBe(7);
  });

  it('resolves zero to 0 regardless of configured rates', () => {
    expect(percentFor('zero', rates)).toBe(0);
  });

  it('reflects a changed standard rate (e.g. a future Regelsteuersatz increase)', () => {
    expect(percentFor('standard', { standard: 20, reduced: 7 })).toBe(20);
  });
});
