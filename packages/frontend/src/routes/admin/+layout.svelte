<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { adminUser } from '$lib/stores/user';
  import { api } from '$lib/api';

  /** Whether the layout is still verifying the admin session on first load. */
  let checking = true;

  /** Pending-Z-Bon summary, refreshed on mount and on route change. */
  let pendingSummary: { total_pending_registers: number; total_pending_days: number } | null = null;
  let pendingRefreshTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Loads the pending-Z-Bon summary so the global warning banner can show
   * how many days/registers are awaiting an Abschluss. Silent on errors —
   * the banner simply hides if the call fails.
   */
  async function loadPending() {
    try { pendingSummary = await api.admin.closings.pending(); }
    catch { pendingSummary = null; }
  }

  onMount(async () => {
    // Verify the admin session BEFORE rendering any sidebar items — otherwise
    // an unauthenticated visitor would briefly see the admin shell.
    try {
      const user = await api.auth.admin.me();
      adminUser.set(user);
    } catch {
      adminUser.set(null);
      goto('/login');
      return;
    } finally {
      checking = false;
    }
    loadPending();
    // Auto-refresh every 5 minutes so a freshly arrived day pushes into the banner.
    pendingRefreshTimer = setInterval(loadPending, 5 * 60 * 1000);
  });

  onDestroy(() => { if (pendingRefreshTimer) clearInterval(pendingRefreshTimer); });

  // Re-check whenever the URL changes (e.g. operator went through "Alle Ausstehenden abschließen").
  $: $page.url.pathname, loadPending();

  /** Whether a path is the active route (exact or prefix match). */
  function isActive(href: string, exact = false): boolean {
    return exact
      ? $page.url.pathname === href
      : $page.url.pathname.startsWith(href);
  }

  /** Whether any sub-item of a group is currently active. */
  function groupActive(hrefs: string[]): boolean {
    return hrefs.some((h) => $page.url.pathname.startsWith(h));
  }

  /** Sidebar groups — auto-expanded when one of their items is the active route. */
  let reportsOpen = false;
  let exportsOpen = false;
  let articlesOpen = false;
  let registersOpen = false;
  let settingsOpen = false;

  $: reportsOpen = groupActive(['/admin/reports']);
  $: exportsOpen = groupActive(['/admin/exports']);
  $: articlesOpen = groupActive([
    '/admin/events',
    '/admin/settings/floor-plan',
    '/admin/settings/categories',
    '/admin/articles',
    '/admin/settings/cancellation-reasons',
  ]);
  $: registersOpen = groupActive([
    '/admin/settings/layouts',
    '/admin/registers',
    '/admin/cancellations',
    '/admin/users',
  ]);
  $: settingsOpen = groupActive([
    '/admin/settings/company',
    '/admin/settings/print-queue',
    '/admin/settings/printers',
    '/admin/settings/system',
  ]);

  /** Clears only the admin session cookie; a parallel register session remains intact. */
  async function logout() {
    await api.auth.admin.logout();
    adminUser.set(null);
    goto('/login');
  }
</script>

<svelte:head><title>POS-Administration — FairPOS</title></svelte:head>

