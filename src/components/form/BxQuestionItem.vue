<script setup lang="ts">
import type { QuestionField } from '@/domain/questionnaire'

import { computed } from 'vue'

import { stripQuestionTitleIndex } from '@/domain/questionnaire'

interface Props {
  field: QuestionField
  /** 错误提示，非空时展示红框 */
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  error: '',
})

/**
 * 题干
 *
 * 序号不再拼进文案，而是由左边的序号胶囊承载（后端 `item_title` 常自带
 * 「1. 」前缀，所以这里先剥掉，否则会出现「① 1. 您的姓名」）。
 */
const title = computed(() => stripQuestionTitleIndex(props.field.label))

/** 分节符不占题号；`index` 为 0 时也不显示胶囊 */
const showNo = computed(() => props.field.widget !== 'section' && Number(props.field.index) > 0)
</script>

<template>
  <view
    :id="`q-${props.field.key}`"
    class="bx-question"
    :class="{ 'bx-question--error': !!props.error, 'bx-question--section': props.field.widget === 'section' }"
  >
    <view class="bx-question__head">
      <!--
        序号胶囊：长问卷里它是「我答到第几题」最直接的锚点，也让题干有了固定的
        左边界。此前序号混在题干文字里（「1. 您的姓名」），字号与颜色都与正文相同，
        扫读时无法定位。
      -->
      <text v-if="showNo" class="bx-question__no">{{ props.field.index }}</text>
      <view class="bx-question__main">
        <!--
          必填星号必须紧跟题干：此前它是 flex 兄弟，被 `.bx-question__title { flex: 1 }`
          推到卡片最右端（PC 上跨度可达 700px），与题干失去关联；而编辑器里同一个星号
          是紧跟 label 的 —— 同一件事两种表达。放进同一个 <text> 里，让它随文字自然换行。
        -->
        <text class="bx-question__title">{{ title }}<text v-if="props.field.required" class="bx-question__required">*</text></text>

        <!-- 只有多选控件才提示「多选题」；图片题的 multi 表示可上传多张，不是多选题 -->
        <text v-if="props.field.widget === 'checkbox'" class="bx-question__hint">多选题 · 可选择多项</text>
        <text v-else-if="props.field.widget !== 'section' && !props.field.required" class="bx-question__hint bx-question__hint--optional">选填</text>
      </view>
    </view>

    <view class="bx-question__body">
      <slot />
    </view>

    <text v-if="props.error" class="bx-question__error">{{ props.error }}</text>
  </view>
</template>

<style lang="scss" scoped>
.bx-question {
  padding: 20px 16px;
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
  padding: 12px 16px;
  background-color: transparent;
  box-shadow: none;
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
  background-color: var(--bx-danger-soft);
  box-shadow: inset 3px 0 0 var(--bx-danger);
}

.bx-question__head {
  display: flex;
  align-items: flex-start;
}

/* 22px 胶囊：够窄，不挤压题干；又比纯文字醒目，滚动时能当锚点 */
.bx-question__no {
  flex: none;
  min-width: 22px;
  height: 22px;
  margin-top: 1px;
  margin-right: 10px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
  color: var(--bx-primary);
  text-align: center;
  background-color: var(--bx-primary-soft);
  border-radius: var(--bx-radius-sm);
}

.bx-question__main {
  flex: 1;
  min-width: 0;
}

.bx-question__title {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--bx-text);
  /* 用 break-all 而不是 break-word：小程序对后者的支持不完全，长串（URL、编号）会溢出 */
  word-break: break-all;
}

.bx-question__required {
  /* 不再是 flex 子项（已内联到题干里），所以只留一个贴字间距 */
  margin-left: 2px;
  font-size: 17px;
  line-height: 1.55;
  color: var(--bx-danger);
}

.bx-question__hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
}

.bx-question__hint--optional {
  color: var(--bx-text-4);
}

.bx-question__body {
  margin-top: 16px;
}

.bx-question__error {
  display: block;
  margin-top: 10px;
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-danger);
}
</style>
