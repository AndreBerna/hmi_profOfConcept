<template>
  <div class="app-shell">
    <HmiDashboard />
  </div>
</template>

<script setup lang="ts">
import HmiDashboard from './components/HmiDashboard.vue';
</script>

<style scoped>
.app-shell {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  background: radial-gradient(circle at top, #1a1f2b, #0d111a 65%);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
