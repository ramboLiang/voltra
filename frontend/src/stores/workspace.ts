// 项目 / 接口树 store（模块级 reactive 单例）
// 负责 projects[] 的 CRUD、当前项目、树的增删改查/移动/复制/搜索
import { reactive, computed } from 'vue'
import type {
  ID,
  Project,
  Collection,
  Folder,
  Request,
  TreeNode,
} from '../types/models'
import { newProject, newCollection, newFolder, newRequest, newRequestSettings, uid, cloneDeep } from '../types/models'
import { scheduleSave } from '../lib/persist'
import { settings } from './settings'

export const workspace = reactive({
  projects: [] as Project[],
  currentProjectId: null as ID | null,
})

export const currentProject = computed(
  () => workspace.projects.find((p) => p.id === workspace.currentProjectId) ?? null,
)

function touch(p: Project) {
  p.updatedAt = Date.now()
}

// ---------- 项目 ----------

export function addProject(name: string): Project {
  const p = newProject({ name })
  workspace.projects.push(p)
  if (!workspace.currentProjectId) workspace.currentProjectId = p.id
  scheduleSave('projects')
  return p
}

export function renameProject(id: ID, name: string) {
  const p = workspace.projects.find((x) => x.id === id)
  if (!p) return
  p.name = name
  touch(p)
  scheduleSave('projects')
}

export function removeProject(id: ID) {
  const i = workspace.projects.findIndex((x) => x.id === id)
  if (i < 0) return
  workspace.projects.splice(i, 1)
  if (workspace.currentProjectId === id) {
    workspace.currentProjectId = workspace.projects[0]?.id ?? null
  }
  scheduleSave('projects')
}

export function setCurrentProject(id: ID | null) {
  workspace.currentProjectId = id
  scheduleSave('ui') // currentProjectId 落在 ui-state.json
}

// ---------- 树节点定位 ----------

/** 在某个项目的树中找到节点（集合/文件夹/请求），返回节点本身 */
export function findNode(project: Project, id: ID): TreeNode | null {
  const walk = (items: TreeNode[]): TreeNode | null => {
    for (const n of items) {
      if (n.id === id) return n
      if (n.kind === 'folder') {
        const hit = walk(n.items)
        if (hit) return hit
      }
    }
    return null
  }
  for (const c of project.collections) {
    const hit = walk(c.items)
    if (hit) return hit
  }
  return null
}

/** 找到包含 id 节点的 items 数组（集合或文件夹的 items），用于移动/删除 */
export function findParentItems(project: Project, id: ID): TreeNode[] | null {
  const walk = (items: TreeNode[]): TreeNode[] | null => {
    if (items.some((n) => n.id === id)) return items
    for (const n of items) {
      if (n.kind === 'folder') {
        const hit = walk(n.items)
        if (hit) return hit
      }
    }
    return null
  }
  for (const c of project.collections) {
    if (c.items.some((n) => n.id === id)) return c.items
    const hit = walk(c.items)
    if (hit) return hit
  }
  return null
}

/** id 是否是 ancestorId 的后代（含自身）——拖拽落点校验用 */
export function isDescendant(project: Project, ancestorId: ID, id: ID): boolean {
  if (ancestorId === id) return true
  const anc = findNode(project, ancestorId)
  if (!anc || anc.kind !== 'folder') return false
  const walk = (items: TreeNode[]): boolean =>
    items.some((n) => (n.id === id ? true : n.kind === 'folder' ? walk(n.items) : false))
  return walk(anc.items)
}

/** 节点的祖先链（从最外层集合到直接父级），用于 auth 继承 / 公共 header 合并 */
export function nodeAncestors(project: Project, id: ID): (Collection | Folder)[] {
  const walk = (items: TreeNode[], chain: (Collection | Folder)[]): (Collection | Folder)[] | null => {
    for (const n of items) {
      if (n.id === id) return chain
      if (n.kind === 'folder') {
        const hit = walk(n.items, [...chain, n])
        if (hit) return hit
      }
    }
    return null
  }
  for (const c of project.collections) {
    const hit = walk(c.items, [c])
    if (hit) return hit
  }
  return []
}

/** 请求 id → { project, node }（跨项目查找，历史还原等场景用） */
export function findRequest(id: ID): { project: Project; node: Request } | null {
  for (const p of workspace.projects) {
    const n = findNode(p, id)
    if (n && n.kind === 'request') return { project: p, node: n }
  }
  return null
}

// ---------- 树 CRUD ----------

export function addCollection(name: string): Collection | null {
  const p = currentProject.value
  if (!p) return null
  const c = newCollection({ name })
  p.collections.push(c)
  touch(p)
  scheduleSave('projects')
  return c
}

export function renameCollection(id: ID, name: string) {
  const p = currentProject.value
  if (!p) return
  const c = p.collections.find((x) => x.id === id)
  if (!c) return
  c.name = name
  touch(p)
  scheduleSave('projects')
}

export function removeCollection(id: ID) {
  const p = currentProject.value
  if (!p) return
  const i = p.collections.findIndex((x) => x.id === id)
  if (i < 0) return
  p.collections.splice(i, 1)
  touch(p)
  scheduleSave('projects')
}

/** 在集合或文件夹下新增文件夹 */
export function addFolder(parent: Collection | Folder, name: string): Folder {
  const f = newFolder({ name })
  parent.items.push(f)
  touchCurrent()
  return f
}

/** 在集合或文件夹下新增请求 */
export function addRequest(parent: Collection | Folder, partial?: Partial<Request>): Request {
  // 新建请求的超时取「设置 → 默认超时」（newRequestSettings 只在 models 内默认 30000）
  const r = newRequest({
    name: partial?.protocol === 'ws' ? '新建 WebSocket' : '新建请求',
    settings: newRequestSettings(settings.defaultTimeoutMs),
    ...partial,
  })
  parent.items.push(r)
  touchCurrent()
  return r
}

