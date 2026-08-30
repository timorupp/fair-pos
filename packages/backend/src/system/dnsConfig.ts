/**
 * Split-Horizon-DNS / DNS-Masquerading (Task #92) — lets a real, publicly
 * validated domain resolve to this server's own LAN IP for devices at the
 * event venue, so an officially-trusted TLS certificate (see
 * `system/tlsCert.ts`, Task #66) works without installing a custom CA on
 * anyone's device. Runs `dnsmasq` as a plain forwarder for everything
 * except the configured domain — see docs/Installationsanleitung.md,
 * "DNS-Masquerading (Split-Horizon-DNS)".
 *
 * Same validate-before-privileged-action shape as `system/tlsCert.ts`:
 * settings are checked entirely in-memory first, then staged into a
 * `fairpos`-writable directory, then handed to one fixed, no-argument
 * privileged script.
 */
import { execFile } from 'node:child_process';
import { Resolver } from 'node:dns/promises';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

/** Reasonably strict FQDN check — requires at least one dot (rejects a bare hostname with no domain suffix), no leading/trailing hyphen per label. */
const DOMAIN_PATTERN = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

const TTL_MIN_SECONDS = 10;
const TTL_MAX_SECONDS = 86_400;

/** Validated Split-Horizon-DNS settings. */
export interface DnsSettings {
  domain: string;
  upstreamPrimary: string;
  upstreamSecondary: string | null;
  targetIp: string;
  ttl: number;
}

/**
 * Validates raw, admin-supplied DNS settings entirely in-memory — before
 * anything is written to disk or a privileged script is invoked.
 *
 * @throws {Error} A German, user-facing message describing exactly what's wrong.
 */
export function validateDnsSettings(input: {
  domain?: string;
  upstreamPrimary?: string;
  upstreamSecondary?: string | null;
  targetIp?: string;
  ttl?: number;
}): DnsSettings {
  const domain = input.domain?.trim() ?? '';
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new Error('Ungültige Domain (z. B. „kasse.mein-verein.de" erwartet)');
  }

  const targetIp = input.targetIp?.trim() ?? '';
  if (!isIPv4(targetIp)) throw new Error('Ungültige eigene IP-Adresse');

  const upstreamPrimary = input.upstreamPrimary?.trim() ?? '';
  if (!isIPv4(upstreamPrimary)) throw new Error('Ungültiger primärer DNS-Server');

  const upstreamSecondaryRaw = input.upstreamSecondary?.trim() ?? '';
  const upstreamSecondary = upstreamSecondaryRaw.length > 0 ? upstreamSecondaryRaw : null;
  if (upstreamSecondary !== null && !isIPv4(upstreamSecondary)) {
    throw new Error('Ungültiger sekundärer DNS-Server');
  }

  const ttl = input.ttl;
  if (typeof ttl !== 'number' || !Number.isInteger(ttl) || ttl < TTL_MIN_SECONDS || ttl > TTL_MAX_SECONDS) {
    throw new Error(`TTL muss eine ganze Zahl zwischen ${TTL_MIN_SECONDS} und ${TTL_MAX_SECONDS} Sekunden sein`);
  }

  return { domain, upstreamPrimary, upstreamSecondary, targetIp, ttl };
}

/**
 * Renders the dnsmasq config text for validated settings. Pure/exported so
 * it's unit-testable without touching the filesystem.
 *
 * `listen-address` + `bind-interfaces` restrict dnsmasq to the configured
 * IP specifically — Ubuntu's `systemd-resolved` already owns port 53 on
 * `127.0.0.53`, and binding dnsmasq there too would conflict with it.
 */
export function buildDnsmasqConfig(settings: DnsSettings): string {
  const lines = [
    '# Von FairPOS verwaltet (Task #92) — manuelle Änderungen gehen beim nächsten Speichern verloren.',
    `address=/${settings.domain}/${settings.targetIp}`,
    `server=${settings.upstreamPrimary}`,
  ];
  if (settings.upstreamSecondary) lines.push(`server=${settings.upstreamSecondary}`);
  lines.push(`local-ttl=${settings.ttl}`);
  lines.push(`listen-address=${settings.targetIp}`);
  lines.push('bind-interfaces');
  return lines.join('\n') + '\n';
}

const STAGED_CONFIG_FILENAME = 'fairpos.conf';

