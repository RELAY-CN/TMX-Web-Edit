<script setup lang="ts">
/**
 * 校验面板：列出地图问题，点击可跳转到对应图层/对象/格子。
 */
import { computed } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { validateMap, type ValidationIssue } from '@/game/validation'
import { isObjectGroup } from '@/tmx/types'

const emit = defineEmits<{
  close: []
  jumpTile: [x: number, y: number]
}>()

const store = useEditorStore()

const issues = computed(() => {
  void store.structRev
  void store.rev
  return validateMap(store.map)
})

const errors = computed(() => issues.value.filter((i) => i.severity === 'error'))
const warns = computed(() => issues.value.filter((i) => i.severity === 'warn'))

function jump(issue: ValidationIssue) {
  if (issue.layerIndex !== undefined) {
    const m = store.map
    if (m) {
      const layer = m.layers[issue.layerIndex]
      if (layer && isObjectGroup(layer)) {
        store.activeObjectGroupIndex = issue.layerIndex
        store.tool = 'object'
        if (issue.objectId !== undefined) store.selectedObjectId = issue.objectId
      } else {
        store.activeLayerIndex = issue.layerIndex
      }
    }
  }
  if (issue.tileX !== undefined && issue.tileY !== undefined) {
    emit('jumpTile', issue.tileX, issue.tileY)
  }
  emit('close')
}
</script>

<template>
  <div class="dialog-mask" @click.self="emit('close')">
    <div class="dialog" style="min-width: 440px">
      <div class="dialog-header">
        地图校验
        <span class="counts">
          <span v-if="errors.length" class="err">{{ errors.length }} 错误</span>
          <span v-if="warns.length" class="warn">{{ warns.length }} 警告</span>
          <span v-if="!issues.length" class="ok">全部通过</span>
        </span>
      </div>
      <div class="dialog-body scroll">
        <div v-if="!issues.length" class="empty-ok">地图满足游戏基本要求 ✓</div>
        <button
          v-for="issue in issues"
          :key="issue.id"
          class="issue"
          :class="issue.severity"
          @click="jump(issue)"
        >
          <span class="sev">{{ issue.severity === 'error' ? '错误' : issue.severity === 'warn' ? '警告' : '提示' }}</span>
          <span class="msg">{{ issue.message }}</span>
          <span v-if="issue.tileX !== undefined" class="loc">→ {{ issue.tileX }},{{ issue.tileY }}</span>
        </button>
      </div>
      <div class="dialog-footer">
        <button class="primary" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.counts {
  margin-left: auto;
  display: flex;
  gap: 10px;
  font-size: 12px;
  font-weight: 500;
}
.counts .err {
  color: var(--danger);
}
.counts .warn {
  color: var(--warn);
}
.counts .ok {
  color: var(--ok);
}
.empty-ok {
  text-align: center;
  color: var(--ok);
  padding: 24px;
}
.issue {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  text-align: left;
  margin-bottom: 6px;
  padding: 8px 10px;
  border-left: 3px solid transparent;
}
.issue.error {
  border-left-color: var(--danger);
  background: #2a1818;
}
.issue.warn {
  border-left-color: var(--warn);
  background: #2a2418;
}
.sev {
  font-size: 11px;
  min-width: 32px;
  color: var(--text-dim);
}
.msg {
  flex: 1;
  font-size: 12.5px;
}
.loc {
  font-size: 11px;
  color: var(--accent);
}
</style>
