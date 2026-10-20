<script setup lang="ts">
// 命名输入对话框（新建/改名共用）：基于 Modal，复用"新建项目"的输入框模式
// Enter 提交、Esc/点遮罩关闭、空值禁用确定；initialValue 用于改名回填
// 提交后立即上锁：Enter 提交时后续的 blur 会再触发一次 confirm，导致同一次操作重复执行（多建一个环境/项目）
import { ref, onMounted } from 'vue'
import Modal from './Modal.vue'
import { t } from '../../locales/zh-CN'

const props = withDefaults(
  defineProps<{
    title: string
    placeholder?: string
    initialValue?: string
    confirmText?: string
  }>(),
  { placeholder: '', initialValue: '', confirmText: '' },
)

const emit = defineEmits<{
  (e: 'confirm', name: string): void
  (e: 'cancel'): void
}>()

const L = t()
const name = ref(props.initialValue)
const input = ref<HTMLInputElement | null>(null)
let done = false

onMounted(() => {
  // 改名时选中全部文本，敲字即覆盖
  setTimeout(() => {
    input.value?.focus()
    if (props.initialValue) input.value?.select()
  }, 0)
})

function cancel() {
  if (done) return
  done = true
  emit('cancel')
}

function onConfirm() {
  if (done) return
  const v = name.value.trim()
  if (!v) return
  done = true
  emit('confirm', v)
}
</script>

<template>
  <Modal :title="title" @close="cancel">
    <input
      ref="input"
      class="input"
      v-model="name"
      :placeholder="placeholder || L.dialog.namePlaceholder"
      @keyup.enter="onConfirm"
      style="width: 100%"
    />
    <template #footer>
      <button class="btn" @click="cancel">{{ L.common.cancel }}</button>
      <button class="btn btn-primary" :disabled="!name.trim()" @click="onConfirm">
        {{ confirmText || L.common.confirm }}
      </button>
    </template>
  </Modal>
</template>