/**
 * Fixed, no-argument path of the privileged DNS-config script — same
 * reasoning as `system/tlsCert.ts`'s install script (a wildcard in a
 * sudoers command argument is rejected on this project's target Ubuntu
 * versions). The script itself decides install-vs-remove based on
 * whether the staged file exists, so one script covers both directions —
 * see docs/Installationsanleitung.md, "DNS-Masquerading (Split-Horizon-DNS)",
 * for its exact content and sudoers rule.
 */
const DNS_CONFIG_SCRIPT_PATH = '/opt/fairpos/scripts/dns-config.sh';

/** Invokes the privileged script that reconciles dnsmasq's real config with whatever is (or isn't) currently staged. */
async function runDnsConfigScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      config.sudoPath ?? 'sudo',
      [DNS_CONFIG_SCRIPT_PATH],
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`DNS-Konfiguration konnte nicht angewendet werden: ${stderr.trim() || err.message}`));
          return;
        }
        resolve();
      },
    );
  });
}

/**
 * Stages an already-validated config and triggers the privileged install
 * script, which copies it into dnsmasq's real config directory, validates
 * with `dnsmasq --test`, automatically rolls back on failure (so a bad
 * config can never take down the server's own DNS resolution), and
 * otherwise restarts dnsmasq. Requires the sudoers rule described in
 * docs/Installationsanleitung.md.
 *
 * @param settings - Already-validated settings (see {@link validateDnsSettings}).
 */
export async function installDnsConfig(settings: DnsSettings): Promise<void> {
  await mkdir(config.dnsStagingDir, { recursive: true });
  await writeFile(path.join(config.dnsStagingDir, STAGED_CONFIG_FILENAME), buildDnsmasqConfig(settings), { mode: 0o644 });
  await runDnsConfigScript();
}

/**
 * Removes the staged config (if any) and triggers the same privileged
 * script — with nothing staged, it deletes dnsmasq's FairPOS config
 * instead of installing one, so the server falls back to a plain
 * forwarder with no domain override.
 */
export async function disableDnsConfig(): Promise<void> {
  await rm(path.join(config.dnsStagingDir, STAGED_CONFIG_FILENAME), { force: true });
  await runDnsConfigScript();
}

/**
 * Parses `ip route get <target>`'s output for the `src <ip>` token — the
 * local IP the kernel would use to reach that target, i.e. this server's
 * own address on its default route. Exported separately so this is
 * unit-testable without a real subprocess.
 *
 * @param output - Raw stdout from `ip route get <target>`.
 * @returns The detected IPv4 address, or `null` if not found.
 */
export function parseDefaultRouteIp(output: string): string | null {
  const match = output.match(/\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})\b/);
  return match ? match[1]! : null;
}

/**
 * Detects this server's own LAN IP via its default route — no elevated
 * privileges needed, `ip route get` is a read-only query.
 *
 * @throws {Error} When the address couldn't be determined.
 */
export async function detectDefaultIp(): Promise<string> {
  const { stdout } = await execFileAsync('ip', ['route', 'get', '8.8.8.8']);
  const ip = parseDefaultRouteIp(stdout);
  if (!ip) throw new Error('Eigene IP konnte nicht ermittelt werden');
  return ip;
}

/** Result of a live DNS-resolution test against the local resolver. */
export interface DnsTestResult {
  success: boolean;
  resolvedIp: string | null;
  message: string;
}

/**
 * Queries the server's own `dnsmasq` instance directly (via `127.0.0.1`,
 * not whatever resolver this process would normally use) for the
 * configured domain, and checks whether it resolves to the expected IP —
 * so the first real test isn't a device at the door.
 *
 * @param domain - The configured Split-Horizon domain.
 * @param expectedIp - The configured target IP it should resolve to.
 */
export async function testDnsResolution(domain: string, expectedIp: string): Promise<DnsTestResult> {
  const resolver = new Resolver();
  resolver.setServers(['127.0.0.1']);
  try {
    const addresses = await resolver.resolve4(domain);
    const resolvedIp = addresses[0] ?? null;
    if (resolvedIp === expectedIp) {
      return { success: true, resolvedIp, message: `Löst korrekt auf ${resolvedIp} auf.` };
    }
    return { success: false, resolvedIp, message: `Löst auf ${resolvedIp ?? 'nichts'} auf, erwartet wurde ${expectedIp}.` };
  } catch (e) {
    return { success: false, resolvedIp: null, message: `Auflösung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` };
  }
}
