/**
 * Unit tests for the pure/in-memory parts of Split-Horizon-DNS handling
 * (Task #92) — validation and config rendering never touch the filesystem
 * or `sudo`, so they're fully unit-testable.
 */
import { describe, expect, it } from 'vitest';
import { buildDnsmasqConfig, parseDefaultRouteIp, validateDnsSettings } from './dnsConfig.js';

const VALID_INPUT = {
  domain: 'kasse.mein-verein.de',
  upstreamPrimary: '9.9.9.9',
  upstreamSecondary: '1.1.1.1',
  targetIp: '192.168.1.50',
  ttl: 300,
};

describe('validateDnsSettings', () => {
  it('accepts a fully valid configuration', () => {
    const settings = validateDnsSettings(VALID_INPUT);
    expect(settings).toEqual(VALID_INPUT);
  });

  it('accepts an omitted secondary upstream as null', () => {
    const settings = validateDnsSettings({ ...VALID_INPUT, upstreamSecondary: '' });
    expect(settings.upstreamSecondary).toBeNull();
  });

  it('rejects a bare hostname with no domain suffix', () => {
    expect(() => validateDnsSettings({ ...VALID_INPUT, domain: 'kasse' })).toThrow(/Domain/);
  });

  it('rejects a domain with a leading hyphen label', () => {
    expect(() => validateDnsSettings({ ...VALID_INPUT, domain: '-kasse.mein-verein.de' })).toThrow(/Domain/);
  });

  it('rejects an invalid target IP', () => {
    expect(() => validateDnsSettings({ ...VALID_INPUT, targetIp: 'not-an-ip' })).toThrow(/eigene IP/);
  });

  it('rejects an invalid primary upstream server', () => {
    expect(() => validateDnsSettings({ ...VALID_INPUT, upstreamPrimary: '999.999.999.999' })).toThrow(/primärer DNS-Server/);
  });

  it('rejects an invalid secondary upstream server', () => {
    expect(() => validateDnsSettings({ ...VALID_INPUT, upstreamSecondary: 'garbage' })).toThrow(/sekundärer DNS-Server/);
  });

  it('rejects a TTL below the minimum', () => {
    expect(() => validateDnsSettings({ ...VALID_INPUT, ttl: 5 })).toThrow(/TTL/);
  });

  it('rejects a TTL above the maximum', () => {
    expect(() => validateDnsSettings({ ...VALID_INPUT, ttl: 100_000 })).toThrow(/TTL/);
  });

  it('rejects a non-integer TTL', () => {
    expect(() => validateDnsSettings({ ...VALID_INPUT, ttl: 12.5 })).toThrow(/TTL/);
  });
});

describe('buildDnsmasqConfig', () => {
  it('renders both upstream servers, the domain override, TTL, and listen-address binding', () => {
    const text = buildDnsmasqConfig(validateDnsSettings(VALID_INPUT));
    expect(text).toContain('address=/kasse.mein-verein.de/192.168.1.50');
    expect(text).toContain('server=9.9.9.9');
    expect(text).toContain('server=1.1.1.1');
    expect(text).toContain('local-ttl=300');
    expect(text).toContain('listen-address=192.168.1.50');
    expect(text).toContain('bind-interfaces');
  });

  it('omits the second server line when no secondary upstream is configured', () => {
    const settings = validateDnsSettings({ ...VALID_INPUT, upstreamSecondary: '' });
    const text = buildDnsmasqConfig(settings);
    const serverLines = text.split('\n').filter((l) => l.startsWith('server='));
    expect(serverLines).toEqual(['server=9.9.9.9']);
  });
});

describe('parseDefaultRouteIp', () => {
  it('extracts the src IP from real `ip route get` output', () => {
    const output = '8.8.8.8 via 192.168.1.1 dev eth0 src 192.168.1.50 uid 1000\n    cache\n';
    expect(parseDefaultRouteIp(output)).toBe('192.168.1.50');
  });

  it('returns null when no src token is present', () => {
    expect(parseDefaultRouteIp('unroutable\n')).toBeNull();
  });
});
