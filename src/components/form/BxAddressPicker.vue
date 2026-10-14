<script setup lang="ts">
/**
 * 地址级联选择
 *
 * 对应老工程 `item_type === '地址'`：
 * `{ type: 'cascader', srvInfo: { serviceName: 'srvconfig_area_adj_select',
 *   appNo: 'config', isTree: true, column: 'no', showCol: 'path_name' } }`
 *
 * **`isTree: true` 是关键**：老工程一次取回**整张表**，由组件在客户端建树分层。
 * 所以 `srvconfig_area_adj_select` 无条件返回整张表是有意的设计，不是数据没过滤。
 *
 * 我第一版实现把「无条件查询的结果」直接当成第一列 —— 省/市/区**全混在一列**，
 * 用户可以把一个区选成「省」。现在改为：一次取回 → `buildAreaTree` 建树 →
 * 换列时从内存取下级（不再逐级请求，级联也不再受网络时序影响）。
 *
 * 答案存地区编号（老工程 `column=no`），展示用 `path_name`。
 */

import type { AnswerValue, QuestionField } from '@/domain/questionnaire'
import type { AreaNode } from '@/domain/questionnaire/addresses'

import { computed, ref, watch } from 'vue'

import { areaAdjSelect } from '@/api/config/area'
import { buildAreaColumns, buildAreaTree } from '@/domain/questionnaire/addresses'
import { BxError } from '@/utils/request'
import { toast } from '@/utils/ui'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { disabled: false })

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

/**
 * 一次拉取的行数上限
 *
 * 老工程是整表建树，所以这里也要整表。**但整表可能被截断** ——
 * 截断后界面会静默少掉一部分区县，而用户看不出区别，所以下面必须核对 `page.total`。
 */
const AREA_PAGE_SIZE = 5000

const tree = ref(buildAreaTree([]))
/** 每列选项；至少保留一级，供 picker 渲染 */
const columns = ref<AreaNode[][]>([[]])
const indexes = ref<number[]>([0])
const labels = ref<string[]>([])
const loading = ref(false)
/** 加载失败的原因（与「确实没有地区数据」必须区分开） */
const errorMessage = ref('')

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

/**
 * 按已选路径重算各列与各列索引
 *
 * **索引必须落在路径上，不能一律归零** —— 归零等于告诉 picker「第一列选的是索引 0」，
 * 而第二列可能已经是另一个上级的下级，于是出现「省2 / 省的市」这种错配
 * （实测确定后控件显示 `bxq测试省2 / bxq测试市A`）。
 *
 * 最后一列是刚出现的下级，默认选第 0 项。
 */
function applyColumns(path: string[]): void {
  const next = buildAreaColumns(tree.value, path)
  columns.value = next
  indexes.value = next.map((nodes, level) => {
    const wanted = path[level]
    if (!wanted) {
      return 0
    }
    const index = nodes.findIndex(node => node.no === wanted)
    return index >= 0 ? index : 0
  })
}

async function init(): Promise<void> {
  if (props.field.widget !== 'address') {
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const envelope = await areaAdjSelect(undefined, AREA_PAGE_SIZE)
    const rows = envelope.data ?? []

    // 截断检测：少了一部分区县而界面毫无提示，是最坏的一种失败
    const total = Number(envelope.page?.total ?? 0)
    if (total > rows.length) {
      errorMessage.value = `地区数据不完整（${rows.length} / ${total}），请稍后重试`
      toast(errorMessage.value)
    }

    tree.value = buildAreaTree(rows)
    applyColumns([])

    // 回填：已作答时把路径展开到对应层级
    const saved = current.value
    if (saved) {
      const path = findPath(tree.value.roots, tree.value.childrenOf, String(saved))
      if (path.length) {
        applyColumns(path)
        labels.value = path.map(no => labelOf(no))
      }
    }
  }
  catch (error) {
    // 失败必须与「确实没有数据」区分开
    errorMessage.value = error instanceof BxError ? error.message : '地区数据加载失败'
    toast(errorMessage.value)
  }
  finally {
    loading.value = false
  }
}

/** 从根开始找到目标编号的路径（含目标本身）；找不到返回空数组 */
function findPath(
  roots: AreaNode[],
  childrenOf: (no: string) => AreaNode[],
  target: string,
): string[] {
  const walk = (nodes: AreaNode[], trail: string[]): string[] => {
    for (const node of nodes) {
      const next = [...trail, node.no]
      if (node.no === target) {
        return next
      }
      const deeper = walk(childrenOf(node.no), next)
      if (deeper.length) {
        return deeper
      }
    }
    return []
  }
  return walk(roots, [])
}

function labelOf(no: string): string {
  const find = (nodes: AreaNode[]): string => {
    for (const node of nodes) {
      if (node.no === no) {
        return node.label
      }
      const deeper = find(tree.value.childrenOf(node.no))
      if (deeper) {
        return deeper
      }
    }
    return ''
  }
  return find(tree.value.roots) || no
}

/** 级联：换上一级就按内存里的树重算下级，不再发请求 */
function onColumnChange(event: { detail: { column: number, value: number } }): void {
  const { column, value } = event.detail
  indexes.value[column] = value

  const picked = columns.value[column]?.[value]
  if (!picked) {
    return
  }

  /**
   * 用「已选到当前级」的路径重算各列：更深层级自动截断
   *
   * **这里刻意不动 `labels`** —— `labels` 是「已确认」的展示文案。
   * 滑动过程中就改它，用户**取消**后控件会显示一个从没确认过的选择。
   * 确认时 `onConfirm` 会从 `columns` / `indexes` 重新算，不需要这里预置。
   */
  const path = columns.value
    .slice(0, column + 1)
    .map((nodes, level) => nodes[indexes.value[level] ?? 0]?.no ?? '')
    .filter(Boolean)

  applyColumns(path)
}

function onConfirm(): void {
  const parts: string[] = []
  for (let level = 0; level < columns.value.length; level += 1) {
    const picked = columns.value[level]?.[indexes.value[level] ?? 0]
    if (!picked) {
      break
    }
    parts.push(picked.label)
    if (level === columns.value.length - 1) {
      labels.value = parts
      emit('update:modelValue', picked.no)
    }
  }
}

watch(() => props.field.key, () => {
  tree.value = buildAreaTree([])
  columns.value = [[]]
  indexes.value = [0]
  labels.value = []
  errorMessage.value = ''
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
      range-key="label"
      :disabled="props.disabled || loading || !hasOptions"
      @columnchange="onColumnChange"
      @change="onConfirm"
    >
      <view class="bx-address__control" :class="{ 'bx-address__control--disabled': props.disabled }">
        <text v-if="display" class="bx-address__text">{{ display }}</text>
        <text v-else class="bx-address__placeholder">
          {{ loading ? '正在加载地区…' : (hasOptions ? '请选择地区' : '暂无地区数据') }}
        </text>
        <!-- 箭头用 CSS 绘制：文字符号「›」的字形随系统字体变化，<svg> 在小程序里不可用 -->
        <view class="bx-address__arrow" aria-hidden="true" />
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
  min-height: var(--bx-control-height);
  padding: 12px 14px;
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-address__control--disabled {
  cursor: not-allowed;
  opacity: var(--bx-disabled-opacity);
}

.bx-address__text {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: var(--bx-text);
}

.bx-address__placeholder {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: var(--bx-text-4);
}

.bx-address__arrow {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: 10px;
  border-top: 1.5px solid var(--bx-text-3);
  border-right: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
}
</style>
