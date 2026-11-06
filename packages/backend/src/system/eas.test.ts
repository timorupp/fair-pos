import { describe, expect, it } from 'vitest';
import { buildEasFields, stripBsiIdFormPrefix, type EasSource } from './eas.js';

const fullSource: EasSource = {
  softwareVersion: '0.2.9',
  systemSerial: 'FairPOS-2026-77STAH4KE3',
  commissionedAt: new Date(2026, 8, 21, 14, 30, 0),
  tse: { tseSerialNumber: 'dfe622', formFactor: 'USB', tseCertificationId: 'BSI-K-TR-0800-2026' },
};

describe('stripBsiIdFormPrefix', () => {
  it('strips the prefix the ELSTER form already prints', () => {
    expect(stripBsiIdFormPrefix('BSI-K-TR-0800-2026')).toBe('0800-2026');
  });

  it('leaves IDs in any other format unchanged', () => {
    expect(stripBsiIdFormPrefix('BSI-K-TSE-0001')).toBe('BSI-K-TSE-0001');
  });
});

describe('buildEasFields (Task #154)', () => {
  it('lists the fields in ELSTER form order with FairPOS and TSE values', () => {
    expect(buildEasFields(fullSource)).toEqual([
      { label: 'Art des eAs', value: 'Computergestützte/PC-Kassensysteme' },
      { label: 'Software des eAs', value: 'FairPOS' },
      { label: 'Software-Version des eAs', value: '0.2.9' },
      { label: 'Seriennummer des eAs / Software-App', value: 'FairPOS-2026-77STAH4KE3' },
      { label: 'Hersteller des eAs', value: 'FairPOS Community' },
      { label: 'Modell des eAs', value: 'FairPOS' },
      { label: 'Seriennummer der TSE', value: 'dfe622' },
      { label: 'Art / Bauform der TSE', value: 'USB' },
      { label: 'BSI-Zertifizierungs-ID: „BSI-K-TR-“', value: '0800-2026' },
      { label: 'Inbetriebnahme des eAs', value: '21.09.2026' },
    ]);
  });

  it('reports TSE fields as null when the TSE is unavailable', () => {
    const fields = buildEasFields({ ...fullSource, tse: null });
    const byLabel = new Map(fields.map((f) => [f.label, f.value]));
    expect(byLabel.get('Seriennummer der TSE')).toBeNull();
    expect(byLabel.get('Art / Bauform der TSE')).toBeNull();
    expect(byLabel.get('BSI-Zertifizierungs-ID: „BSI-K-TR-“')).toBeNull();
    expect(byLabel.get('Software des eAs')).toBe('FairPOS');
  });

  it('reports empty TSE strings, a missing serial and a missing date as null', () => {
    const fields = buildEasFields({
      ...fullSource,
      systemSerial: null,
      commissionedAt: null,
      tse: { tseSerialNumber: '', formFactor: '', tseCertificationId: '' },
    });
    expect(fields.filter((f) => f.value === null).map((f) => f.label)).toEqual([
      'Seriennummer des eAs / Software-App',
      'Seriennummer der TSE',
      'Art / Bauform der TSE',
      'BSI-Zertifizierungs-ID: „BSI-K-TR-“',
      'Inbetriebnahme des eAs',
    ]);
  });
});
