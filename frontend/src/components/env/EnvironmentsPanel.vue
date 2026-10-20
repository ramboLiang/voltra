<script setup lang="ts">
// 环境面板：环境选择/新建/重命名/删除 + 三级变量表（环境级 / 项目级 / 全局）
// 变量行在 VarTable 中原地编辑；敏感值 password 打码、可点眼切换
import { computed, ref } from 'vue'
import { Plus, Trash2, Pencil, Upload, Download, PanelRightOpen } from 'lucide-vue-next'
import EmptyState from '../common/EmptyState.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import PromptDialog from '../common/PromptDialog.vue'
import {
  env,
  currentEnv,
  setCurrentEnv,
  addEnvToProject,
  renameEnv,
  removeEnvFromProject,
} from '../../stores/env'
import { currentProject } from '../../stores/workspace'
import { openVarPage } from '../../stores/ui-state'
import { StorageService } from '../../api/backend'
import { settings } from '../../stores/settings'
import { parsePostmanEnvironment } from '../../lib/postman'
import { exportPostmanEnvironments } from '../../lib/postman-export'
import { scheduleSave } from '../../lib/persist'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())
const p = computed(() => currentProject.value)

function commit() {
  const pr = p.value
  if (pr) pr.updatedAt = Date.now()
  scheduleSave('projects')
}

const showNewEnv = ref(false)
function onAddEnv() {
  showNewEnv.value = true
}
function confirmNewEnv(name: string) {
  showNewEnv.value = false
  const e = addEnvToProject(name)
  if (e) env.currentEnvId = e.id
}

// 重命名（双击进入）
const renamingId = ref<string | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)
const renameText = computed({
  get: () => currentEnv.value?.name ?? '',
  set: (v) => {
    if (currentEnv.value) renameEnv(currentEnv.value.id, v)
  },
})
function startRename() {
  if (currentEnv.value) {
    renamingId.value = currentEnv.value.id
    setTimeout(() => renameInput.value?.select(), 0)
  }
}
function endRename() {
  renamingId.value = null
  commit()
}

function onRemoveEnv() {
  if (currentEnv.value) envToDelete.value = currentEnv.value.id
}

// ---------- Postman 环境导入 / 导出 ----------
const envError = ref<string | null>(null)
// 删除环境需确认（不可恢复：环境里的变量一起没）
const envToDelete = ref<string | null>(null)
function doRemoveEnv() {
  const id = envToDelete.value
  envToDelete.value = null
  if (id) removeEnvFromProject(id)
}

async function onImportEnv() {
  const pr = p.value
  if (!pr) return
  try {
    const path = await StorageService.PickFile()
    if (!path) return
    const text = await StorageService.ReadFileBounded(path, settings.importLimitMB * 1024 * 1024)
    const r = parsePostmanEnvironment(text)
    if (!r.ok) {
      envError.value = r.error
      return
    }
    // 同名环境覆盖变量，否则新增；globals 并入全局变量（已有 key 不覆盖）
    for (const e of r.environments) {
      const hit = pr.environments.find((x) => x.name === e.name)
      if (hit) hit.variables = e.variables
      else pr.environments.push(e)
    }
    if (r.globals.length) {
      for (const g of r.globals) {
        if (!env.globalVars.some((x) => x.key === g.key)) env.globalVars.push(g)
      }
      scheduleSave('env')
    }
    commit()
  } catch (e) {
    envError.value = String(e)
  }
}

async function onExportEnv() {
  const pr = p.value
  if (!pr) return
  await StorageService.SaveFile('voltra-environments.json', exportPostmanEnvironments(pr.environments, env.globalVars))
}
</script>

