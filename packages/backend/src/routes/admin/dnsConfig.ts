/** Admin routes for Split-Horizon-DNS / DNS-Masquerading (Task #92). */

import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { query } from '../../db/client.js';
import {
  detectDefaultIp,
  disableDnsConfig,
  installDnsConfig,
  testDnsResolution,
  validateDnsSettings,
} from '../../system/dnsConfig.js';

/** Keys in `system_setting` that hold the Split-Horizon-DNS configuration. */
const SETTING_KEYS = {
  domain: 'dns_domain',
  upstreamPrimary: 'dns_upstream_primary',
  upstreamSecondary: 'dns_upstream_secondary',
  targetIp: 'dns_target_ip',
  ttl: 'dns_ttl',
} as const;

const DEFAULT_TTL_SECONDS = 300;

/** Settings as shown to/edited by the admin UI. `configured` is presence-based (Nutzervorgabe, 2026-08-30) — there is no separate on/off toggle, only whether a domain is saved. */
interface DnsSettingsView {
  domain: string;
  upstreamPrimary: string;
  upstreamSecondary: string;
  targetIp: string;
  ttl: number;
  configured: boolean;
}

/** Loads the currently-saved DNS settings from `system_setting`, defaulting unset fields to empty/`DEFAULT_TTL_SECONDS`. */
async function loadSettings(): Promise<DnsSettingsView> {
  const result = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
    [Object.values(SETTING_KEYS)],
  );
  const map = Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
  return {
    domain: map[SETTING_KEYS.domain] ?? '',
    upstreamPrimary: map[SETTING_KEYS.upstreamPrimary] ?? '',
    upstreamSecondary: map[SETTING_KEYS.upstreamSecondary] ?? '',
    targetIp: map[SETTING_KEYS.targetIp] ?? '',
    ttl: map[SETTING_KEYS.ttl] ? Number(map[SETTING_KEYS.ttl]) : DEFAULT_TTL_SECONDS,
    configured: Boolean(map[SETTING_KEYS.domain]),
  };
}

/** Persists validated settings into `system_setting`, one row per key. */
async function saveSettings(settings: {
  domain: string;
  upstreamPrimary: string;
  upstreamSecondary: string | null;
  targetIp: string;
  ttl: number;
}): Promise<void> {
  const entries: [string, string][] = [
    [SETTING_KEYS.domain, settings.domain],
    [SETTING_KEYS.upstreamPrimary, settings.upstreamPrimary],
    [SETTING_KEYS.upstreamSecondary, settings.upstreamSecondary ?? ''],
    [SETTING_KEYS.targetIp, settings.targetIp],
    [SETTING_KEYS.ttl, String(settings.ttl)],
  ];
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO system_setting (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value],
    );
  }
}

/** Registers `/api/admin/dns-config` routes. */
export async function dnsConfigAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/dns-config — currently saved settings, or defaults/`configured: false` if none. */
  app.get('/', async (_req, reply) => {
    return reply.send(await loadSettings());
  });

  /**
   * POST /api/admin/dns-config — validates, installs (stage + privileged
   * script, which itself validates with `dnsmasq --test` and rolls back on
   * failure), and only then persists. Settings are deliberately never saved
   * to the database if the install step fails, so `system_setting` never
   * claims a configuration that isn't actually running — see
   * `system/dnsConfig.ts`.
   */
  app.post('/', async (req, reply) => {
    const body = req.body as {
      domain?: string;
      upstreamPrimary?: string;
      upstreamSecondary?: string;
      targetIp?: string;
      ttl?: number;
    };

    let settings;
    try {
      settings = validateDnsSettings(body);
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : 'Ungültige Einstellungen' });
    }

    try {
      await installDnsConfig(settings);
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Installation fehlgeschlagen' });
    }

    await saveSettings(settings);
    return reply.send(await loadSettings());
  });

  /** DELETE /api/admin/dns-config — removes the staged config (privileged script then deletes dnsmasq's FairPOS config) and clears the saved settings. */
  app.delete('/', async (_req, reply) => {
    try {
      await disableDnsConfig();
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Deaktivierung fehlgeschlagen' });
    }
    await query(`DELETE FROM system_setting WHERE key = ANY($1)`, [Object.values(SETTING_KEYS)]);
    return reply.status(204).send();
  });

  /** POST /api/admin/dns-config/detect-ip — auto-detects this server's own LAN IP via its default route, for the "Auto-erkennen" button. */
  app.post('/detect-ip', async (_req, reply) => {
    try {
      const ip = await detectDefaultIp();
      return reply.send({ ip });
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Erkennung fehlgeschlagen' });
    }
  });

  /** POST /api/admin/dns-config/test — queries the server's own resolver directly and checks the configured domain resolves to the configured IP. */
  app.post('/test', async (_req, reply) => {
    const settings = await loadSettings();
    if (!settings.configured) {
      return reply.status(400).send({ error: 'Noch keine DNS-Konfiguration gespeichert' });
    }
    const result = await testDnsResolution(settings.domain, settings.targetIp);
    return reply.send(result);
  });
}
