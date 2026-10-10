<script setup lang="ts">
/**
 * 评估建议面板
 *
 * `assessmentResult/assessmentResult` 与 `survey/result` 共用；
 * 数据来自 `srvdaq_activity_sug_select`（按活动 + 批次号取分数区间建议）。
 */

import type { DaqActivitySugRow } from '@/api/daq/types'

import { computed, ref } from 'vue'

import { activitySugSelect } from '@/api/daq/record'
import BxEmpty from '@/components/base/BxEmpty.vue'
import { BxError } from '@/utils/request'

interface Props {
  activityNo: string
  fillBatchNo?: string
  /** 当前得分，用于标记命中的建议区间 */
  score?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  fillBatchNo: '',
  score: null,
})

const loading = ref(false)
const loaded = ref(false)
const errorMessage = ref('')
const suggestions = ref<DaqActivitySugRow[]>([])

const visible = computed(() => suggestions.value.filter(item => !!item.sug_content))

function inRange(item: DaqActivitySugRow): boolean {
  if (props.score === null || props.score === undefined) {
    return false
  }
  const min = Number(item.min_score ?? Number.NEGATIVE_INFINITY)
  const max = Number(item.max_score ?? Number.POSITIVE_INFINITY)
  return props.score >= min && props.score <= max
}

async function load(): Promise<void> {
  if (!props.activityNo) {
    errorMessage.value = '缺少活动编号'
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const envelope = await activitySugSelect({
      activityNo: props.activityNo,
      fillBatchNo: props.fillBatchNo || undefined,
    })
    suggestions.value = envelope.data ?? []
  }
  catch (error) {
    errorMessage.value = error instanceof BxError ? error.message : '评估结果加载失败'
  }
  finally {
    loading.value = false
    loaded.value = true
  }
}

defineExpose({ load })

void load()
</script>

<template>
  <view class="sug">
    <view v-if="loading" class="sug__state">
      <text class="sug__state-text">正在加载评估结果…</text>
    </view>

    <BxEmpty
      v-else-if="errorMessage"
      :text="errorMessage"
      tip="请确认链接是否有效"
    />

    <BxEmpty
      v-else-if="loaded && visible.length === 0"
      text="暂无评估建议"
      tip="该问卷可能未配置分数区间建议"
    />

    <view v-else class="sug__list">
      <view
        v-for="item in visible"
        :key="`${String(item.min_score)}-${String(item.max_score)}`"
        class="sug-card"
        :class="{ 'sug-card--active': inRange(item) }"
      >
        <view class="sug-card__head">
          <text class="sug-card__range">
            {{ item.min_score ?? '—' }} ~ {{ item.max_score ?? '—' }} 分
          </text>
          <text v-if="inRange(item)" class="sug-card__badge">本次得分</text>
        </view>
        <text class="sug-card__content">{{ item.sug_content }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.sug__state {
  padding: 64px 0;
  text-align: center;
}

.sug__state-text {
  font-size: 14px;
  color: var(--bx-text-3);
}

.sug__list {
  display: flex;
  flex-direction: column;
}

.sug-card {
  padding: 16px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
}

.sug-card:not(:first-child) {
  margin-top: 8px;
}

.sug-card--active {
  background-color: var(--bx-blue-soft);
}

.sug-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sug-card__range {
  font-size: 14px;
  font-weight: 500;
  color: var(--bx-blue);
}

.sug-card__badge {
  padding: 2px 8px;
  font-size: 12px;
  color: #fff;
  background-color: var(--bx-blue);
  border-radius: 4px;
}

.sug-card__content {
  display: block;
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--bx-text-2);
  word-break: break-all;
}
</style>