<template>
  <div class="ep">
    <template v-if="!p">
      <EmptyState :title="L.env.empty" :hint="L.tree.noProjectHint" />
    </template>
    <template v-else-if="p.environments.length === 0">
      <EmptyState :title="L.env.empty">
        <template #actions>
          <button class="btn btn-primary" @click="onAddEnv">
            <Plus :size="13" /> {{ L.dialog.envNew }}
          </button>
        </template>
      </EmptyState>
    </template>
    <template v-else>
      <!-- 环境选择行 -->
      <div class="ep-row">
        <input
          v-if="renamingId"
          ref="renameInput"
          v-model="renameText"
          class="input ep-rename"
          @blur="endRename"
          @keyup.enter="endRename"
          @keyup.esc="renamingId = null"
        />
        <button v-else class="ep-env-name" @dblclick="startRename">
          {{ currentEnv?.name ?? L.env.noEnv }}
        </button>
        <button v-if="currentEnv" class="ep-act" :title="L.common.rename" @dblclick="startRename">
          <Pencil :size="14" />
        </button>
        <button v-if="currentEnv" class="ep-act" :title="L.common.delete" @click="onRemoveEnv">
          <Trash2 :size="14" />
        </button>
        <button class="ep-act" :title="L.dialog.envNew" @click="onAddEnv">
          <Plus :size="14" />
        </button>
        <button class="ep-act" :title="L.env.importEnv" @click="onImportEnv">
          <Upload :size="14" />
        </button>
        <button class="ep-act" :title="L.env.exportEnv" @click="onExportEnv">
          <Download :size="14" />
        </button>
      </div>

      <!-- 环境下拉（切换） -->
      <div class="ep-select">
        <select class="input ep-select-el" :value="env.currentEnvId ?? ''" @change="setCurrentEnv(($event.target as HTMLSelectElement).value || null)">
          <option value="">{{ L.env.noEnv }}</option>
          <option v-for="e in p.environments" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </div>

      <!-- 变量编辑：侧栏 240–480px 塞不下 键/初始值/当前值/启用 四列表格，
           整页在编辑区打开（用户实测反馈"还是很挤"） -->
      <div class="ep-page">
        <!-- 无环境时禁用（不隐藏，避免页面空置）：环境级变量此时不可编辑，整页只会有空的环境区 -->
        <button class="ep-openpage" :disabled="!currentEnv" @click="openVarPage()">
          <PanelRightOpen :size="15" />
          <span>{{ L.env.editInPage }}</span>
        </button>
        <p class="ep-page-hint">
          {{ L.env.vars }} · {{ L.env.projectVars }}（{{ p.variables.length }}） · {{ L.env.globalVars }}（{{ env.globalVars.length }}）
        </p>
      </div>

      <ConfirmDialog
        v-if="envError"
        :title="L.dialog.importFailed"
        :message="envError"
        @confirm="envError = null"
        @cancel="envError = null"
      />

      <ConfirmDialog
        v-if="envToDelete"
        :title="L.common.confirmDelete"
        :message="L.dialog.envDeleteConfirm"
        :danger="true"
        @confirm="doRemoveEnv"
        @cancel="envToDelete = null"
      />

      <PromptDialog
        v-if="showNewEnv"
        :title="L.dialog.envNew"
        :placeholder="L.dialog.envNewPlaceholder"
        @confirm="confirmNewEnv"
        @cancel="showNewEnv = false"
      />
    </template>
  </div>
</template>

<style scoped>
.ep {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.ep-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px 6px;
}
.ep-env-name {
  flex: 1;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  cursor: default;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-rename {
  flex: 1;
  height: 24px;
  font-size: 12px;
}
.ep-act {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  flex-shrink: 0;
}
.ep-act:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.ep-select {
  padding: 0 8px 10px;
}
.ep-select-el {
  width: 100%;
  height: 26px;
  font-size: 12px;
}
/* 变量编辑入口：侧栏只留导航，表格移入整页 */
.ep-page {
  border-top: 1px solid var(--border);
  padding: 10px 8px;
}
.ep-openpage {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 34px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-elev);
  color: var(--brand);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ease);
}
.ep-openpage:hover {
  background: var(--brand-weak);
  border-color: var(--brand);
}
.ep-openpage:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ep-openpage:disabled:hover {
  background: var(--bg-elev);
  border-color: var(--border-strong);
}
.ep-page-hint {
  margin: 8px 2px 0;
  font-size: 11px;
  color: var(--text-faint);
  line-height: 1.5;
}
</style>
