<script lang="ts">
  /**
   * Bonstorno (cross-receipt cancellation) admin page.
   *
   * Lets the administrator record returns at a chosen Bonkasse without
   * needing the original receipt: pick a register, a cancellation reason,
   * a list of articles with their returned quantity, and (optionally) a
   * note. The backend creates an invoice with `receipt_type='cancellation'`
   * whose total is automatically deducted from the day's cash balance.
   */
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { Register, CancellationReason, Article } from '@fairpos/shared';

  /** One line in the form — points at an article + count to cancel. */
  type FormLine = { article_id: string; quantity: number };

  let registers: Register[] = [];
  let reasons: CancellationReason[] = [];
  let articles: (Article & { category_name: string; tax_rate: number })[] = [];

  let registerId = '';
  let cancellationReasonId = '';
  let note = '';
  let lines: FormLine[] = [{ article_id: '', quantity: 1 }];

  let loading = true;
  let saving = false;
  let error = '';
  let success: { receipt_number: string; total: number } | null = null;
  /** Set when a configured TSE failed to sign the Bonstorno — it was still created, see docs/TSE-Integration.md. */
  let tseWarning: string | null = null;

  onMount(async () => {
    try {
      const [regs, raw, arts] = await Promise.all([
        api.admin.registers.list(),
        api.admin.cancellationReasons.list(),
        api.admin.articles.list(),
      ]);
      // Only Bonkassen — Bedienungskassen have their own in-flow cancellation path.
      registers = regs.filter((r) => r.type === 'receipt_register');
      // Only `cancellation` reasons; `free_of_charge` is a different booking and
      // would be confusing here.
      reasons = raw.filter((r) => r.booking_type === 'cancellation' && r.is_active);
      articles = arts.filter((a) => a.is_active);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  });

  /** Returns the unit gross price of the selected article (price + deposit), or 0. */
  function unitGross(articleId: string): number {
    const a = articles.find((x) => x.id === articleId);
    if (!a) return 0;
    return Number(a.price) + Number(a.deposit_price ?? 0);
  }

  /** Sum of all entered lines × their per-unit gross. */
  $: total = lines.reduce((sum, l) => sum + unitGross(l.article_id) * (l.quantity || 0), 0);

  /**
   * Adds an empty line row at the bottom of the form.
   */
  function addLine(): void { lines = [...lines, { article_id: '', quantity: 1 }]; }

  /**
   * Removes the line at the given index. Always keeps at least one row so
   * the form remains usable.
   */
  function removeLine(i: number): void {
    if (lines.length === 1) return;
    lines = lines.filter((_, idx) => idx !== i);
  }

  /**
   * Submits the cancellation. Validates that all rows have an article + a
   * positive integer quantity before calling the backend.
   */
  async function submit(): Promise<void> {
    error = ''; success = null; tseWarning = null;
    if (!registerId) { error = 'Bitte eine Kasse wählen.'; return; }
    if (!cancellationReasonId) { error = 'Bitte einen Stornogrund wählen.'; return; }
    const items = lines
      .filter((l) => l.article_id && l.quantity > 0)
      .map((l) => ({ article_id: l.article_id, quantity: Math.floor(l.quantity) }));
    if (items.length === 0) { error = 'Mindestens eine Position mit Menge > 0.'; return; }

    saving = true;
    try {
      const trimmedNote = note.trim();
      const result = await api.admin.cancellations.create({
        register_id: registerId,
        cancellation_reason_id: cancellationReasonId,
        items,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      success = { receipt_number: result.receipt_number_formatted, total };
      tseWarning = result.tse_warning;
      // Reset for the next cancellation.
      lines = [{ article_id: '', quantity: 1 }];
      note = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      saving = false;
    }
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2 });
</script>

<div class="page">
  <h1>Bonstorno</h1>
  <p class="muted">
    Erfasst Rückgaben an einer Bonkasse als eigenständigen Stornobeleg. Die
    Mengen sind positiv — der erzeugte Beleg gilt als Stornorechnung und
    reduziert automatisch den Kassen-Bar-Bestand des laufenden Tages.
  </p>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else}
    <div class="form">
      <div class="field">
        <label for="reg">Kasse</label>
        <select id="reg" bind:value={registerId} disabled={saving}>
          <option value="">— bitte wählen —</option>
          {#each registers as r}
            <option value={r.id}>{r.name}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="reason">Stornogrund</label>
        <select id="reason" bind:value={cancellationReasonId} disabled={saving}>
          <option value="">— bitte wählen —</option>
          {#each reasons as r}
            <option value={r.id}>{r.name}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="note">Notiz (optional)</label>
        <input id="note" type="text" bind:value={note} disabled={saving} placeholder="z.B. Belegnummer der Originalrechnung" />
      </div>

      <h2 class="section-title">Positionen</h2>
      <table class="lines">
        <thead>
          <tr>
            <th>Artikel</th>
            <th class="num">Menge</th>
            <th class="num">Einzelpreis</th>
            <th class="num">Zeilensumme</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each lines as line, i}
            <tr>
              <td>
                <select bind:value={line.article_id} disabled={saving}>
                  <option value="">— Artikel wählen —</option>
                  {#each articles as a}
                    <option value={a.id}>{a.name}</option>
                  {/each}
                </select>
              </td>
              <td class="num">
                <input type="number" min="1" step="1" bind:value={line.quantity} disabled={saving} />
              </td>
              <td class="num">{fmt(unitGross(line.article_id))} €</td>
              <td class="num">{fmt(unitGross(line.article_id) * (line.quantity || 0))} €</td>
              <td>
                <button class="btn-ghost" type="button" on:click={() => removeLine(i)} disabled={lines.length === 1 || saving}>−</button>
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="num"><strong>Summe</strong></td>
            <td class="num"><strong>{fmt(total)} €</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <button class="btn-ghost" type="button" on:click={addLine} disabled={saving}>+ Position</button>

      <div class="actions">
        <button class="btn-primary" type="button" on:click={submit} disabled={saving}>
          {saving ? 'Erfasse…' : 'Stornobeleg erstellen'}
        </button>
      </div>

      {#if error}<p class="error-text">{error}</p>{/if}
      {#if success}
        <p class="success-text">
          ✓ Stornobeleg Nr. {success.receipt_number} erstellt — Summe {fmt(success.total)} € wurde
          vom Tages-Bar-Bestand abgezogen.
        </p>
      {/if}
      {#if tseWarning}<p class="warning-text">⚠ {tseWarning}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .form { max-width: 800px; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 1rem; max-width: 480px; }
  .field label { font-size: 0.85rem; color: var(--color-text-muted); }
  .field select, .field input { padding: 0.45rem 0.6rem; }
  .section-title { margin-top: 1.5rem; }
  table.lines { width: 100%; margin-bottom: 0.5rem; }
  table.lines td, table.lines th { padding: 0.4rem 0.5rem; }
  table.lines select { width: 100%; padding: 0.35rem; }
  table.lines input[type=number] { width: 6rem; padding: 0.35rem; text-align: right; }
  .actions { margin-top: 1.25rem; }
  .error-text { color: var(--color-danger); margin-top: 0.75rem; }
  .success-text { color: #4caf7d; margin-top: 0.75rem; }
  .warning-text { color: #f59e0b; margin-top: 0.75rem; font-weight: 600; }
</style>
