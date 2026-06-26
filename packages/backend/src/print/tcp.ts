/** Low-level TCP helpers for talking to ESC/POS network printers (port 9100 by default). */
import net from 'node:net';

/** Default timeout for printer TCP operations. */
const PRINTER_TIMEOUT_MS = 5_000;

/**
 * Opens a TCP connection, writes raw bytes to the printer, then closes the socket.
 *
 * @param ip - Printer IP address (IPv4 or hostname).
 * @param port - TCP port (ESC/POS default 9100).
 * @param data - Raw bytes to send.
 * @param timeoutMs - Hard timeout in milliseconds; the socket is destroyed when exceeded.
 * @returns Resolves once all bytes are written and the socket is closed; rejects on error or timeout.
 */
export function sendToPrinter(ip: string, port: number, data: Buffer, timeoutMs: number = PRINTER_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port }, () => {
      socket.write(data, (err) => {
        if (err) { reject(err); return; }
        socket.end();
        resolve();
      });
    });
    socket.once('error', reject);
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error(`Printer ${ip}:${port} timed out after ${timeoutMs}ms`));
    });
  });
}

/**
 * Probes whether the printer accepts a TCP connection. Used by the
 * online-status indicator in the admin printer list.
 *
 * @param ip - Printer IP address (IPv4 or hostname).
 * @param port - TCP port to probe.
 * @param timeoutMs - Hard timeout in milliseconds; treated as "offline" when exceeded.
 * @returns `true` on successful TCP connect, `false` on any error / timeout.
 */
export function probePrinter(ip: string, port: number, timeoutMs: number = 1_500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port });
    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}
