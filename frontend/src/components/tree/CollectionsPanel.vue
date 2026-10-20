<script setup lang="ts">
// 接口集合面板：搜索（平铺+面包屑+高亮）/ 树（仅渲染展开子级）/
// 集合行（内联重命名·拖拽排序·右键）/ 空状态三按钮
import { computed, ref, nextTick } from 'vue'
import { Search, Plus, FilePlus2, FolderPlus, Trash2, Pencil, ChevronDown, ChevronRight, Upload, Download, Loader2 } from 'lucide-vue-next'
import EmptyState from '../common/EmptyState.vue'
import ContextMenu, { type MenuItem } from '../common/ContextMenu.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import Dropdown from '../common/Dropdown.vue'
import TreeNodeRow from './TreeNodeRow.vue'
import PostmanImportDialog from './PostmanImportDialog.vue'
import {
  currentProject,
  addCollection,
  removeCollection,
  renameCollection,
  addFolder,
  addRequest,
  removeNode,
  duplicateNode,
  treeSearch,
} from '../../stores/workspace'
import { openRequest } from '../../stores/tabs'
import { setExpanded, toggleExpanded, isExpanded, openCodegen } from '../../stores/ui-state'
import { StorageService } from '../../api/backend'
import { settings } from '../../stores/settings'
import { parsePostman, type PostmanImportResult } from '../../lib/postman'
import { exportPostmanCollection } from '../../lib/postman-export'
import {
  dropTarget,
  dragGhost,
  registerRow,
  unregisterRow,
  startRowDrag,
  wasJustDragged,
} from './dnd-state'
import { scheduleSave } from '../../lib/persist'
import { nodeIcon } from '../../lib/tree-icons'
import type { ID, Collection, TreeNode, Request } from '../../types/models'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())
const p = computed(() => currentProject.value)

/** Collection 没有 kind 字段，统一取类型判别 */
function kindOf(n: Collection | TreeNode): 'collection' | 'folder' | 'request' {
  return 'kind' in n ? n.kind : 'collection'
}

// ---------- 搜索 ----------
const query = ref('')
const searching = computed(() => query.value.trim().length > 0)
interface Hit {
  node: Collection | TreeNode
  path: string[]
  k: 'collection' | 'folder' | 'request'
  /** 命中为请求时的收窄引用（模板里无法对联合类型收窄） */
  req: Request | null
}
const hits = computed<Hit[]>(() => {
  if (!searching.value) return []
  return treeSearch(query.value).map((h) => {
    const k = kindOf(h.node)
    return { ...h, k, req: k === 'request' ? (h.node as Request) : null }
  })
})

