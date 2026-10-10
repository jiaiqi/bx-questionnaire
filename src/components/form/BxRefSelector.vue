<script setup lang="ts">
/**
 * 引用题型选择器
 *
 * 对应老工程 `item_type === '引用'`（组件 type=Selector）：
 * 由题目配置动态指定数据源与取值列 ——
 * - `serviceName`：要调用的服务
 * - `srv_app`：应用名（缺省跟随全局 daq）
 * - `refed_col`：答案存哪一列的值
 * - `key_disp_col`：界面展示哪一列
 *
 * 配置优先取 `item_type_attr`（老工程写法），行上的独立列（servicename / refed_col /
 * key_disp_col / srv_app）作为兜底 —— 真实表里这两种来源都存在。
 */

import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed, ref, watch } from 'vue'

import { BxError, bxSelect } from '@/utils/request'
import { toast } from '@/utils/ui'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { disabled: false })

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

interface RefOption {
  value: string
  label: string
}

function parseAttr(value: unknown): Record<string, unknown> {
  if (!value) {
    return {}
  }
  if (typeof value === 'object') {
    return value as Record<string, unknown>
  }
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
}

const config = computed(() => {
  const raw = props.field.raw as Record<string, unknown>
  const attr = parseAttr(raw.item_type_attr)
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = attr[key] ?? raw[key]
      if (value !== null && value !== undefined && String(value) !== '') {
        return String(value)
      }
    }
    return ''
  }

  return {
    serviceName: pick('serviceName', 'servicename'),
    app: pick('srv_app') || undefined,
    valueCol: pick('refed_col') || 'no',
    labelCol: pick('key_disp_col') || 'name',
  }
})

const visible = ref(false)
const loading = ref(false)
const options = ref<RefOption[]>([])
const draft = ref<string[]>([])

const selected = computed<string[]>(() => {
  const value = props.modelValue
  if (Array.isArray(value)) {
    return value.map(item => String(item))
  }
  return value === null || value === undefined || value === '' ? [] : [String(value)]
})

/** 已选值的展示文案：优先用已加载选项，否则直接显示原始值 */
const display = computed(() => {
  if (selected.value.length === 0) {
    return ''
  }
  return selected.value
    .map((value) => {
      const matched = options.value.find(item => item.value === value)
      return matched?.label ?? value
    })
    .join('、')
})

async function load(): Promise<void> {
  if (!config.value.serviceName) {
    toast('该引用题未配置数据源')
    return
  }

  loading.value = true
  try {
    const envelope = await bxSelect<Record<string, unknown>>({
      serviceName: config.value.serviceName,
      ...(config.value.app ? { app: config.value.app } : {}),
      colNames: ['*'],
      page: { pageNo: 1, rownumber: 200 },
    })

    options.value = (envelope.data ?? [])
      .map((row) => {
        const value = String(row[config.value.valueCol] ?? '')
        const label = String(row[config.value.labelCol] ?? value)
        return { value, label }
      })
      .filter(item => !!item.value)

    if (options.value.length === 0) {
      toast('数据源没有可选项')
    }
  }
  catch (error) {
    toast(error instanceof BxError ? error.message : '引用数据加载失败')
  }
  finally {
    loading.value = false
  }
}

async function open(): Promise<void> {
  if (props.disabled) {
    return
  }
  draft.value = [...selected.value]
  visible.value = true
  if (options.value.length === 0) {
    await load()
  }
}

function toggle(value: string): void {
  if (props.field.multi) {
    draft.value = draft.value.includes(value)
      ? draft.value.filter(item => item !== value)
      : [...draft.value, value]
    return
  }
  draft.value = draft.value[0] === value ? [] : [value]
}

function confirm(): void {
  emit('update:modelValue', props.field.multi ? [...draft.value] : (draft.value[0] ?? ''))
  visible.value = false
}

watch(() => props.field.key, () => {
  options.value = []
  draft.value = []
  visible.value = false
}, { immediate: true })
</script>

<template>
  <view class="bx-ref">
    <view
      class="bx-ref__control"
      :class="{ 'bx-ref__control--disabled': props.disabled }"
      @click="open"
    >
      <text v-if="display" class="bx-ref__text">{{ display }}</text>
      <text v-else class="bx-ref__placeholder">请选择</text>
      <text class="bx-ref__arrow">›</text>
    </view>

    <view v-if="visible" class="bx-ref__mask" @click="visible = false">
      <view class="bx-ref__panel" @click.stop>
        <view class="bx-ref__head">
          <text class="bx-ref__title">{{ props.field.label }}</text>
          <text class="bx-ref__close" @click="visible = false">关闭</text>
        </view>

        <scroll-view class="bx-ref__list" scroll-y>
          <view v-if="loading" class="bx-ref__state">
            <text class="bx-ref__state-text">正在加载…</text>
          </view>
          <view v-else-if="options.length === 0" class="bx-ref__state">
            <text class="bx-ref__state-text">暂无可选项</text>
          </view>
          <view
            v-for="option in options"
            v-else
            :key="option.value"
            class="bx-ref__item"
            :class="{ 'bx-ref__item--active': draft.includes(option.value) }"
            @click="toggle(option.value)"
          >
            <text class="bx-ref__item-label">{{ option.label }}</text>
            <text v-if="draft.includes(option.value)" class="bx-ref__item-check">✓</text>
          </view>
        </scroll-view>

        <view class="bx-ref__foot">
          <text class="bx-ref__hint">{{ props.field.multi ? '可多选' : '单选' }}</text>
          <view class="bx-ref__confirm" @click="confirm">
            <text class="bx-ref__confirm-text">确定</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-ref {
  box-sizing: border-box;
  width: 100%;
}

.bx-ref__control {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-ref__control--disabled {
  opacity: 0.6;
}

.bx-ref__text {
  flex: 1;
  font-size: 14px;
  color: var(--bx-text);
}

.bx-ref__placeholder {
  flex: 1;
  font-size: 14px;
  color: var(--bx-text-3);
}

.bx-ref__arrow {
  margin-left: 8px;
  font-size: 18px;
  line-height: 1;
  color: var(--bx-text-3);
}

.bx-ref__mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 900;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.45);
}

.bx-ref__panel {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--bx-content-width);
  max-height: 70vh;
  padding-bottom: env(safe-area-inset-bottom);
  background-color: var(--bx-surface);
  border-radius: 12px 12px 0 0;
}

.bx-ref__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--bx-line-2);
}

.bx-ref__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--bx-text);
}

.bx-ref__close {
  font-size: 14px;
  color: var(--bx-text-3);
}

.bx-ref__list {
  max-height: 46vh;
}

.bx-ref__state {
  padding: 32px 0;
  text-align: center;
}

.bx-ref__state-text {
  font-size: 13px;
  color: var(--bx-text-3);
}

.bx-ref__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-bottom: 1px solid var(--bx-line-2);
}

.bx-ref__item--active {
  background-color: var(--bx-blue-soft);
}

.bx-ref__item-label {
  flex: 1;
  font-size: 14px;
  color: var(--bx-text);
}

.bx-ref__item-check {
  margin-left: 10px;
  font-size: 14px;
  color: var(--bx-blue);
}

.bx-ref__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--bx-line-2);
}

.bx-ref__hint {
  font-size: 12px;
  color: var(--bx-text-3);
}

.bx-ref__confirm {
  padding: 8px 22px;
  background-color: var(--bx-blue);
  border-radius: 999px;
}

.bx-ref__confirm-text {
  font-size: 14px;
  color: #fff;
}
</style>
