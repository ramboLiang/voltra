<script setup lang="ts">
// 顶栏：Logo · 项目下拉 · 环境下拉 · 主题 · 设置 · 窗口控制（最小化/最大化/关闭）
// 无边框窗口：整条顶栏是可拖拽区（--wails-draggable），双键点击切换最大化；
// 内部所有按钮/输入框显式 no-drag，避免按下按钮时拖动窗口
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Zap, ChevronDown, Plus, Trash2, Pencil, Settings, Sun, Moon, Monitor, Layers, Minus, Square, Copy, X, ZoomIn, RotateCcw } from 'lucide-vue-next'
import { Window, Events } from '@wailsio/runtime'
import { zoomPercent, setZoom, resetZoom } from '../../lib/zoom'
import Dropdown from '../common/Dropdown.vue'
import Modal from '../common/Modal.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import PromptDialog from '../common/PromptDialog.vue'
import {
  workspace,
  currentProject,
  addProject,
  removeProject,
  renameProject,
  setCurrentProject,
  findRequest,
} from '../../stores/workspace'
import {
  env,
  currentEnv,
  setCurrentEnv,
  addEnvToProject,
  renameEnv,
  removeEnvFromProject,
} from '../../stores/env'
import { tabs } from '../../stores/tabs'
import { settings, setSettings } from '../../stores/settings'
import { activePanel } from '../../stores/ui-state'
import { flushAll } from '../../lib/persist'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())
const duplicateProjectName = computed(() => {
  const n = newProjectName.value.trim()
  return !!n && workspace.projects.some((p) => p.name.trim() === n)
})

// 新建项目
const showNewProject = ref(false)
const newProjectName = ref('')
// 新建项目：已有同名项目时不开第二个（否则项目下拉里两个同名项，只能靠 id 区分）
function confirmNewProject() {
  const name = newProjectName.value.trim()
  if (!name) return
  if (workspace.projects.some((p) => p.name.trim() === name)) return
  const p = addProject(name)
  setCurrentProject(p.id)
  showNewProject.value = false
  newProjectName.value = ''
}

// 重命名当前项目（弹窗）
const showRenameProject = ref(false)
function confirmRenameProject(name: string) {
  const p = currentProject.value
  if (!p) return
  renameProject(p.id, name)
  showRenameProject.value = false
}

// 删除当前项目
const confirmDeleteProject = ref(false)
function doDeleteProject() {
  const p = currentProject.value
  confirmDeleteProject.value = false
  if (!p) return
  // 关闭属于该项目、且已不在树中的标签（未保存的标签保留）
  for (const tab of [...tabs.tabs]) {
    const inTree = findRequest(tab.request.id)
    if (inTree && inTree.project.id === p.id) {
      const idx = tabs.tabs.indexOf(tab)
      tabs.tabs.splice(idx, 1)
      if (tabs.activeTabId === tab.tabId) {
        tabs.activeTabId = tabs.tabs[0]?.tabId ?? null
      }
    }
  }
  env.currentEnvId = null
  removeProject(p.id)
}

// ---------- 环境下拉：新建（弹窗）/ 改名（弹窗）/ 删除（确认） ----------
const envPrompt = ref<{ mode: 'new' | 'rename'; envId?: string; initialValue?: string } | null>(null)
const envToDelete = ref<string | null>(null)

function openNewEnv() {
  envPrompt.value = { mode: 'new' }
}
function openRenameEnv(id: string, name: string) {
  envPrompt.value = { mode: 'rename', envId: id, initialValue: name }
}
function confirmEnvPrompt(name: string) {
  const p = envPrompt.value
  envPrompt.value = null
  if (!p) return
  if (p.mode === 'new') {
    const e = addEnvToProject(name)
    if (e) setCurrentEnv(e.id)
  } else if (p.envId) {
    renameEnv(p.envId, name)
  }
}
function askDeleteEnv(id: string) {
  envToDelete.value = id
}
function doDeleteEnv() {
  const id = envToDelete.value
  envToDelete.value = null
  if (id) removeEnvFromProject(id)
}