function highlightName(name: string): string {
  const q = query.value.trim()
  const i = name.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return escapeHtml(name)
  return escapeHtml(name.slice(0, i)) + '<mark>' + escapeHtml(name.slice(i, i + q.length)) + '</mark>' + escapeHtml(name.slice(i + q.length))
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function onHit(node: Collection | TreeNode) {
  const k = kindOf(node)
  if (k === 'request') openRequest(node as Request)
  else if (k === 'folder') setExpanded(node.id, true)
}

// ---------- 空状态 ----------
const isEmpty = computed(() => !p.value || p.value.collections.length === 0)

function targetCollection(): Collection | null {
  const pr = currentProject.value
  if (!pr) return null
  if (pr.collections.length > 0) return pr.collections[0]
  return addCollection('新集合')
}
// 新建即聚焦：展开父级 + externalRename=新节点 id，树行挂载时自动进入内联改名（敲字即命名）
function onNewRequest() {
  const c = targetCollection()
  if (c) {
    const r = addRequest(c)
    setExpanded(c.id, true)
    externalRename.value = r.id
  }
}
function onNewFolder() {
  const c = targetCollection()
  if (c) {
    const f = addFolder(c, '新建文件夹')
    setExpanded(c.id, true)
    externalRename.value = f.id
  }
}
function onNewCollection() {
  const c = addCollection('新集合')
  if (c) startRenameColl(c)
}
// 集合行 hover 快捷按钮：在指定集合下新建并聚焦改名
function hoverNewRequest(c: Collection) {
  const r = addRequest(c)
  setExpanded(c.id, true)
  externalRename.value = r.id
}
function hoverNewFolder(c: Collection) {
  const f = addFolder(c, '新建文件夹')
  setExpanded(c.id, true)
  externalRename.value = f.id
}
// 集合行点击：拖拽刚结束时吞掉落点上的点击，避免误展开/折叠
function onCollHeadClick(c: Collection) {
  if (wasJustDragged()) return
  toggleExpanded(c.id)
}

// ---------- 集合行：内联重命名 ----------
const renamingCollId = ref<ID | null>(null)
const renameCollText = ref('')
function startRenameColl(c: Collection) {
  renameCollText.value = c.name
  renamingCollId.value = c.id
  setTimeout(() => renameCollInput.value?.select(), 0)
}
const renameCollInput = ref<HTMLInputElement | null>(null)
function commitRenameColl(c: Collection) {
  if (renamingCollId.value !== c.id) return
  renamingCollId.value = null
  const v = renameCollText.value.trim()
  if (v && v !== c.name) renameCollection(c.id, v)
}
function cancelRenameColl() {
  // 先置 null 屏蔽随后的 blur 提交（Esc 才能真正取消）
  renamingCollId.value = null
}

// ---------- 集合拖拽排序（鼠标拖拽，主循环见 dnd-state.ts，集合↔集合） ----------

// ---------- 右键菜单 ----------
const menu = ref<{ node: Collection | TreeNode; x: number; y: number } | null>(null)
const pendingDelete = ref<{ id: ID; name: string; isCollection: boolean } | null>(null)
const externalRename = ref<ID | null>(null)

function onNodeMenu(node: TreeNode, x: number, y: number) {
  menu.value = { node, x, y }
}
function onCollMenu(e: MouseEvent, c: Collection) {
  e.preventDefault()
  menu.value = { node: c, x: e.clientX, y: e.clientY }
}

const menuItems = computed<MenuItem[]>(() => {
  const m = menu.value
  if (!m) return []
  const k = kindOf(m.node)
  const Lc = L.value
  if (k === 'request') {
    return [
      { label: Lc.tree.duplicate },
      { label: Lc.common.rename },
      { sep: true, label: '' },
      { label: Lc.tree.generateCode },
      { sep: true, label: '' },
      { label: Lc.common.delete, danger: true },
    ]
  }
  if (k === 'folder') {
    return [
      { label: Lc.tree.newRequest },
      { label: Lc.tree.newFolder },
      { sep: true, label: '' },
      { label: Lc.tree.duplicate },
      { label: Lc.common.rename },
      { sep: true, label: '' },
      { label: Lc.common.delete, danger: true },
    ]
  }
  return [
    { label: Lc.tree.newRequest },
    { label: Lc.tree.newFolder },
    { sep: true, label: '' },
    { label: Lc.common.rename },
    { label: Lc.common.delete, danger: true },
  ]
})

function onMenuSelect(item: MenuItem) {
  const m = menu.value
  menu.value = null
  if (!m || item.sep) return
  const n = m.node
  const k = kindOf(n)
  const Lc = L.value
  if (item.label === Lc.tree.newRequest) {
    if (k !== 'request') addRequest(n as Collection | Extract<TreeNode, { kind: 'folder' }>)
  } else if (item.label === Lc.tree.newFolder) {
    if (k !== 'request') addFolder(n as Collection | Extract<TreeNode, { kind: 'folder' }>, '新建文件夹')
  } else if (item.label === Lc.tree.duplicate) {
    duplicateNode(n.id)
  } else if (item.label === Lc.tree.generateCode) {
    if (k === 'request') openCodegen(n.id)
  } else if (item.label === Lc.common.rename) {
    if (k === 'collection') startRenameColl(n as Collection)
    else externalRename.value = n.id
  } else if (item.label === Lc.common.delete) {
    pendingDelete.value = { id: n.id, name: n.name, isCollection: k === 'collection' }
  }
}

// TreeNodeRow hover 删除按钮 → 走同一套 pendingDelete + ConfirmDialog
function onDeleteNode(n: TreeNode) {
  pendingDelete.value = { id: n.id, name: n.name, isCollection: false }
}

function doDelete() {
  const d = pendingDelete.value
  pendingDelete.value = null
  if (!d) return
  if (d.isCollection) removeCollection(d.id)
  else removeNode(d.id)
}

// ---------- 导入 / 导出 ----------
const pendingImport = ref<Extract<PostmanImportResult, { ok: true }> | null>(null)
const importError = ref<string | null>(null)
const importing = ref(false)

async function onImport() {
  if (!p.value) return
  try {
    const path = await StorageService.PickFile()
    if (!path) return
    // 解析大集合是同步阻塞（数秒）：先置 loading 并让出一帧，遮罩才能先画出来
    importing.value = true
    await nextTick()
    const text = await StorageService.ReadFileBounded(path, settings.importLimitMB * 1024 * 1024)
    const r = parsePostman(text)
    if (!r.ok) {
      importError.value = r.error
      return
    }
    pendingImport.value = r
  } catch (e) {
    importError.value = String(e)
  } finally {
    importing.value = false
  }
}

function confirmImport() {
  const r = pendingImport.value
  const pr = currentProject.value
  pendingImport.value = null
  if (!r || !pr) return
  pr.collections.push(r.collection)
  for (const v of r.variables) {
    if (!pr.variables.some((x) => x.key === v.key)) pr.variables.push(v)
  }
  pr.updatedAt = Date.now()
  scheduleSave('projects')
  setExpanded(r.collection.id, true)
}

async function onExportPostman() {
  const pr = currentProject.value
  if (!pr) return
  await StorageService.SaveFile(pr.name + '.postman_collection.json', exportPostmanCollection(pr))
}

async function onExportProject() {
  const pr = currentProject.value
  if (!pr) return
  await StorageService.SaveFile(pr.name + '.voltra.json', JSON.stringify(pr, null, 2))
}
</script>

<template>
  <div class="cp">
    <!-- 无项目 -->
    <EmptyState v-if="!p" :title="L.tree.empty" :hint="L.tree.noProjectHint" />

    <template v-else>
      <!-- 搜索框 + 导入/导出 -->
      <div class="cp-search">
        <Search :size="14" />
        <input v-model="query" class="cp-search-input" :placeholder="L.tree.searchPlaceholder" />
        <button class="cp-act" :title="L.tree.importPostman" @click="onImport">
          <Upload :size="14" />
        </button>
        <Dropdown>
          <template #trigger>
            <button class="cp-act" :title="L.common.download">
              <Download :size="14" />
            </button>
          </template>
          <template #default="{ close }">
            <button class="cp-menu-item" @click="onExportPostman(); close()">{{ L.tree.exportPostman }}</button>
            <button class="cp-menu-item" @click="onExportProject(); close()">{{ L.tree.exportProject }}</button>
          </template>
        </Dropdown>
      </div>

      <!-- 空状态 -->
      <EmptyState v-if="isEmpty" :title="L.tree.empty">
        <template #actions>
          <button class="btn" @click="onNewRequest">
            <FilePlus2 :size="13" /> {{ L.tree.newRequest }}
          </button>
          <button class="btn" @click="onNewFolder">
            <FolderPlus :size="13" /> {{ L.tree.newFolder }}
          </button>
          <button class="btn btn-primary" @click="onNewCollection">
            <Plus :size="13" /> {{ L.tree.newCollection }}
          </button>
        </template>
      </EmptyState>

      <!-- 搜索态：平铺命中 + 面包屑 + 高亮 -->
      <template v-else-if="searching">
        <div v-if="hits.length === 0" class="cp-nohit">{{ L.tree.searchEmpty }}</div>
        <div
          v-for="(h, i) in hits"
          :key="h.node.id + '-' + i"
          class="cp-hit"
          @click="onHit(h.node)"
        >
          <div class="cp-crumb">{{ h.path.join(' / ') }}</div>
          <div class="cp-hit-name">
            <template v-if="h.req">
              <span :class="['tn-method', h.req.protocol === 'ws' ? 'm-WS' : 'm-' + h.req.method.toUpperCase()]">
                {{ h.req.protocol === 'ws' ? 'WS' : h.req.method }}
              </span>
            </template>
            <component :is="nodeIcon(h.node)" v-else :size="12" class="cp-crumb-ico" />
            <span v-html="highlightName(h.node.name)"></span>
          </div>
        </div>
      </template>

      <!-- 正常态：集合 + 递归树（只渲染展开的子级） -->
      <template v-else>
        <div
          v-for="c in p.collections"
          :key="c.id"
          :class="[
            'coll-group',
            {
              'drop-before': dropTarget?.id === c.id && dropTarget.pos === 'before',
              'drop-after': dropTarget?.id === c.id && dropTarget.pos === 'after',
            },
          ]"
        >
          <div
            class="coll-head"
            :ref="(el) => { if (el) registerRow(c.id, el as HTMLElement, 'collection'); else unregisterRow(c.id) }"
            @mousedown="startRowDrag($event, c.id, 'collection', c.name)"
            @contextmenu="onCollMenu($event, c)"
          >
            <button class="tn-chevron" :class="{ open: isExpanded(c.id) }" @click.stop="toggleExpanded(c.id)">
              <ChevronDown v-if="isExpanded(c.id)" :size="15" />
              <ChevronRight v-else :size="15" />
            </button>
            <component :is="nodeIcon(c)" :size="13" class="coll-ico" />
            <input
              v-if="renamingCollId === c.id"
              ref="renameCollInput"
              v-model="renameCollText"
              class="tn-rename"
              @click.stop
              @blur="commitRenameColl(c)"
              @keyup.enter="commitRenameColl(c)"
              @keyup.esc="cancelRenameColl()"
            />
            <span
              v-else
              class="tn-name"
              :title="c.name"
              @click="onCollHeadClick(c)"
              @dblclick="startRenameColl(c)"
            >
              {{ c.name }}
            </span>
            <span v-if="renamingCollId !== c.id" class="coll-acts">
              <button class="coll-act" :title="L.tree.newRequest" @click.stop="hoverNewRequest(c)">
                <FilePlus2 :size="13" />
              </button>
              <button class="coll-act" :title="L.tree.newFolder" @click.stop="hoverNewFolder(c)">
                <FolderPlus :size="13" />
              </button>
              <button class="coll-act" :title="L.common.rename" @click.stop="startRenameColl(c)">
                <Pencil :size="13" />
              </button>
              <button
                class="coll-act coll-act-del"
                :title="L.common.delete"
                @click.stop="pendingDelete = { id: c.id, name: c.name, isCollection: true }"
              >
                <Trash2 :size="13" />
              </button>
            </span>
          </div>
          <div v-if="isExpanded(c.id)">
            <TreeNodeRow
              v-for="child in c.items"
              :key="child.id"
              :node="child"
              :level="1"
              :external-rename="externalRename"
              @menu="onNodeMenu"
              @rename-done="externalRename = null"
              @focus-rename="externalRename = $event"
              @delete="onDeleteNode"
            />
          </div>
        </div>
      </template>
    </template>

    <!-- 右键菜单 -->
    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menuItems"
      @select="onMenuSelect"
      @close="menu = null"
    />

    <ConfirmDialog
      v-if="pendingDelete"
      :title="L.common.confirmDelete"
      :message="`确定删除「${pendingDelete.name}」及其全部内容？`"
      :danger="true"
      @confirm="doDelete"
      @cancel="pendingDelete = null"
    />

    <PostmanImportDialog
      v-if="pendingImport"
      :result="pendingImport"
      @confirm="confirmImport"
      @close="pendingImport = null"
    />
    <ConfirmDialog
      v-if="importError"
      :title="L.dialog.importFailed"
      :message="importError"
      @confirm="importError = null"
      @cancel="importError = null"
    />

    <!-- 拖拽幽灵（跟随光标的标签，鼠标拖拽的"被拖项"替身） -->
    <div
      v-if="dragGhost"
      class="cp-drag-ghost"
      :style="{ left: dragGhost.x + 'px', top: dragGhost.y + 'px' }"
    >{{ dragGhost.name }}</div>

    <!-- 导入解析中（同步解析大集合会阻塞数秒，给个遮罩提示） -->
    <div v-if="importing" class="cp-import-mask">
      <div class="cp-import-card">
        <Loader2 :size="20" class="spin" />
        <p>{{ L.tree.parsing }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cp {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  position: relative;
}
.cp-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 8px 8px;
  padding: 0 8px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elev);
  color: var(--text-dim);
  flex-shrink: 0;
}
.cp-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
}
.cp-act {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  flex-shrink: 0;
}
.cp-act:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.cp-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.cp-menu-item:hover {
  background: var(--bg-well);
}
.cp-nohit {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--text-faint);
}
.cp-hit {
  padding: 4px 12px 4px 8px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.cp-hit:hover {
  background: var(--bg-hover);
}
.cp-crumb {
  font-size: 10px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-crumb-ico {
  vertical-align: -1px;
  color: var(--text-faint);
  flex-shrink: 0;
}
.cp-hit-name {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text);
  overflow: hidden;
}
.cp-hit-name > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tn-method {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.3px;
  min-width: 30px;
  flex-shrink: 0;
}
.coll-group {
  margin-bottom: 2px;
}
.coll-group.drop-before > .coll-head {
  box-shadow: 0 -2px 0 0 var(--brand);
}
.coll-group.drop-after > .coll-head {
  box-shadow: 0 2px 0 0 var(--brand);
}
.coll-head {
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--row-h);
  padding: 0 6px 0 8px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  border-radius: var(--radius-sm);
}
.coll-head:hover {
  background: var(--bg-hover);
}
.coll-ico {
  color: var(--brand);
  flex-shrink: 0;
}
.tn-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  flex-shrink: 0;
}
.tn-chevron:hover {
  background: var(--border);
  color: var(--text);
}
.tn-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tn-rename {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--brand);
  border-radius: var(--radius-sm);
  background: var(--bg-elev);
  color: var(--text);
  font-size: 12px;
  outline: none;
}
.coll-acts {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
  flex-shrink: 0;
}
/* 行 hover 或按钮获焦（键盘 Tab）时显示；过渡让 WebKit 下 hover 状态抖动时按钮不闪没 */
.coll-head:hover .coll-acts,
.coll-head:focus-within .coll-acts {
  opacity: 1;
}
.coll-act {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  flex-shrink: 0;
}
.coll-act:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.coll-act-del:hover {
  background: var(--error-weak);
  color: var(--error);
}
/* 拖拽幽灵标签：position:fixed 跟随光标（transform 偏移避免挡住指针） */
.cp-drag-ghost {
  position: fixed;
  z-index: 400;
  pointer-events: none;
  transform: translate(14px, 14px);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 3px 9px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  background: var(--bg-active);
  border: 1px solid var(--brand);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}
/* 导入解析遮罩 */
.cp-import-mask {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
}
.cp-import-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 160px;
  padding: 18px 24px;
  background: var(--bg-elev);
  border-radius: var(--radius);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
  color: var(--text);
}
.cp-import-card p {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.cp-import-card .spin {
  color: var(--brand);
  animation: cp-spin 0.9s linear infinite;
}
@keyframes cp-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
