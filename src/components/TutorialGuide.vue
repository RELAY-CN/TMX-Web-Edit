<script setup lang="ts">
/**
 * 可选新手教程：用目标、操作、完成标志组织，便于新手按步骤检查。
 */
import { computed, ref, watch } from 'vue'
import { TUTORIAL_STEPS } from '@/game/tutorial'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const step = ref(0)
const current = computed(() => TUTORIAL_STEPS[step.value]!)
const isFirst = computed(() => step.value === 0)
const isLast = computed(() => step.value === TUTORIAL_STEPS.length - 1)

watch(
  () => props.open,
  (v) => {
    if (v) step.value = 0
  },
)

function prev() {
  if (!isFirst.value) step.value--
}
function next() {
  if (!isLast.value) step.value++
  else emit('close')
}
function jump(i: number) {
  step.value = i
}
</script>

<template>
  <div v-if="open" class="tutorial-backdrop" @click.self="emit('close')">
    <div class="tutorial-card" role="dialog" aria-label="新手教程">
      <header class="tut-head">
        <div>
          <h2>新手教程</h2>
          <p class="sub">可选引导 · 对照铁锈战争地图加载规则 · 随时可关</p>
        </div>
        <button class="close" title="关闭" @click="emit('close')">×</button>
      </header>

      <nav class="tut-steps">
        <button
          v-for="(s, i) in TUTORIAL_STEPS"
          :key="s.id"
          :class="{ active: i === step, done: i < step }"
          @click="jump(i)"
        >
          <span class="n">{{ i + 1 }}</span>
          {{ s.title }}
        </button>
      </nav>

      <section class="tut-body">
        <h3>{{ current.title }}</h3>
        <div class="guide-block goal">
          <strong>目标</strong>
          <p>{{ current.goal }}</p>
        </div>
        <div class="guide-block action">
          <strong>操作</strong>
          <p>{{ current.action }}</p>
        </div>
        <div class="guide-block checkpoint">
          <strong>完成标志</strong>
          <p>{{ current.checkpoint }}</p>
        </div>
        <ul>
          <li v-for="(line, i) in current.details" :key="i">{{ line }}</li>
        </ul>
        <p v-if="current.tip" class="tip">{{ current.tip }}</p>
      </section>

      <footer class="tut-foot">
        <button :disabled="isFirst" @click="prev">上一步</button>
        <span class="progress">{{ step + 1 }} / {{ TUTORIAL_STEPS.length }}</span>
        <button class="primary" @click="next">{{ isLast ? '完成' : '下一步' }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.tutorial-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.tutorial-card {
  width: min(640px, 100%);
  max-height: min(86vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--panel, #1e2430);
  border: 1px solid var(--border, #2e3648);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
.tut-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 10px;
  border-bottom: 1px solid var(--border, #2e3648);
}
.tut-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-dim, #8b93a7);
}
.close {
  border: none;
  background: transparent;
  color: var(--text-dim, #8b93a7);
  font-size: 22px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
}
.close:hover {
  color: #fff;
}
.tut-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border, #2e3648);
  background: var(--bg2, #161b24);
}
.tut-steps button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border, #2e3648);
  background: transparent;
  color: var(--text-dim, #8b93a7);
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 999px;
  cursor: pointer;
}
.tut-steps button .n {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--bg3, #252c3a);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}
.tut-steps button.active {
  color: #fff;
  border-color: var(--accent, #4f8cff);
  background: rgba(79, 140, 255, 0.15);
}
.tut-steps button.done .n {
  background: var(--ok, #3ecf8e);
  color: #0b1a12;
}
.tut-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px 8px;
}
.tut-body h3 {
  margin: 0 0 10px;
  font-size: 15px;
}
.guide-block {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
  align-items: start;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border, #2e3648);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.025);
}
.guide-block strong {
  color: var(--accent, #4f8cff);
  font-size: 12px;
}
.guide-block p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
.tut-body ul {
  margin: 12px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text, #d7dce8);
}
.tip {
  margin: 14px 0 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--accent, #4f8cff);
  background: rgba(79, 140, 255, 0.08);
  border-radius: 6px;
  border-left: 3px solid var(--accent, #4f8cff);
}
.tut-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border, #2e3648);
}
.progress {
  font-size: 12px;
  color: var(--text-dim, #8b93a7);
}
.primary {
  background: var(--accent, #4f8cff);
  color: #fff;
  border: none;
}
</style>