const themeOptions = [
  { value: 'light', label: L.value.titleBar.themeLight, icon: Sun },
  { value: 'dark', label: L.value.titleBar.themeDark, icon: Moon },
  { value: 'system', label: L.value.titleBar.themeSystem, icon: Monitor },
]
const themeIcon = computed(() => {
  const map: Record<string, typeof Sun> = { light: Sun, dark: Moon, system: Monitor }
  return map[currentTheme.value] ?? Monitor
})
const currentTheme = ref<'light' | 'dark' | 'system'>('system')
watch(() => settings.theme, (v) => (currentTheme.value = v), { immediate: true })

function onThemeChange(value: string) {
  setSettings({ theme: value as 'light' | 'dark' | 'system' })
}

const projectName = computed(() => currentProject.value?.name ?? L.value.titleBar.noProject)

// ---------- 窗口控制（frameless 自绘） ----------
const maximised = ref(false)
const unsubs: Array<() => void> = []
onMounted(() => {
  unsubs.push(
    Events.On('common:WindowMaximise', () => (maximised.value = true)),
    Events.On('common:WindowUnMaximise', () => (maximised.value = false)),
  )
  void Window.IsMaximised().then((v) => (maximised.value = !!v)).catch(() => {})
})
onBeforeUnmount(() => unsubs.forEach((off) => off()))

function onMinimise() {
  void Window.Minimise()
}
function onToggleMaximise() {
  void Window.ToggleMaximise()
}
async function onClose() {
  // 关闭前把防抖中的脏数据立即落盘，避免丢最近 500ms 的编辑
  try {
    await flushAll()
  } finally {
    void Window.Close()
  }
}
</script>

