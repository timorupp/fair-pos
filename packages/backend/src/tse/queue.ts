/**
 * Serialises all access to the physical TSE.
 *
 * The Swissbit TSE hardware can only process one command at a time and
 * rejects concurrent commands from multiple threads/processes (see
 * docs/TSE-Integration.md, section 5, quoting the vendor SDK docs verbatim).
 * Since our backend is the only process that ever talks to the TSE, a simple
 * in-process promise chain is enough — no external lock service needed.
 */

let chain: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` only after every previously enqueued TSE call has settled
 * (succeeded or failed), and before any later one starts.
 *
 * @param fn - The TSE operation to run once it's this call's turn.
 * @returns Whatever `fn` resolves with; rejects with whatever `fn` rejects with.
 */
export function enqueueTseCall<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn);
  // Swallow outcomes at the chain level so one failed call doesn't
  // permanently wedge the queue for everything queued after it.
  chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
