<script setup lang="ts">
/**
 * 地址级联选择
 *
 * 对应老工程 `item_type === '地址'`（组件 type=cascader，数据源 srvconfig_area_adj_select）。
 * 采用 uni-app 原生 `picker mode="multiSelector"`：三级联动、各端一致、无需自绘弹层。
 * 答案存地区编号（老工程 column=no），展示用 path_name。
 */

import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed, ref, watch } from 'vue'

import { areaAdjSelect } from '@/api/config/area'
import { BxError } from '@/utils/request'
import { toast } from '@/utils/ui'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { disabled: false })

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

interface AreaOption {
  no: string
  name: string
}

/** 每级选项；至少保留一级，供 picker 渲染 */
const columns = ref<AreaOption[][]>([[]])
const indexes = ref<number[]>([0])
const labels = ref<string[]>([])
const loading = ref(false)

const current = computed(() => {
  const value = props.modelValue
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
})

const display = computed(() => {
  if (labels.value.length > 0) {
    return labels.value.join(' / ')
  }
  return current.value ? String(current.value) : ''
})

function toOptions(rows: Array<{ no?: string | null, path_name?: string | null }>): AreaOption[] {
  return rows
    .map(row => ({ no: String(row.no ?? ''), name: String(row.path_name ?? row.no ?? '') }))
    .filter(item => !!item.no)
}

/**
 * 每一级的加载序号
 *
 * picker 的 columnchange 在滑动过程中会高频触发，用户从「广东省」快速滑到「湖南省」时
 * 两次请求会并发。若先发的后返回，columns[level] 会被旧省份的下级列表覆盖，
 * 出现「选的是湖南、市列表却是广东的」这种错乱。所以同一级只认最新一次请求的结果。
 */
const levelTokens: number[] = []

/** 加载第 level 级；parentNo 为空表示顶层；返回 null 表示结果已过期、调用方不要改 UI */
async function loadLevel(level: number, parentNo?: string): Promise<AreaOption[] | null> {
  const token = (levelTokens[level] ?? 0) + 1
  levelTokens[level] = token

  const envelope = await areaAdjSelect(parentNo)
  const options = toOptions(envelope.data ?? [])

  if (levelTokens[level] !== token) {
    return null
  }

  columns.value[level] = options
  return options
}

async function init(): Promise<void> {
  if (props.field.widget !== 'address') {
    return
  }

  loading.value = true
  try {
    await loadLevel(0)
  }
  catch (error) {
    toast(error instanceof BxError ? error.message : '地区数据加载失败')
  }
  finally {
    loading.value = false
  }
}

/** 级联：换上一级就重载下一级 */
async function onColumnChange(event: { detail: { column: number, value: number } }): Promise<void> {
  const { column, value } = event.detail
  indexes.value[column] = value

  const picked = columns.value[column]?.[value]
  if (!picked) {
    return
  }

  labels.value = labels.value.slice(0, column)
  labels.value[column] = picked.name

  // 截断更深层级，再加载下一级
  columns.value = columns.value.slice(0, column + 1)
  indexes.value = indexes.value.slice(0, column + 1)

  try {
    const next = await loadLevel(column + 1, picked.no)
    // 结果已过期（用户又改了上级）：不要再调整列与索引，否则会与新的选择错配
    if (!next) {
      return
    }
    if (next.length === 0) {
      // 没有下级：当前级即末级
      columns.value = columns.value.slice(0, column + 1)
    }
    else {
      indexes.value[column + 1] = 0
      labels.value[column + 1] = next[0]!.name
    }
  }
  catch {
    // 下一级加载失败不影响已选层级
  }
}

function onConfirm(): void {
  const parts: string[] = []
  for (let level = 0; level < columns.value.length; level += 1) {
    const picked = columns.value[level]?.[indexes.value[level] ?? 0]
    if (!picked) {
      break
    }
    parts.push(picked.name)
    if (level === columns.value.length - 1) {
      labels.value = parts
      emit('update:modelValue', picked.no)
    }
  }
}

watch(() => props.field.key, () => {
  columns.value = [[]]
  indexes.value = [0]
  labels.value = []
  void init()
}, { immediate: true })

/**
 * 顶层有没有可选项
 *
 * 实测本环境的 `srvconfig_area_adj_select` **任何条件都返回 0 行**，
 * 而 uni 的 `<picker>` 在 range 为空时仍会打开一个**空的**选择器 ——
 * 用户只看到「取消 / 完成」和一个空转轮，会以为页面坏了。
 * 所以没数据时直接禁用并如实说明，而不是让它空着打开。
 */
const hasOptions = computed(() => (columns.value[0]?.length ?? 0) > 0)
</script>

<template>
  <view class="bx-address">
    <picker
      mode="multiSelector"
      :range="columns"
      :value="indexes"
      range-key="name"
      :disabled="props.disabled || loading || !hasOptions"
      @columnchange="onColumnChange"
      @change="onConfirm"
    >
      <view class="bx-address__control" :class="{ 'bx-address__control--disabled': props.disabled }">
        <text v-if="display" class="bx-address__text">{{ display }}</text>
        <text v-else class="bx-address__placeholder">
          {{ loading ? '正在加载地区…' : (hasOptions ? '请选择地区' : '暂无地区数据') }}
        </text>
        <text class="bx-address__arrow">›</text>
      </view>
    </picker>
  </view>
</template>

<style lang="scss" scoped>
.bx-address {
  box-sizing: border-box;
  width: 100%;
}

.bx-address__control {
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

.bx-address__control--disabled {
  opacity: 0.6;
}

.bx-address__text {
  flex: 1;
  font-size: 14px;
  color: var(--bx-text);
}

.bx-address__placeholder {
  flex: 1;
  font-size: 14px;
  color: var(--bx-text-3);
}

.bx-address__arrow {
  margin-left: 8px;
  font-size: 18px;
  line-height: 1;
  color: var(--bx-text-3);
}
</style>
