<script setup lang="ts">
import { computed } from 'vue'

/**
 * 按钮
 *
 * V2（规范 §6.1）：
 * - 变体：`primary` 墨蓝实心 / `secondary` 白底描边 / `ghost` 无底 / `danger` 危险描边
 * - 尺寸：`small` 32 / `normal` 44 / `large` 52
 * - 按下：`transform: scale(.985)` 90ms，抬起 160ms ease-out
 * - 加载：16px 环形 spinner（不改变按钮宽度），浅底按钮用 `currentColor`
 *
 * `text` 是旧名：语义等同 `ghost`（无底文字按钮），保留是为了让既有调用点
 * 不会突然变成裸文字 —— 但新代码请直接写 `ghost`。
 */
interface Props {
  type?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'text'
  size?: 'small' | 'normal' | 'large'
  block?: boolean
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'primary',
  size: 'normal',
  block: false,
  disabled: false,
  loading: false,
})

const emit = defineEmits<{ click: [] }>()

const inactive = computed(() => props.disabled || props.loading)

function onClick(): void {
  if (inactive.value) {
    return
  }
  emit('click')
}

/**
 * 键盘激活
 *
 * 用 <view> 渲染的按钮天然不可聚焦（实测 tabIndex=-1、role 为空），键盘用户
 * 根本到不了 —— 连提交问卷都做不到。这里补齐：
 *   - role="button" 让屏幕阅读器认出这是按钮
 *   - tabindex 让它进入 Tab 序列（禁用时移出，避免停在不可用的控件上）
 *   - Enter / Space 激活，符合按钮的键盘约定
 *
 * Space 要 preventDefault，否则页面会滚动。小程序端没有 DOM 键盘事件，
 * 这几个属性和事件由 uni-app 忽略或转译，不影响小程序。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  // Space 默认会滚动页面，Enter 在表单里可能触发提交
  event.preventDefault()
  onClick()
}
</script>

<template>
  <view
    class="bx-button"
    :class="[
      `bx-button--${props.type}`,
      `bx-button--${props.size}`,
      { 'bx-button--block': props.block, 'bx-button--disabled': inactive },
    ]"
    role="button"
    :tabindex="inactive ? -1 : 0"
    :aria-disabled="inactive ? 'true' : 'false'"
    :aria-busy="props.loading ? 'true' : 'false'"
    hover-class="bx-button--hover"
    :hover-stay-time="60"
    @click="onClick"
    @keydown="onKeydown"
  >
    <!--
      加载态用真 spinner 而不是「···」：三个点读起来像「省略」，而且宽度会跳。
      文案保留在插槽里，只多出一个 16px 的环，按钮宽度不抖。
    -->
    <view v-if="props.loading" class="bx-button__loading" aria-hidden="true" />
    <slot />
  </view>
</template>

<style lang="scss" scoped>
/*
 * 按钮
 *
 * 规范 §6.1：尺寸 32 / 44 / 52 三档，圆角 12（控件档 `--bx-radius`）。
 * 颜色只取令牌：主色实心、白底描边、无底文字、危险描边。
 */
.bx-button {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: var(--bx-control-height-md);
  padding: 0 20px;
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: 1;
  /* 所有变体都带同宽的透明边框：primary 与 ghost 的盒模型一致，并排时不差 1px */
  border: 1px solid transparent;
  border-radius: var(--bx-radius);
  /* 可点击元素要有手型光标，否则用户看不出它能点（实测原来是 auto） */
  cursor: pointer;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    color var(--bx-duration-fast) var(--bx-ease-out),
    /* 抬起 160ms ease-out；按下时由 :active 单独收窄到 90ms */
    transform 160ms var(--bx-ease-out);
}

/*
 * 焦点可见性：uni-app 内置样式把 outline 设成 none。用 :focus-visible 补回来，
 * 只在键盘聚焦时显示。注意选择器要落到 uni-app 真正渲染出的元素上 —— 这里
 * `.bx-button` 本身就在 <uni-view> 上，不需要 :deep()。
 */
.bx-button:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.bx-button--block {
  width: 100%;
}

.bx-button--small {
  height: var(--bx-control-height-sm);
  padding: 0 12px;
  font-size: var(--bx-font-sub);
  border-radius: var(--bx-radius-sm);
}

.bx-button--large {
  height: var(--bx-control-height-lg);
  padding: 0 24px;
}