{#if checking}
  <div class="checking">Prüfe Sitzung…</div>
{:else}
<div class="shell">
  <aside>
    <div class="brand">FairPOS</div>
    <nav>
      <a href="/admin" class:active={isActive('/admin', true)}>Dashboard</a>

      <div class="nav-group">
        <button class="nav-group-btn" class:active={reportsOpen} on:click={() => (reportsOpen = !reportsOpen)}>
          <span>Auswertungen</span>
          <span class="chevron" class:open={reportsOpen}>›</span>
        </button>
        {#if reportsOpen}
          <div class="nav-sub">
            <a href="/admin/reports/open-positions" class:active={isActive('/admin/reports/open-positions')}>Offene Positionen</a>
            <a href="/admin/reports/invoices" class:active={isActive('/admin/reports/invoices')}>Rechnungen</a>
            <a href="/admin/reports/cash-balance" class:active={isActive('/admin/reports/cash-balance')}>Soll-Kassenstand</a>
            <a href="/admin/reports/cancellations" class:active={isActive('/admin/reports/cancellations')}>Stornos & Rabatte</a>
          </div>
        {/if}
      </div>

      <div class="nav-group">
        <button class="nav-group-btn" class:active={exportsOpen} on:click={() => (exportsOpen = !exportsOpen)}>
          <span>Exporte</span>
          <span class="chevron" class:open={exportsOpen}>›</span>
        </button>
        {#if exportsOpen}
          <div class="nav-sub">
            <a href="/admin/exports/excel" class:active={isActive('/admin/exports/excel')}>Excel-Export</a>
            <a href="/admin/exports/invoices" class:active={isActive('/admin/exports/invoices')}>Rechnungs-PDFs (ZIP)</a>
            <a href="/admin/exports/dsfinvk" class:active={isActive('/admin/exports/dsfinvk')}>DSFinV-K</a>
          </div>
        {/if}
      </div>

      <div class="nav-group">
        <button class="nav-group-btn" class:active={articlesOpen} on:click={() => (articlesOpen = !articlesOpen)}>
          <span>Artikel &amp; Saalplan</span>
          <span class="chevron" class:open={articlesOpen}>›</span>
        </button>
        {#if articlesOpen}
          <div class="nav-sub">
            <a href="/admin/events" class:active={isActive('/admin/events')}>Veranstaltungen</a>
            <a href="/admin/settings/floor-plan" class:active={isActive('/admin/settings/floor-plan')}>Saalplan</a>
            <a href="/admin/settings/categories" class:active={isActive('/admin/settings/categories')}>Artikelgruppen</a>
            <a href="/admin/articles" class:active={isActive('/admin/articles')}>Artikel</a>
            <a href="/admin/settings/cancellation-reasons" class:active={isActive('/admin/settings/cancellation-reasons')}>Stornogründe</a>
          </div>
        {/if}
      </div>

      <div class="nav-group">
        <button class="nav-group-btn" class:active={registersOpen} on:click={() => (registersOpen = !registersOpen)}>
          <span>Kassen &amp; Benutzer</span>
          <span class="chevron" class:open={registersOpen}>›</span>
        </button>
        {#if registersOpen}
          <div class="nav-sub">
            <a href="/admin/settings/layouts" class:active={isActive('/admin/settings/layouts')}>Kassenlayouts</a>
            <a href="/admin/registers" class:active={isActive('/admin/registers')}>Kassen</a>
            <a href="/admin/cancellations" class:active={isActive('/admin/cancellations')}>Bonstorno</a>
            <a href="/admin/users" class:active={isActive('/admin/users')}>Benutzer</a>
          </div>
        {/if}
      </div>

      <div class="nav-group">
        <button class="nav-group-btn" class:active={settingsOpen} on:click={() => (settingsOpen = !settingsOpen)}>
          <span>Einstellungen</span>
          <span class="chevron" class:open={settingsOpen}>›</span>
        </button>
        {#if settingsOpen}
          <div class="nav-sub">
            <a href="/admin/settings/company" class:active={isActive('/admin/settings/company')}>Unternehmensdaten</a>
            <a href="/admin/settings/print-queue" class:active={isActive('/admin/settings/print-queue')}>Druckwarteschlange</a>
            <a href="/admin/settings/printers" class:active={isActive('/admin/settings/printers')}>Drucker</a>
            <a href="/admin/settings/tse" class:active={isActive('/admin/settings/tse')}>TSE</a>
            <a href="/admin/settings/system" class:active={isActive('/admin/settings/system')}>System</a>
          </div>
        {/if}
      </div>
    </nav>

    <div class="sidebar-footer">
      <span class="user-name">{$adminUser?.name}</span>
      <button class="btn-logout" on:click={logout}>Abmelden</button>
    </div>
  </aside>

  <main>
    {#if pendingSummary && pendingSummary.total_pending_registers > 0}
      <a class="closing-banner" href="/admin/registers">
        <strong>⚠ {pendingSummary.total_pending_days} Tagesabschluss{pendingSummary.total_pending_days === 1 ? '' : '/üsse'} ausstehend</strong>
        ({pendingSummary.total_pending_registers} Kasse{pendingSummary.total_pending_registers === 1 ? '' : 'n'} gesperrt)
        — bitte nachholen, damit weiter kassiert werden kann.
      </a>
    {/if}
    <slot />
  </main>
</div>
{/if}

<style>
  .shell { display: flex; min-height: 100dvh; }

  aside {
    width: 210px; flex-shrink: 0;
    background: var(--color-surface); border-right: 1px solid var(--color-border);
    display: flex; flex-direction: column; padding: 1.25rem 0;
  }

  .brand {
    font-size: 1rem; font-weight: 700; color: var(--color-primary);
    letter-spacing: -0.02em; padding: 0 1.25rem 1.25rem;
    border-bottom: 1px solid var(--color-border); margin-bottom: 0.5rem;
  }

  nav { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 0 0.5rem; overflow-y: auto; }

  nav > a {
    display: block; padding: 0.6rem 0.75rem; border-radius: var(--radius-sm);
    color: var(--color-text-muted); text-decoration: none; font-size: 0.875rem;
    transition: background 0.1s, color 0.1s;
  }
  nav > a:hover { background: var(--color-surface-2); color: var(--color-text); }
  nav > a.active { background: rgba(79,124,255,0.12); color: var(--color-primary); font-weight: 500; }


  .nav-group { display: flex; flex-direction: column; }

  .nav-group-btn {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.6rem 0.75rem; border-radius: var(--radius-sm); border: none;
    background: transparent; color: var(--color-text-muted); font-size: 0.875rem;
    cursor: pointer; transition: background 0.1s, color 0.1s; width: 100%; text-align: left;
  }
  .nav-group-btn:hover { background: var(--color-surface-2); color: var(--color-text); }
  .nav-group-btn.active { color: var(--color-text); }

  .chevron { font-size: 1rem; transition: transform 0.15s; display: inline-block; }
  .chevron.open { transform: rotate(90deg); }

  .nav-sub { display: flex; flex-direction: column; gap: 1px; padding-left: 0.5rem; }
  .nav-sub a {
    display: block; padding: 0.45rem 0.75rem; border-radius: var(--radius-sm);
    color: var(--color-text-muted); text-decoration: none; font-size: 0.825rem;
    transition: background 0.1s, color 0.1s;
  }
  .nav-sub a:hover { background: var(--color-surface-2); color: var(--color-text); }
  .nav-sub a.active { color: var(--color-primary); font-weight: 500; }

  .sidebar-footer {
    padding: 1rem 1.25rem 0; border-top: 1px solid var(--color-border);
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  .user-name { font-size: 0.8rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn-logout {
    padding: 0.4rem 0; background: transparent; border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); color: var(--color-text-muted); font-size: 0.8rem;
    transition: border-color 0.15s, color 0.15s;
  }
  .btn-logout:hover { border-color: var(--color-danger); color: var(--color-danger); }

  main { flex: 1; padding: 2rem; overflow: auto; }

  /* ── Shared admin page styles (global so child routes can use them) ── */
  :global(.page) { display: flex; flex-direction: column; gap: 1.5rem; }
  :global(.page-header) { display: flex; align-items: center; justify-content: space-between; }
  :global(.page-header h1) { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.02em; }

  :global(table) { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  :global(thead th) {
    text-align: left; padding: 0.6rem 0.75rem; font-size: 0.75rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--color-text-muted); border-bottom: 1px solid var(--color-border);
  }
  :global(tbody tr) { border-bottom: 1px solid var(--color-border); transition: background 0.1s; }
  :global(tbody tr:hover) { background: var(--color-surface-2); }
  :global(tbody td) { padding: 0.75rem; vertical-align: middle; }
  :global(.num) { text-align: right; font-variant-numeric: tabular-nums; }
  :global(.actions) { text-align: right; white-space: nowrap; }
  :global(.muted) { color: var(--color-text-muted); font-size: 0.9rem; }
  :global(.spacer) { flex: 1; }

  :global(.error-text) {
    color: var(--color-danger); font-size: 0.875rem; padding: 0.5rem 0.75rem;
    background: rgba(255,79,79,0.08); border: 1px solid rgba(255,79,79,0.25);
    border-radius: var(--radius-sm);
  }

  :global(.btn-primary) {
    padding: 0.5rem 1rem; background: var(--color-primary); border: none;
    border-radius: var(--radius-sm); color: #fff; font-size: 0.875rem;
    font-weight: 500; transition: background 0.15s;
  }
  :global(.btn-primary:hover) { background: var(--color-primary-hover); }
  :global(.btn-primary:disabled) { opacity: 0.5; cursor: not-allowed; }

  :global(.btn-ghost) {
    padding: 0.35rem 0.65rem; background: transparent; border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); color: var(--color-text-muted); font-size: 0.8rem;
    transition: border-color 0.15s, color 0.15s;
  }
  :global(.btn-ghost:hover) { border-color: var(--color-text-muted); color: var(--color-text); }
  :global(.btn-ghost.danger:hover) { border-color: var(--color-danger); color: var(--color-danger); }
  :global(.btn-ghost:disabled) { opacity: 0.5; cursor: not-allowed; }

  :global(.field) { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.75rem; }
  :global(.field label) {
    font-size: 0.75rem; font-weight: 500; color: var(--color-text-muted);
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  :global(.field input), :global(.field select) {
    padding: 0.6rem 0.75rem; background: var(--color-surface-2);
    border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    color: var(--color-text); font-size: 0.9rem; width: 100%;
    outline: none; transition: border-color 0.15s;
  }
  :global(.field input:focus), :global(.field select:focus) { border-color: var(--color-primary); }
  :global(.field input:disabled), :global(.field select:disabled) { opacity: 0.5; }

  :global(.field-check) { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
  :global(.field-check label) { font-size: 0.9rem; color: var(--color-text); cursor: pointer; }

  :global(.modal-actions) { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }

  /* Pending-Z-Bon warning banner — bright amber, full width of the main content area. */
  .closing-banner {
    display: block;
    background: #f59e0b22;
    border: 1px solid #f59e0b88;
    color: var(--color-text);
    padding: 0.75rem 1.25rem;
    border-radius: var(--radius);
    margin-bottom: 1rem;
    font-size: 0.9rem;
    text-decoration: none;
    transition: background 0.1s;
  }
  .closing-banner:hover { background: #f59e0b33; }
  .closing-banner strong { color: #c87a00; }
  .checking { display: flex; align-items: center; justify-content: center; min-height: 100dvh; color: var(--color-text-muted); }
</style>
