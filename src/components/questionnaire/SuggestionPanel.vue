<script setup lang="ts">
/**
 * 评估建议面板
 *
 * `assessmentResult/assessmentResult` 与 `survey/result` 共用。
 *
 * 数据来自 `srvdaq_activity_sug_select`，按 `activity_no` + `fill_batch_no` 查询。
 * 对照老工程（assessmentResult.vue）：后端**已按活动与批次筛好**适用区间，
 * 前端不再按分数二次过滤，直接把返回行渲染出来即可 ——
 * 老工程就是 `this.assessmentReport = res.data.data` + `{{ item.sug_desc }}`。
 *
 * 字段名是 `sug_desc`（老工程两处渲染都用它），不是 sug_content；
 * 老工程也没有使用 min_score / max_score。
 *
 * 视觉（规范 §7.3）：建议是**引用块** —— 左侧 2px 主色条，不整块上色。
 */

import type { DaqActivitySugRow } from '@/api/daq/types'

import { computed, ref } from 'vue'

import { activitySugSelect } from '@/api/daq/record'
import BxEmpty from '@/components/base/BxEmpty.vue'
import { useEmbedResize } from '@/composables/useEmbedResize'
import { BxError } from '@/utils/request'

interface Props {
  activityNo: string
  fillBatchNo?: string
}

const props = withDefaults(defineProps<Props>(), {
  fillBatchNo: '',
})

// 建议条数不定，内容高度变化幅度大；嵌入场景下要同步给父页面，
// 否则父页面的 iframe 会停在初始高度、把后面的建议裁掉。
// 老工程只在 survey/result.vue 里做了这件事，assessmentResult.vue 漏了。
useEmbedResize()

const loading = ref(false)
const loaded = ref(false)
const errorMessage = ref('')
const suggestions = ref<DaqActivitySugRow[]>([])

const visible = computed(() => suggestions.value.filter(item => !!item.sug_desc))

async function load(): Promise<void> {
  if (!props.activityNo) {
    errorMessage.value = '缺少活动编号'
    return
  }
  // 老工程 assessmentResult.vue 的 onLoad 是 `if (option.activity_no && option.fill_batch_no)`
  // —— 两个参数都有才发请求。缺批次号时服务端返回的是「系统繁忙，请稍后再试」，
  // 那是网关的兜底文案，用户看不懂，也没法据此判断该怎么办。
  // 这里保留同样的拦截，但给出明确提示（老工程是页面全空白）。
  if (!props.fillBatchNo) {
    errorMessage.value = '缺少作答批次号'
    loaded.value = true
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const envelope = await activitySugSelect({
      activityNo: props.activityNo,
      fillBatchNo: props.fillBatchNo,
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
    <view v-if="loading" class="sug__skeleton" aria-busy="true">
      <view class="sug__skeleton-card" />
      <view class="sug__skeleton-card" />
    </view>

    <BxEmpty
      v-else-if="errorMessage"
      :text="errorMessage"
      tip="请确认链接是否有效"
    />

    <BxEmpty
      v-else-if="loaded && visible.length === 0"
      text="暂无评估建议"
      tip="该问卷可能未配置建议内容"
    />

    <view v-else class="sug__list">
      <view class="sug__head">
        <view class="sug__rule" />
        <text class="sug__title">评估建议</text>
      </view>

      <!--
        引用块：左侧 2px 主色条表达「这是一条建议」，
        比整块浅底更克制 —— 整块上色会让建议看起来像正文的一部分。
      -->
      <view
        v-for="(item, index) in visible"
        :key="index"
        class="sug-card"
      >
        <text class="sug-card__content">{{ item.sug_desc }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 加载：两块骨架保持布局稳定，比一行「正在加载…」更符合"内容马上来"的预期 */
.sug__skeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sug__skeleton-card {
  height: 76px;
  padding-left: 14px;
  background-color: var(--bx-line-2);
  border-left: 2px solid var(--bx-line);
  border-radius: 0 var(--bx-radius-sm) var(--bx-radius-sm) 0;
}

.sug__list {
  display: flex;
  flex-direction: column;
}

/* 小节标题：一条短横线 + 文字 */
.sug__head {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  padding-left: 2px;
}

.sug__rule {
  width: 24px;
  height: 2px;
  margin-right: 10px;
  background-color: var(--bx-line-strong);
  border-radius: 1px;
}

.sug__title {
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

.sug-card {
  padding: 2px 0 2px 14px;
  border-left: 2px solid var(--bx-primary);
}

.sug-card + .sug-card {
  margin-top: 16px;
}

.sug-card__content {
  display: block;
  font-size: var(--bx-font-body);
  line-height: var(--bx-leading-body);
  color: var(--bx-text-2);
  word-break: break-all;
}
</style>
