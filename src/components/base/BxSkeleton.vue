<script setup lang="ts">
/**
 * 骨架屏
 *
 * V2（规范 §6.1 / §5.2 第 9 条）：底色 `--bx-surface-2`，
 * 扫光用 `linear-gradient` 平移，1.4s linear infinite。
 *
 * 扫光只动 `transform`（规范 §5.3：只动 transform 与 opacity）——
 * 不动 background-position，那会让每帧都重绘一遍渐变。
 * 渐变本身画在一个 `::after` 覆盖层上，整体横向平移。
 */
interface Props {
  /** 占位行数 */
  lines?: number
  /** 单行高度（px） */
  height?: number
  /** 单行圆角（px） */
  radius?: number
}

const props = withDefaults(defineProps<Props>(), {
  lines: 3,
  height: 16,
  radius: 8,
})
</script>

<template>
  <!--
    纯装饰：内容还在路上，没有任何可读信息，因此对辅助技术隐藏。
    加载状态由页面上的可见文字承担（如「正在加载问卷…」）。
  -->
  <view class="bx-skeleton" aria-hidden="true">
    <view
      v-for="line in props.lines"
      :key="line"
      class="bx-skeleton__line"
      :style="{
        height: `${props.height}px`,
        borderRadius: `${props.radius}px`,
        width: props.lines > 1 && line === props.lines ? '60%' : '100%',
      }"
    />
  </view>
</template>

<style lang="scss" scoped>
.bx-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.bx-skeleton__line {
  position: relative;
  overflow: hidden;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-sm);
}

/* 扫光层：只在 transform 上动，渐变本身不重绘 */
.bx-skeleton__line::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--bx-skeleton-sheen) 50%,
    transparent 100%
  );
  transform: translateX(-100%);
  animation: bx-skeleton-sheen 1.4s var(--bx-ease-linear) infinite;
}

@keyframes bx-skeleton-sheen {
  to {
    transform: translateX(100%);
  }
}
</style>