/* ── 变体 ────────────────────────────────────────────────────────── */

/* primary：墨蓝实心，白字 7.5:1 */
.bx-button--primary {
  color: #fff;
  background-color: var(--bx-primary);
}

/* secondary：白底 + 描边（次级操作：暂存草稿 / 返回 / 重答） */
.bx-button--secondary {
  color: var(--bx-text);
  background-color: var(--bx-surface);
  border-color: var(--bx-line-strong);
}

/* ghost：无底，只有文字（页面里的次要跳转） */
.bx-button--ghost {
  color: var(--bx-primary);
  background-color: transparent;
}

/* danger：危险描边，不整块涂红 */
.bx-button--danger {
  color: var(--bx-danger);
  background-color: var(--bx-surface);
  border-color: var(--bx-danger-line);
}

/* text：旧名，等同 ghost，但保持旧版「贴合文字、无最小高度」的排版 */
.bx-button--text {
  height: auto;
  padding: 0;
  color: var(--bx-primary);
  background-color: transparent;
}

/*
 * 悬停反馈（只给指针设备）
 *
 * 规范 §5.3：hover 反馈只给指针设备。uni-app 的 `hover-class` 在 H5 上是
 * **按下**态（实测 uni-h5 的 useHover 只绑 onMousedown / onTouchstart，
 * 鼠标移上去并不会加类），所以桌面端的悬停反馈必须自己写。
 *
 * 用 `@media (hover: hover)` 圈住：触屏设备命中的是「无悬停」分支，
 * 不会出现「手指离开后按钮还停在悬停色」这种粘滞状态。
 */
@media (hover: hover) {
  .bx-button--primary:hover {
    background-color: var(--bx-primary-hover);
  }

  .bx-button--secondary:hover {
    color: var(--bx-primary);
    background-color: var(--bx-surface-2);
    border-color: var(--bx-primary-line);
  }

  .bx-button--ghost:hover,
  .bx-button--text:hover {
    background-color: var(--bx-primary-soft);
  }

  .bx-button--danger:hover {
    background-color: var(--bx-danger-soft);
    border-color: var(--bx-danger);
  }
}

/*
 * 按下反馈（hover-class）
 *
 * 只改底色 / 描边 / 文字色，**不改透明度**：
 * 半透明的白字压在蓝底上会显脏（规范 §6.1）。
 */
.bx-button--primary.bx-button--hover {
  background-color: var(--bx-primary-active);
}

.bx-button--secondary.bx-button--hover {
  color: var(--bx-primary);
  background-color: var(--bx-surface-2);
  border-color: var(--bx-primary-line);
}

.bx-button--ghost.bx-button--hover,
.bx-button--text.bx-button--hover {
  background-color: var(--bx-primary-soft);
}

.bx-button--danger.bx-button--hover {
  background-color: var(--bx-danger-soft);
  border-color: var(--bx-danger);
}

.bx-button--disabled {
  cursor: not-allowed;
  opacity: var(--bx-disabled-opacity);
}

/*
 * 按下：scale(.985)
 *
 * 90ms 按下 / 160ms 抬起（规范 §5.2 第 7 条）。CSS 过渡的时长跟着「当前状态」
 * 走：:active 生效期间用 90ms，手指抬起后 :active 失效，基线的 160ms 接管 ——
 * 于是「按下快、抬起慢」这个手感不需要两套样式。
 */
.bx-button:active {
  transform: scale(0.985);
  transition-duration: 90ms;
}

/*
 * 小程序端没有 :active：hover-class 就是「按住」态，按下反馈走它。
 * H5 端 hover-class 同样是「按住」态，缩放交给上面的 :active，
 * 两端不会同时缩放（否则 H5 按下时缩放两次）。
 */
/* #ifndef H5 */
.bx-button--hover {
  transform: scale(0.985);
  transition-duration: 90ms;
}

/* #endif */

/*
 * 加载 spinner
 *
 * 16px 环形，不改变按钮宽度（文案照旧留在插槽里）。
 * 环用 `currentColor`：白底按钮上自动变深色，主色按钮上就是白色 ——
 * 不再为「浅底 / 深底」各写一套边框色。
 */
.bx-button__loading {
  flex: none;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: bx-button-spin 700ms var(--bx-ease-linear) infinite;
}

@keyframes bx-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
