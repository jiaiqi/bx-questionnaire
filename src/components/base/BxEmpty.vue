<script setup lang="ts">
/**
 * 空状态
 *
 * 图形用**纯 CSS 绘制**（border + 伪元素），不用 `<svg>`：
 * 微信小程序不支持 svg 标签，而图标字体/外链图片又会增加主包体积。
 * 一个只由矩形与圆组成的抽象插画，跨四端表现一致。
 *
 * V2（规范 §6.1）：图形 + 一句说明 + 可选的操作。
 * 颜色刻意只用 `--bx-line*`（结构）加一点 `--bx-primary`（视线落点）：
 * 空态不该比页面上真正的内容更抢眼。
 */
interface Props {
  text?: string
  tip?: string
}

const props = withDefaults(defineProps<Props>(), {
  text: '暂无数据',
  tip: '',
})
</script>

<template>
  <view class="bx-empty">
    <view class="bx-empty__icon" aria-hidden="true">
      <view class="bx-empty__doc">
        <view class="bx-empty__line" />
      </view>
      <view class="bx-empty__badge" />
    </view>
    <text class="bx-empty__text">{{ props.text }}</text>
    <text v-if="props.tip" class="bx-empty__tip">{{ props.tip }}</text>
    <slot />
  </view>
</template>

<style lang="scss" scoped>
.bx-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--bx-space-2xl) var(--bx-space-lg);
}

.bx-empty__icon {
  position: relative;
  width: 96px;
  height: 96px;
  margin-bottom: var(--bx-space-md);
  /* currentColor 作为描边色，下面两层共用 */
  color: var(--bx-line-strong);
}

/* 文档主体：一张「还没写内容的纸」 */
.bx-empty__doc {
  position: absolute;
  top: 12px;
  left: 24px;
  width: 48px;
  height: 64px;
  background-color: var(--bx-surface);
  border: 2px solid currentColor;
  border-radius: var(--bx-radius-sm);
}

/* 三条占位横线：本体 + 两条伪元素，避免为装饰多开节点 */
.bx-empty__line {
  position: absolute;
  top: 18px;
  left: 9px;
  right: 9px;
  height: 2px;
  background-color: var(--bx-line-2);
  border-radius: 1px;
}

.bx-empty__line::before,
.bx-empty__line::after {
  content: '';
  position: absolute;
  left: 0;
  height: 2px;
  background-color: var(--bx-line-2);
  border-radius: 1px;
}

.bx-empty__line::before {
  top: 10px;
  right: 6px;
}

.bx-empty__line::after {
  top: 20px;
  right: 16px;
}

/* 唯一的品牌色落点：提示「这里缺的是内容，不是出错了」 */
.bx-empty__badge {
  position: absolute;
  right: 14px;
  bottom: 6px;
  width: 24px;
  height: 24px;
  background-color: var(--bx-surface);
  border: 2px solid var(--bx-primary);
  border-radius: 50%;
}

.bx-empty__badge::before {
  content: '';
  position: absolute;
  top: 4px;
  left: 50%;
  width: 2px;
  height: 7px;
  margin-left: -1px;
  background-color: var(--bx-primary);
  border-radius: 1px;
}

.bx-empty__badge::after {
  content: '';
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 3px;
  height: 3px;
  margin-left: -2px;
  background-color: var(--bx-primary);
  border-radius: 50%;
}

.bx-empty__text {
  font-size: var(--bx-font-body);
  line-height: var(--bx-leading-body);
  color: var(--bx-text-2);
  text-align: center;
}

.bx-empty__tip {
  max-width: 280px;
  margin-top: var(--bx-space-xs);
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
  text-align: center;
}
</style>
