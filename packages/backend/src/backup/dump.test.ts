/** Unit tests for the DATABASE_URL parsing behind the manual pg_dump backup. */
import { describe, it, expect } from 'vitest';
import { parseDatabaseUrl } from './dump.js';

describe('parseDatabaseUrl', () => {
  it('extracts host/port/user/password/database from a standard connection string', () => {
    expect(parseDatabaseUrl('postgresql://fairpos:changeme@localhost:5432/fairpos')).toEqual({
      host: 'localhost', port: '5432', user: 'fairpos', password: 'changeme', database: 'fairpos',
    });
  });

  it('defaults the port to 5432 when omitted', () => {
    expect(parseDatabaseUrl('postgresql://fairpos:changeme@localhost/fairpos')).toMatchObject({ port: '5432' });
  });

  it('URL-decodes credentials containing special characters', () => {
    const result = parseDatabaseUrl('postgresql://us%40er:p%40ss%23word@localhost:5432/fairpos');
    expect(result.user).toBe('us@er');
    expect(result.password).toBe('p@ss#word');
  });
});