<template>
  <header class="titlebar">
    <div class="logo">
      <Zap :size="15" />
      <span>{{ L.app.name }}</span>
    </div>

    <!-- 项目下拉 -->
    <Dropdown>
      <template #trigger="{ open }">
        <button :class="['tb-select', { open }]">
          <span class="tb-select-label" :title="projectName">{{ projectName }}</span>
          <ChevronDown :size="13" />
        </button>
      </template>
      <template #default="{ close }">
        <div class="menu-item" v-if="workspace.projects.length === 0">{{ L.titleBar.noProject }}</div>
        <button
          v-for="p in workspace.projects"
          :key="p.id"
          :class="['menu-item', 'menu-btn', { active: p.id === workspace.currentProjectId }]"
          @click="setCurrentProject(p.id); close()"
        >
          {{ p.name }}
        </button>
        <div class="menu-sep"></div>
        <button class="menu-item menu-btn" @click="showNewProject = true; close()">
          <Plus :size="13" /> {{ L.dialog.projectNew }}
        </button>
        <button v-if="currentProject" class="menu-item menu-btn" @click="showRenameProject = true; close()">
          <Pencil :size="13" /> {{ L.dialog.projectRename }}
        </button>
        <button
          v-if="currentProject"
          class="menu-item menu-btn danger"
          @click="confirmDeleteProject = true; close()"
        >
          <Trash2 :size="13" /> {{ L.common.delete }}
        </button>
      </template>
    </Dropdown>

    <!-- 环境下拉 -->
    <Dropdown>
      <template #trigger="{ open }">
        <button :class="['tb-select', 'tb-select-env', { open }]">
          <Layers :size="13" />
          <span class="tb-select-label">{{ currentEnv?.name ?? L.titleBar.envNone }}</span>
          <ChevronDown :size="13" />
        </button>
      </template>
      <template #default="{ close }">
        <div class="env-menu">
          <button
            :class="['menu-item', 'menu-btn', { active: env.currentEnvId === null }]"
            @click="setCurrentEnv(null); close()"
          >
            {{ L.titleBar.envNone }}
          </button>
          <template v-if="currentProject">
            <!-- 新建/管理固定紧跟"无环境"，避免环境多时把这两项顶出可视区 -->
            <div class="menu-sep"></div>
            <button class="menu-item menu-btn" @click="openNewEnv(); close()">
              <Plus :size="13" /> {{ L.dialog.envNew }}
            </button>
            <button class="menu-item menu-btn" @click="activePanel = 'environments'; close()">
              <Layers :size="13" /> {{ L.dialog.envManage }}
            </button>
            <div v-if="currentProject.environments.length > 0" class="menu-sep"></div>
            <div
              v-for="e in currentProject.environments"
              :key="e.id"
              :class="['menu-item', 'menu-btn', 'env-row', { active: e.id === env.currentEnvId }]"
              @click="setCurrentEnv(e.id); close()"
            >
              <span class="env-row-name" :title="e.name">{{ e.name }}</span>
              <span class="env-row-actions">
                <button class="env-act" :title="L.common.rename" @click.stop="openRenameEnv(e.id, e.name); close()">
                  <Pencil :size="13" />
                </button>
                <button class="env-act env-act-del" :title="L.common.delete" @click.stop="askDeleteEnv(e.id); close()">
                  <Trash2 :size="13" />
                </button>
              </span>
            </div>
          </template>
        </div>
      </template>
    </Dropdown>

    <div class="spacer"></div>

    <!-- 主题 -->
    <Dropdown>
      <template #trigger="{ open }">
        <button :class="['tb-select', 'tb-select-theme', { open }]">
          <component :is="themeIcon" :size="14" />
          <ChevronDown :size="13" />
        </button>
      </template>
      <template #default="{ close }">
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          :class="['menu-item', 'menu-btn', { active: currentTheme === opt.value }]"
          @click="onThemeChange(opt.value); close()"
        >
          <component :is="opt.icon" :size="13" /> {{ opt.label }}
        </button>
      </template>
    </Dropdown>

    <!-- 缩放：pill 显示当前百分比，点击展开滑条（50–150%）；与 Cmd/Ctrl ± 快捷键共用同一值 -->
    <Dropdown align="end">
      <template #trigger="{ open }">
        <button :class="['tb-select', 'tb-select-zoom', { open }]" :title="L.titleBar.zoomLabel">
          <ZoomIn :size="14" />
          <span class="tb-zoom-pct">{{ zoomPercent }}%</span>
        </button>
      </template>
      <template #default>
        <div class="zoom-pop">
          <div class="zoom-pop-head">
            <span>{{ L.titleBar.zoomLabel }}</span>
            <button class="zoom-reset" :title="L.titleBar.zoomReset" @click="resetZoom()">
              <RotateCcw :size="13" /> 100%
            </button>
          </div>
          <input
            class="zoom-slider"
            type="range"
            min="50"
            max="150"
            step="5"
            :value="zoomPercent"
            @input="setZoom(Number(($event.target as HTMLInputElement).value) / 100)"
          />
          <div class="zoom-pop-scale"><span>50%</span><span>100%</span><span>150%</span></div>
        </div>
      </template>
    </Dropdown>

    <button class="icon-btn" :title="L.titleBar.settings" @click="activePanel = 'settings'">
      <Settings :size="15" />
    </button>

    <!-- 窗口控制：frameless 窗口自绘的最小化 / 最大化(还原) / 关闭 -->
    <div class="win-ctrls">
      <button
        class="win-btn"
        style="--wails-non-client-region: minimize"
        :title="L.window.minimise"
        @click="onMinimise"
      >
        <Minus :size="13" />
      </button>
      <button
        class="win-btn"
        style="--wails-non-client-region: maximize"
        :title="maximised ? L.window.restore : L.window.maximise"
        @click="onToggleMaximise"
      >
        <Copy v-if="maximised" :size="12" />
        <Square v-else :size="12" />
      </button>
      <button
        class="win-btn win-close"
        style="--wails-non-client-region: close"
        :title="L.window.close"
        @click="onClose"
      >
        <X :size="13" />
      </button>
    </div>

    <!-- 新建项目对话框 -->
    <Modal v-if="showNewProject" :title="L.dialog.projectNew" @close="showNewProject = false">
      <input
        class="input"
        v-model="newProjectName"
        :placeholder="L.dialog.projectNewPlaceholder"
        autofocus
        @keyup.enter="confirmNewProject"
        @keyup.esc="showNewProject = false"
        style="width: 100%"
      />
      <div v-if="duplicateProjectName" class="dup-warn">
        {{ L.dialog.projectNameExists ?? '已有同名项目，请换一个名称' }}
      </div>
      <template #footer>
        <button class="btn" @click="showNewProject = false">{{ L.common.cancel }}</button>
        <button class="btn btn-primary" :disabled="!newProjectName.trim() || duplicateProjectName" @click="confirmNewProject">
          {{ L.common.confirm }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      v-if="confirmDeleteProject"
      :title="L.common.confirmDelete"
      :message="L.dialog.projectDeleteConfirm"
      :danger="true"
      @confirm="doDeleteProject"
      @cancel="confirmDeleteProject = false"
    />

    <PromptDialog
      v-if="showRenameProject"
      :title="L.dialog.projectRename"
      :placeholder="L.dialog.projectNewPlaceholder"
      :initial-value="currentProject?.name ?? ''"
      @confirm="confirmRenameProject"
      @cancel="showRenameProject = false"
    />

    <PromptDialog
      v-if="envPrompt"
      :title="envPrompt.mode === 'new' ? L.dialog.envNew : L.dialog.envRename"
      :placeholder="L.dialog.envNewPlaceholder"
      :initial-value="envPrompt.initialValue ?? ''"
      @confirm="confirmEnvPrompt"
      @cancel="envPrompt = null"
    />
    <ConfirmDialog
      v-if="envToDelete"
      :title="L.common.confirmDelete"
      :message="L.dialog.envDeleteConfirm"
      :danger="true"
      @confirm="doDeleteEnv"
      @cancel="envToDelete = null"
    />
  </header>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
  /* frameless 窗口：顶栏空白处可拖动窗口（Wails 原生 drag 通道） */
  --wails-draggable: drag;
}
/* 拖拽属性会继承——顶栏内所有可交互元素必须显式排除，否则点按钮会拖窗口 */
.titlebar button,
.titlebar input {
  --wails-draggable: no-drag;
}
.logo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
  color: var(--brand);
  margin-right: 8px;
  user-select: none;
}
.tb-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-sunken);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--ease);
  max-width: 220px;
}
.tb-select:hover,
.tb-select.open {
  border-color: var(--border-strong);
  background: var(--bg-hover);
}
.tb-select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}
/* 缩放 pill：图标 + 百分比；点击展开滑条 */
.tb-select-zoom {
  min-width: 60px;
  justify-content: center;
}
.tb-zoom-pct {
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: right;
}
.zoom-pop {
  width: 200px;
  padding: 2px;
}
.zoom-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-dim);
  padding: 6px 6px 4px;
}
.zoom-reset {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.zoom-reset:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.zoom-slider {
  width: 100%;
  accent-color: var(--brand);
  cursor: pointer;
  margin: 6px 4px 2px;
}
.zoom-pop-scale {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-faint);
  padding: 0 4px 2px;
}
.spacer {
  flex: 1;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
}
.menu-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.menu-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.menu-btn.active {
  color: var(--brand);
  background: var(--brand-weak);
}
.menu-btn.danger:hover {
  color: var(--error);
  background: var(--error-weak);
}
.menu-sep {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
/* 环境下拉：行内 hover 显示改名/删除，名称点击选中 */
.env-menu {
  min-width: 200px;
}
.env-row-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.env-row-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  flex-shrink: 0;
}
.env-row:hover .env-row-actions {
  opacity: 1;
}
.env-act {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  flex-shrink: 0;
}
.env-act:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.env-act-del:hover {
  background: var(--error-weak);
  color: var(--error);
}
.win-ctrls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
}
.win-btn {
  width: 30px;
  height: 24px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: all var(--ease);
}
.win-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.dup-warn {
  margin-top: 8px;
  font-size: 11px;
  color: var(--warn);
}
.win-close:hover {
  background: var(--error);
  color: #fff;
}
</style>
