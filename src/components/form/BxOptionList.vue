<script setup lang="ts">
import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { toArray } from '@/domain/questionnaire'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

function isSelected(optionNo: string): boolean {
  return toArray(props.modelValue).includes(optionNo)
}

function toggle(optionNo: string): void {
  if (props.disabled) {
    return
  }

  if (props.field.multi) {
    const current = toArray(props.modelValue)
    const next = current.includes(optionNo)
      ? current.filter(no => no !== optionNo)
      : [...current, optionNo]
    emit('update:modelValue', next)
    return
  }

  // 单选再次点击不取消，避免产生空作答
  emit('update:modelValue', optionNo)
}

/**
 * 键盘激活
 *
 * 选项用 <view> 渲染，天然不可聚焦（与 BxButton 同一类问题）。问卷的**核心
 * 操作就是选选项**，键盘用户够不到就等于无法答题。
 *
 * 用 Enter / Space 激活，符合 radio 与 checkbox 的键盘约定。Space 要
 * preventDefault，否则页面会滚动。
 */
function onKeydown(event: KeyboardEvent, optionNo: string): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  toggle(optionNo)
}
</script>

<template>
  <view
    class="bx-options"
    :role="props.field.multi ? 'group' : 'radiogroup'"
    :aria-label="props.field.label"
  >
    <view
      v-for="option in props.field.options"
      :key="option.no"
      class="bx-option"
      :class="{ 'bx-option--on': isSelected(option.no), 'bx-option--disabled': props.disabled }"
      :role="props.field.multi ? 'checkbox' : 'radio'"
      :aria-checked="isSelected(option.no) ? 'true' : 'false'"
      :aria-disabled="props.disabled ? 'true' : 'false'"
      :tabindex="props.disabled ? -1 : 0"
      hover-class="bx-option--hover"
      :hover-stay-time="60"
      @click="toggle(option.no)"
      @keydown="onKeydown($event, option.no)"
    >
      <!--
        标记：单选 = 圆环（环内实心点），多选 = 圆角方框（白色对勾）。
        对勾用两条边框旋转而成（小程序不支持 <svg>）。
      -->
      <view class="bx-option__mark" :class="props.field.multi ? 'bx-option__mark--box' : 'bx-option__mark--dot'">
        <view v-if="isSelected(option.no)" class="bx-option__inner" />
      </view>
      <text class="bx-option__label">{{ option.label }}</text>
    </view>

    <view v-if="props.field.options.length === 0" class="bx-options__empty">
      <text class="bx-options__empty-text">该题暂无可选项</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-options {
  display: flex;
  flex-direction: column;
}

/*
 * 整行可点的选项（规范 §6.2）
 *
 * 每条 48px 高、整行可点；行与行之间 6px。
 * 选中态由「底色 + 描边 + 标记」三处同时表达（不只靠颜色，色觉障碍用户也能分辨），
 * **不给整行文字上色，也不加左侧色条** —— 左侧色条是错误态的专属语言。
 */
