/** Demo `ReceiptData` builder. Pure (no DB / no env access) so it can be used in unit tests. */

import type { ReceiptData, ReceiptPosition } from './types.js';
import { computeTaxBreakdown, computeTotalGross } from './format.js';

/** Builds a fully populated demo receipt for the PDF preview, without touching the database. */
export function buildDemoReceipt(now: Date = new Date()): ReceiptData {
  const positions: ReceiptPosition[] = [
    // Deposit taxed at the Regelsteuersatz independent of the article's own
    // rate (Task #113) — deliberately demonstrated here with a `reduced`
    // article carrying a `standard`-taxed deposit, so the preview visibly
    // shows both split into their correct tax-breakdown rows below.
    { name: 'Bier 0,5l',      quantity: 3, unitPrice: 4.50, unitDeposit: 2.00,  taxRate: 7,  taxCategory: 'reduced',  depositTaxRate: 19, lineGross: 3 * 6.50 },
    { name: 'Brezel',         quantity: 2, unitPrice: 2.50, unitDeposit: null,  taxRate: 7,  taxCategory: 'reduced',  depositTaxRate: null, lineGross: 2 * 2.50 },
    { name: 'Bratwurst',      quantity: 1, unitPrice: 4.00, unitDeposit: null,  taxRate: 7,  taxCategory: 'reduced',  depositTaxRate: null, lineGross: 4.00 },
    { name: 'Flasche zurück', quantity: 1, unitPrice: 0,    unitDeposit: -1.00, taxRate: 19, taxCategory: 'standard', depositTaxRate: 19, lineGross: -1.00 },
  ];
  return {
    companyName: 'Musterverein e.V.',
    companyAddressLines: ['Festplatzweg 1', '12345 Beispielort'],
    taxNumber: '123/456/78901',
    vatId: null,
    systemSerial: 'FairPOS-2026-DEMODEMOXX',
    receiptNumber: 'RE-00042',
    createdAt: now,
    registerName: 'Theke',
    paymentMethod: 'cash',
    isCancellation: false,
    tableName: null,
    firstOrderTime: null,
    logoPng: null,
    logoWidth: 0,
    logoHeight: 0,
    logoWidthFactor: 0,
    logoEscPos: null,
    positions,
    totalGross: computeTotalGross(positions),
    taxBreakdown: computeTaxBreakdown(positions),
    tseTransactionNumber: null,
    tseSignatureCounter: null,
    tseSignature: null,
    tseStartTime: null,
    tseEndTime: null,
  };
}