export function renameNode(id: ID, name: string) {
  const p = currentProject.value
  if (!p) return
  const n = findNode(p, id)
  if (!n) return
  n.name = name
  if (n.kind === 'request') n.updatedAt = Date.now()
  touch(p)
  scheduleSave('projects')
}

export function removeNode(id: ID) {
  const p = currentProject.value
  if (!p) return
  const items = findParentItems(p, id)
  if (!items) return
  const i = items.findIndex((n) => n.id === id)
  if (i < 0) return
  items.splice(i, 1)
  touch(p)
  scheduleSave('projects')
}

/** 深拷贝节点（新 id），插到原节点之后；名字加「副本」后缀（否则树里两个同名行分不清） */
export function duplicateNode(id: ID): TreeNode | null {
  const p = currentProject.value
  if (!p) return null
  const items = findParentItems(p, id)
  if (!items) return null
  const i = items.findIndex((n) => n.id === id)
  if (i < 0) return null
  const copy = cloneNodeWithNewIds(items[i])
  copy.name = items[i].name + ' 副本'
  items.splice(i + 1, 0, copy)
  touch(p)
  scheduleSave('projects')
  return copy
}

function cloneNodeWithNewIds(n: TreeNode): TreeNode {
  const clone = (x: TreeNode): TreeNode => {
    if (x.kind === 'folder') {
      return {
        ...x,
        id: uid(),
        items: x.items.map(clone),
        headers: x.headers?.map((h) => ({ ...h })),
      }
    }
    return {
      ...x,
      id: uid(),
      params: x.params.map((kv) => ({ ...kv })),
      headers: x.headers.map((kv) => ({ ...kv })),
      body: {
        ...x.body,
        formData: x.body.formData?.map((f) => ({ ...f })),
        urlencoded: x.body.urlencoded?.map((kv) => ({ ...kv })),
        graphql: x.body.graphql ? { ...x.body.graphql } : undefined,
      },
      // auth 子对象（bearer/jwt/oauth2 等）必须深拷贝，否则副本与原节点共享引用、改一丢一
      auth: cloneDeep(x.auth),
      settings: { ...x.settings },
    }
  }
  return clone(n)
}

/** 移动节点：pos=before|after|inside；拖到自身/后代返回 false 不做任何事 */
export function moveNode(dragId: ID, targetId: ID, pos: 'before' | 'after' | 'inside'): boolean {
  const p = currentProject.value
  if (!p || dragId === targetId) return false
  // 目标在拖拽源的子树内（含自身）→ 拒绝
  if (isDescendant(p, dragId, targetId)) return false

  const fromItems = findParentItems(p, dragId)
  if (!fromItems) return false
  const fromIdx = fromItems.findIndex((n) => n.id === dragId)
  if (fromIdx < 0) return false
  const node = fromItems[fromIdx]

  if (pos === 'inside') {
    // 只有文件夹可以接收 inside 落点（集合是顶层，不参与树内拖拽）
    const target = findNode(p, targetId)
    if (!target || target.kind !== 'folder') return false
    fromItems.splice(fromIdx, 1)
    target.items.push(node)
  } else {
    const toItems = findParentItems(p, targetId)
    if (!toItems) return false
    const targetIdx = toItems.findIndex((n) => n.id === targetId)
    if (targetIdx < 0) return false
    fromItems.splice(fromIdx, 1)
    // 同数组且原位置在目标前，移除后目标下标前移一位
    const insertAt = toItems === fromItems && fromIdx < targetIdx ? targetIdx : targetIdx + (pos === 'before' ? 0 : 1)
    toItems.splice(insertAt, 0, node)
  }
  touch(p)
  scheduleSave('projects')
  return true
}

/** 顶层集合排序（鼠标拖拽用）：pos=before|after；拖到自身返回 false */
export function reorderCollections(dragId: ID, targetId: ID, pos: 'before' | 'after'): boolean {
  const p = currentProject.value
  if (!p || dragId === targetId) return false
  const items = p.collections
  const from = items.findIndex((c) => c.id === dragId)
  if (from < 0) return false
  const [c] = items.splice(from, 1)
  const t = items.findIndex((x) => x.id === targetId)
  if (t < 0) return false
  items.splice(t + (pos === 'before' ? 0 : 1), 0, c)
  touch(p)
  scheduleSave('projects')
  return true
}

// ---------- 搜索 ----------

export interface TreeSearchHit {
  /** 命中的节点（集合也可能命中，故含 Collection） */
  node: Collection | TreeNode
  /** 从集合到父文件夹的面包屑 */
  path: string[]
}

/** 按名称模糊搜索（大小写不敏感），返回平铺命中列表（搜索态渲染用，不做虚拟滚动） */
export function treeSearch(query: string): TreeSearchHit[] {
  const p = currentProject.value
  const hits: TreeSearchHit[] = []
  if (!p) return hits
  const q = query.trim().toLowerCase()
  if (!q) return hits
  const match = (name: string) => name.toLowerCase().includes(q)

  const walk = (items: TreeNode[], path: string[]) => {
    for (const n of items) {
      if (match(n.name)) hits.push({ node: n, path: [...path] })
      if (n.kind === 'folder') walk(n.items, [...path, n.name])
    }
  }
  for (const c of p.collections) {
    if (match(c.name)) hits.push({ node: c, path: [] })
    walk(c.items, [c.name])
  }
  return hits
}

/** 修改当前项目树后调用：更新时间戳并安排落盘 */
function touchCurrent() {
  const p = currentProject.value
  if (!p) return
  touch(p)
  scheduleSave('projects')
}