.bx-option {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-height: var(--bx-control-height);
  padding: 12px 14px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  /* 可点击元素要有手型光标 */
  cursor: pointer;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 相邻兄弟间距 6px（规范 §6.2） */
.bx-option + .bx-option {
  margin-top: 6px;
}

.bx-option--disabled {
  cursor: not-allowed;
  opacity: var(--bx-disabled-opacity);
}

/*
 * 焦点可见性：uni-app 内置样式把 outline 设成 none。用 :focus-visible 补回来，
 * 只在键盘聚焦时显示。`.bx-option` 本身就在 <uni-view> 上，不需要 :deep()。
 */
.bx-option:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

/* 悬停：底色转内嵌档，描边转主色浅调（规范 §5.2 第 4 条） */
.bx-option--hover {
  background-color: var(--bx-surface-2);
  border-color: var(--bx-primary-line);
}

/* 选中：主色浅底 + 主色描边（规范 §6.2） */
.bx-option--on {
  background-color: var(--bx-primary-soft);
  border-color: var(--bx-primary);
}

/* 悬停在已选中的行上时，选中态保持不变 */
.bx-option--on.bx-option--hover {
  background-color: var(--bx-primary-soft);
  border-color: var(--bx-primary);
}

/*
 * 悬停反馈（只给指针设备）
 *
 * 规范 §5.3：hover 反馈只给指针设备。uni-app 的 `hover-class` 在 H5 上是
 * **按下**态（实测 uni-h5 的 useHover 只绑 onMousedown / onTouchstart），
 * 桌面端把鼠标移上去并不会加类 —— 所以悬停反馈要自己写。
 *
 * `@media (hover: hover)`：触屏设备不命中，避免「手指离开后还停在悬停色」。
 */
@media (hover: hover) {
  .bx-option:hover {
    background-color: var(--bx-surface-2);
    border-color: var(--bx-primary-line);
  }

  .bx-option--on:hover {
    background-color: var(--bx-primary-soft);
    border-color: var(--bx-primary);
  }
}

/* 18px 标记：单选圆环 / 多选圆角方框 */
.bx-option__mark {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  margin-right: 12px;
  background-color: var(--bx-surface);
  border: 1.5px solid var(--bx-line-strong);
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-option__mark--dot {
  border-radius: 50%;
}

.bx-option__mark--box {
  border-radius: var(--bx-radius-xs);
}

/*
 * 选中：标记实心
 *
 * 单选与多选的「实心」不是一回事（规范 §6.2）：
 * - 单选 = 圆环 + **环内的实心点**：环仍然是环，只是描边转主色、中心多一个点
 * - 多选 = 圆角方框整体填实 + 白色对勾
 */
.bx-option--on .bx-option__mark--dot {
  background-color: var(--bx-surface);
  border-color: var(--bx-primary);
}

.bx-option--on .bx-option__mark--box {
  background-color: var(--bx-primary);
  border-color: var(--bx-primary);
}

/* 单选：环内的实心点 */
.bx-option__mark--dot .bx-option__inner {
  width: 8px;
  height: 8px;
  background-color: var(--bx-primary);
  border-radius: 50%;
}

/* 多选：白色对勾，用两条边框旋转而成（小程序不支持 <svg>） */
.bx-option__mark--box .bx-option__inner {
  position: relative;
  width: 12px;
  height: 12px;
}

.bx-option__mark--box .bx-option__inner::after {
  content: '';
  position: absolute;
  top: 0;
  left: 3px;
  width: 5px;
  height: 9px;
  border-right: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: rotate(45deg);
}

/*
 * 选中：标记 `scale(.7→1)`，200ms spring（规范 §5.2 第 2 条）
 *
 * 标记元素在选中时才挂载，动画因此每次选中都播一次；取消时元素直接移除，
 * 行的底色与描边用 120ms 过渡回退（反向、无位移，规范 §5.2 第 3 条）。
 */
.bx-option__inner {
  animation: bx-option-mark-in var(--bx-duration-base) var(--bx-ease-spring) both;
}

@keyframes bx-option-mark-in {
  from {
    transform: scale(0.7);
  }

  to {
    transform: scale(1);
  }
}

.bx-option__label {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-body);
  line-height: var(--bx-leading-body);
  color: var(--bx-text-2);
  transition: color var(--bx-duration-fast) var(--bx-ease-out);
  word-break: break-all;
}

/* 选中只提字重与深度，不用彩色文字：长选项整行变蓝会显得吵 */
.bx-option--on .bx-option__label {
  font-weight: 500;
  color: var(--bx-text);
}

.bx-options__empty {
  padding: 12px 0;
}

.bx-options__empty-text {
  font-size: var(--bx-font-sub);
  color: var(--bx-text-3);
}
</style>
