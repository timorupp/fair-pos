<script lang="ts">
  import { currentUser } from '$lib/stores/user';
</script>

<div class="page">
  <div class="page-header">
    <h1>Dashboard</h1>
  </div>
  <p class="muted">Willkommen, {$currentUser?.name}. Wähle links einen Bereich aus.</p>
</div>

<style>

</style>
