<script lang="ts">
  import { adminUser } from '$lib/stores/user';
</script>

<div class="page">
  <div class="page-header">
    <h1>Dashboard</h1>
  </div>
  <p class="muted">Willkommen, {$adminUser?.name}. Wähle links einen Bereich aus.</p>
</div>

<style>

</style>
