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
 * 序号不再拼进文案，而是由左边的题号承载（后端 `item_title` 常自带
 * 「1. 」前缀，所以这里先剥掉，否则会出现「① 1. 您的姓名」）。
 */
const title = computed(() => stripQuestionTitleIndex(props.field.label))

/** 分节符不占题号；`index` 为 0 时也不显示题号 */
const showNo = computed(() => props.field.widget !== 'section' && Number(props.field.index) > 0)

const isSection = computed(() => props.field.widget === 'section')
</script>

<template>
  <view
    :id="`q-${props.field.key}`"
    class="bx-question"
    :class="{ 'bx-question--error': !!props.error, 'bx-question--section': isSection }"
  >
    <view class="bx-question__head">
      <!--
        题号：中性色 + 等宽数字。

        此前是一个蓝色药丸（主色底 + 白字），在「一屏最多两处主色」的前提下
        太抢眼 —— 而且主色应该留给「一次落笔」（选中态）与主操作。
        现在只留一个中性数字，作为扫读时的位置锚点。
      -->
      <text v-if="showNo" class="bx-question__no">{{ props.field.index }}</text>
      <view class="bx-question__main">
        <!--
          必填星号必须紧跟题干：此前它是 flex 兄弟，被 `.bx-question__title { flex: 1 }`
          推到卡片最右端（PC 上跨度可达 700px），与题干失去关联；而编辑器里同一个星号
          是紧跟 label 的 —— 同一件事两种表达。放进同一个 <text> 里，让它随文字自然换行。
        -->
        <text class="bx-question__title">{{ title }}<text v-if="props.field.required" class="bx-question__required">*</text></text>

        <!--
          只有多选控件才提示「多选题」；图片题的 multi 表示可上传多张，不是多选题。
          用括号而不是中点：规范 §3.2 禁止中点连接 meta（「A · B · C」读起来像日志）。
        -->
        <text v-if="props.field.widget === 'checkbox'" class="bx-question__hint">多选题（可选择多项）</text>
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
/*
 * 题目
 *
 * V2（规范 §6.2）：**题目自身不画卡片**。
 * 一份问卷是一张连续的纸（纸面容器由作答页负责），题与题之间由一条
 * `--bx-line-2` 细线分开 —— 层级从「多张卡」变成「一份卷」。
 *
 * 分隔线用 `border-top` + `:not(:first-child)`：与作答页容器里的同源规则
 * 完全一致（同一个元素、同一个属性），不会叠成 2px。
 */
.bx-question {
  position: relative;
  padding: 20px 16px;
  background-color: transparent;
  border-radius: 0;
  box-shadow: none;
}

.bx-question:not(:first-child) {
  border-top: 1px solid var(--bx-line-2);
}

/* 分节符：纸内的小节标题，不占题号、不画卡片 */
.bx-question--section {
  padding: 16px 16px 4px;
}

.bx-question--section .bx-question__title {
  font-size: var(--bx-font-sub);
  font-weight: 600;
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

.bx-question--section .bx-question__body {
  margin-top: 0;
}

/*
 * 错误态：浅红底 + 左侧 3px 红条 + 行内红字（规范 §6.2）
 *
 * 红条用伪元素而不是 box-shadow：规范 §5.2 第 5 条要求红条 `scaleY(0→1)`，
 * 而阴影画出来的色条无法参与变换。
 */
.bx-question--error {
  background-color: var(--bx-danger-soft);
}

.bx-question--error::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background-color: var(--bx-danger);
  transform-origin: top center;
  animation: bx-question-error-bar var(--bx-duration-base) var(--bx-ease-out) both;
}

@keyframes bx-question-error-bar {
  from {
    transform: scaleY(0);
  }

  to {
    transform: scaleY(1);
  }
}

.bx-question__head {
  display: flex;
  align-items: flex-start;
}

/*
 * 题号：中性色 + 等宽数字
 *
 * 数字用 `tabular-nums`：等宽数字不跳动，题号列在扫读时是稳定的锚点。
 * 固定宽度 + 右对齐：一位与两位题号时，题干左沿仍然对齐。
 */
.bx-question__no {
  flex: none;
  width: 26px;
  margin-right: var(--bx-space-sm);
  font-size: var(--bx-font-body);
  font-weight: 600;
  line-height: var(--bx-leading-h2);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.bx-question__main {
  flex: 1;
  min-width: 0;
}

.bx-question__title {
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: var(--bx-leading-h2);
  color: var(--bx-text);
  /* 用 break-all 而不是 break-word：小程序对后者的支持不完全，长串（URL、编号）会溢出 */
  word-break: break-all;
}

.bx-question__required {
  /* 不再是 flex 子项（已内联到题干里），所以只留一个贴字间距 */
  margin-left: 1px;
  font-size: var(--bx-font-h2);
  line-height: var(--bx-leading-h2);
  color: var(--bx-danger);
}

.bx-question__hint {
  display: block;
  margin-top: 2px;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
}

.bx-question__hint--optional {
  /* 「选填」是信息（告诉用户这题可以跳过），不能占位符色 `--bx-text-4`：
     规范 §2.1 明确 text-4 仅用于占位符与装饰，不得承载信息。 */
  color: var(--bx-text-3);
}

.bx-question__body {
  margin-top: var(--bx-space-md);
}

/* 行内红字：淡入 200ms ease-out（规范 §5.2 第 5 条） */
.bx-question__error {
  display: block;
  margin-top: 10px;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-danger);
  animation: bx-question-error-in var(--bx-duration-base) var(--bx-ease-out) both;
}

@keyframes bx-question-error-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
