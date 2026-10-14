<script setup lang="ts">
import type { QuestionField } from '@/domain/questionnaire'

import { computed } from 'vue'

import { formatQuestionTitle } from '@/domain/questionnaire'

interface Props {
  field: QuestionField
  /** 错误提示，非空时展示红框 */
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  error: '',
})

/** 题目文案；序号处理见 formatQuestionTitle（结果页共用同一函数，避免再次漏改） */
const title = computed(() => formatQuestionTitle(props.field.index, props.field.label))
</script>

<template>
  <view
    :id="`q-${props.field.key}`"
    class="bx-question"
    :class="{ 'bx-question--error': !!props.error, 'bx-question--section': props.field.widget === 'section' }"
  >
    <view class="bx-question__head">
      <!--
        必填星号必须紧跟题干：此前它是 flex 兄弟，被 `.bx-question__title { flex: 1 }`
        推到卡片最右端（PC 上跨度可达 700px），与题干失去关联；而编辑器里同一个星号
        是紧跟 label 的 —— 同一件事两种表达。放进同一个 <text> 里，让它随文字自然换行。
      -->
      <text class="bx-question__title">{{ title }}<text v-if="props.field.required" class="bx-question__required">*</text></text>
    </view>

    <!-- 只有多选控件才提示「多选题」；图片题的 multi 表示可上传多张，不是多选题 -->
    <text v-if="props.field.widget === 'checkbox'" class="bx-question__hint">多选题</text>

    <view class="bx-question__body">
      <slot />
    </view>

    <text v-if="props.error" class="bx-question__error">{{ props.error }}</text>
  </view>
</template>

<style lang="scss" scoped>
.bx-question {
  padding: 18px 16px;
  background-color: var(--bx-surface);
  /*
   * 圆角 + 层级阴影。
   *
   * 此前这里是**全工程唯一没有圆角的卡片**（实测 border-radius: 0），而
   * `.runner__intro` / `.cp-card` 等都是 12px —— 加上底色差只有一档，
   * 卡片边界只能靠猜（评审时我甚至把「卡片间隙」误读成了「题干灰带」）。
   */
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

.bx-question--section {
  padding: 10px 16px;
  background-color: transparent;
}

.bx-question--section .bx-question__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--bx-text-2);
}

.bx-question--section .bx-question__body {
  margin-top: 0;
}

.bx-question--error {
  background-color: #fff5f5;
  box-shadow: inset 3px 0 0 var(--bx-danger);
}

.bx-question__head {
  display: flex;
  align-items: flex-start;
}

.bx-question__title {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--bx-text);
  word-break: break-all;
}

.bx-question__required {
  /* 不再是 flex 子项（已内联到题干里），所以只留一个贴字间距 */
  margin-left: 2px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--bx-danger);
}

.bx-question__hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--bx-text-3);
}

.bx-question__body {
  margin-top: 14px;
}

.bx-question__error {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: var(--bx-danger);
}
</style>
