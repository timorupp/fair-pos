/** Unit tests for the pure helpers in tables.ts. */
import { describe, it, expect } from 'vitest';
import { makeLabels } from './tables.helpers.js';

describe('makeLabels', () => {
  describe('alphabetic labels', () => {
    it('generates A, B, C ascending', () => {
      expect(makeLabels(3, 'alpha', 'asc')).toEqual(['A', 'B', 'C']);
    });

    it('generates C, B, A descending', () => {
      expect(makeLabels(3, 'alpha', 'desc')).toEqual(['C', 'B', 'A']);
    });

    it('handles count of 1', () => {
      expect(makeLabels(1, 'alpha', 'asc')).toEqual(['A']);
    });

    it('handles count of 26 (full alphabet)', () => {
      const result = makeLabels(26, 'alpha', 'asc');
      expect(result).toHaveLength(26);
      expect(result[0]).toBe('A');
      expect(result[25]).toBe('Z');
    });
  });

  describe('numeric labels', () => {
    it('generates 1, 2, 3 ascending (one-based)', () => {
      expect(makeLabels(3, 'numeric', 'asc')).toEqual(['1', '2', '3']);
    });

    it('generates 3, 2, 1 descending', () => {
      expect(makeLabels(3, 'numeric', 'desc')).toEqual(['3', '2', '1']);
    });

    it('returns strings, not numbers', () => {
      const result = makeLabels(2, 'numeric', 'asc');
      expect(typeof result[0]).toBe('string');
    });
  });

  describe('edge cases', () => {
    it('returns empty array for count of 0', () => {
      expect(makeLabels(0, 'alpha', 'asc')).toEqual([]);
    });
  });
});
