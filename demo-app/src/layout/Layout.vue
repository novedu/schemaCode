<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import Header from './Header.vue'
import DebugDrawer from '@/components/DebugDrawer.vue'
</script>

<template>
  <div class="layout">
    <Sidebar />
    <div class="layout-main">
      <Header />
      <main class="layout-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
    <DebugDrawer />
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
.layout-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.layout-content {
  flex: 1;
  overflow: auto;
  background: #f5f7fa;
  padding: 20px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
