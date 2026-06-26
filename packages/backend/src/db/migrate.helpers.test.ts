/** Unit tests for the pure migration-runner helpers. */
import { describe, it, expect } from 'vitest';
import { selectPendingMigrations } from './migrate.helpers.js';

describe('selectPendingMigrations', () => {
  it('returns all files sorted when none have been applied', () => {
    const files = ['0003_three.sql', '0001_one.sql', '0002_two.sql'];
    expect(selectPendingMigrations(files, new Set()))
      .toEqual(['0001_one.sql', '0002_two.sql', '0003_three.sql']);
  });

  it('skips already-applied migrations', () => {
    const files = ['0001_one.sql', '0002_two.sql', '0003_three.sql'];
    const applied = new Set(['0001_one.sql', '0002_two.sql']);
    expect(selectPendingMigrations(files, applied)).toEqual(['0003_three.sql']);
  });

  it('returns an empty list when everything is already applied', () => {
    const files = ['0001.sql', '0002.sql'];
    const applied = new Set(files);
    expect(selectPendingMigrations(files, applied)).toEqual([]);
  });

  it('filters out non-.sql files (README, .DS_Store, backups)', () => {
    const files = ['0001_init.sql', 'README.md', '.DS_Store', '0002_users.sql.bak'];
    expect(selectPendingMigrations(files, new Set())).toEqual(['0001_init.sql']);
  });

  it('sorts numerically via leading zero-padded prefix (4-digit number convention)', () => {
    const files = ['0010_ten.sql', '0002_two.sql', '0001_one.sql', '0011_eleven.sql'];
    expect(selectPendingMigrations(files, new Set()))
      .toEqual(['0001_one.sql', '0002_two.sql', '0010_ten.sql', '0011_eleven.sql']);
  });

  it('does not mutate the input array', () => {
    const files = ['0002.sql', '0001.sql'];
    selectPendingMigrations(files, new Set());
    expect(files).toEqual(['0002.sql', '0001.sql']);
  });
});
