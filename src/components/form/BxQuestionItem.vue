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
 * 序号不再拼进文案，而是由题号承载（后端 `item_title` 常自带「1. 」前缀，
 * 所以这里先剥掉，否则会出现「01 1. 您的姓名」）。
 */
const title = computed(() => stripQuestionTitleIndex(props.field.label))

/** 分节符不占题号；`index` 为 0 时也不显示题号 */
const showNo = computed(() => props.field.widget !== 'section' && Number(props.field.index) > 0)

/** 两位题号（01 / 02）：个位数补零，竖排扫读时左边缘对齐 */
const noText = computed(() => String(props.field.index).padStart(2, '0'))

const isSection = computed(() => props.field.widget === 'section')
</script>

<template>
  <view
    :id="`q-${props.field.key}`"
    class="bx-question"
    :class="{ 'bx-question--error': !!props.error, 'bx-question--section': isSection }"
  >
    <!--
      题号：11px 微标签 + 中性色 + 等宽数字（V6 §3.2 --fs-micro）

      它是扫读时的位置锚点，不是标题的一部分，所以单独占一行 meta；
      不参与题干换行，长题干也不会把它挤到行尾。
    -->
    <view v-if="showNo" class="bx-question__meta">
      <text class="bx-question__no">{{ noText }}</text>
    </view>

    <view class="bx-question__head">
      <!--
        必填星号必须紧跟题干：此前它是 flex 兄弟，被推到卡片最右端（PC 上跨度可达
        700px），与题干失去关联；放进同一个 <text> 里，让它随文字自然换行。
      -->
      <text class="bx-question__title">{{ title }}<text v-if="props.field.required" class="bx-question__required">*</text></text>

      <!--
        只有多选控件才提示「多选题」；图片题的 multi 表示可上传多张，不是多选题。
        用括号而不是中点：V6 §3.2 禁止中点连接 meta（「A · B · C」读起来像日志）。
      -->
      <text v-if="props.field.widget === 'checkbox'" class="bx-question__hint">多选题（可选择多项）</text>
      <text v-else-if="props.field.widget !== 'section' && !props.field.required" class="bx-question__hint bx-question__hint--optional">选填</text>
    </view>

    <view class="bx-question__body">
      <slot />
    </view>

    <text v-if="props.error" class="bx-question__error">{{ props.error }}</text>
  </view>
</template>

<style lang="scss" scoped>
/*
 * 题目（V6 §4.1「题目卡内边距 20/16」）
 *
 * **题目自身不画卡片**：整卷是一张连续的纸，纸面由作答页的 `.runner__paper`
 * 承载（白底 + 1px 描边 + 圆角 14 + --bx-elev-1），题与题之间只有一条
 * `--bx-line-2` 细线。层级因此从「十几张同权重的卡」变成「一份卷」，
 * 长问卷才不会读成盒子山。
 *
 * 分隔线用 `border-top` + `:not(:first-child)`：同一个元素、同一个属性，
 * 不会与相邻题叠成 2px；第一题顶部靠 padding 的 20px 留白。
 */
.bx-question {
  position: relative;
  box-sizing: border-box;
  padding: 20px 16px;
  background-color: transparent;
  border-radius: 0;
  box-shadow: none;
}

.bx-question:not(:first-child) {
  border-top: 1px solid var(--bx-line-2);
}

/*
 * 分节符：卷内的小节标题，不占题号、不画卡片、不参与分隔线节奏
 *
 * 类名被 QuestionnaireRunner 的 `:deep(.bx-question--section)::before` 依赖
 * （那条 24px 短横线），改名会一起失效。
 */
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
 * 错误态：不铺浅红底（浅红底会把「一题有错」放大成「整页报错」），
 * 用三处同时表达 —— 题号转危险色、子控件描边转危险色、下方 12px 红字文案。
 * 状态不只靠颜色（V6 §8.2）。
 *
 * 这些子控件都没有 error prop（接口保持不变），错误描边由题卡统一下发。
 */
.bx-question--error .bx-question__no {
  color: var(--bx-danger);
}

.bx-question--error :deep(.bx-text__control),
.bx-question--error :deep(.bx-picker),
.bx-question--error :deep(.bx-address__control),
.bx-question--error :deep(.bx-ref__control) {
  border-color: var(--bx-danger);
}

/* 选中的选项行保持主色描边；未选中的行转危险浅描边（与原型 .is-invalid 一致） */
.bx-question--error :deep(.bx-option:not(.bx-option--on)) {
  border-color: var(--bx-danger-line);
}

/* 悬停也不能盖掉错误描边：子组件的 hover 与错误态同权重，这里显式提高一档 */
.bx-question--error :deep(.bx-text__control:hover),
.bx-question--error :deep(.bx-picker:hover),
.bx-question--error :deep(.bx-address__control:hover),
.bx-question--error :deep(.bx-ref__control:hover) {
  border-color: var(--bx-danger);
}

/*
 * 「有错误 + 正在聚焦」时仍要能看出错误
 *
 * 子控件自己的聚焦态（.bx-text__control:focus-within）同样命中，
 * 这里用更具体的选择器把错误优先：描边保持危险色，光环换成危险浅底，
 * 聚焦依然可见，但可见的是「这里要改」。
 */
.bx-question--error :deep(.bx-text__control:focus-within),
.bx-question--error :deep(.bx-text__control--focus) {
  border-color: var(--bx-danger);
  box-shadow: 0 0 0 3px var(--bx-danger-soft);
}

/* ── 题号 ─────────────────────────────────────────────────────────── */

.bx-question__meta {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

/*
 * 题号：11px / 500 / 0.08em 字距（V6 §3.2 micro 档）
 *
 * 数字用 `tabular-nums`：等宽数字不跳动，题号列在扫读时是稳定的锚点。
 */
.bx-question__no {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}

/* ── 题干 ─────────────────────────────────────────────────────────── */

.bx-question__head {
  display: flex;
  flex-direction: column;
}

/* 题干：17 / 600 / 1.5（V6 §3.2 h2 档），是卷里唯一的「标题」 */
.bx-question__title {
  display: block;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1.5;
  color: var(--bx-text);
  /* 用 break-all 而不是 break-word：小程序对后者的支持不完全，长串（URL、编号）会溢出 */
  word-break: break-all;
}

.bx-question__required {
  /* 星号内联在题干里，只留一个贴字间距，保证它是「紧跟题干」而不是飘在行尾 */
  margin-left: 2px;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  color: var(--bx-danger);
}

/* 题型提示 / 「选填」：13px 元信息，不抢题干 */
.bx-question__hint {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-sub);
  line-height: 1.6;
  color: var(--bx-text-3);
}

/* 「选填」是信息，不能用占位符色 --bx-text-4（V6 §2.1 限定 text-4 只做占位与装饰） */
.bx-question__hint--optional {
  color: var(--bx-text-3);
}

/* 题干与作答区 16px（V6 §4.1） */
.bx-question__body {
  margin-top: var(--bx-space-md);
}

/* 行内红字：12px（V6 §5.2），淡入 180ms 只解释「刚刚发生了什么」 */
.bx-question__error {
  display: block;
  margin-top: 8px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
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
