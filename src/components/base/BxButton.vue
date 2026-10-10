<script setup lang="ts">
interface Props {
  type?: 'primary' | 'ghost' | 'text'
  size?: 'normal' | 'small'
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

function onClick(): void {
  if (props.disabled || props.loading) {
    return
  }
  emit('click')
}
</script>

<template>
  <view
    class="bx-button"
    :class="[
      `bx-button--${props.type}`,
      `bx-button--${props.size}`,
      { 'bx-button--block': props.block, 'bx-button--disabled': props.disabled || props.loading },
    ]"
    hover-class="bx-button--hover"
    :hover-stay-time="60"
    @click="onClick"
  >
    <text v-if="props.loading" class="bx-button__loading">···</text>
    <slot />
  </view>
</template>

<style lang="scss" scoped>
.bx-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 18px;
  font-size: 15px;
  font-weight: 500;
  border-radius: var(--bx-radius);
}

.bx-button--block {
  width: 100%;
}

.bx-button--small {
  height: 36px;
  padding: 0 14px;
  font-size: 14px;
}

.bx-button--primary {
  color: #fff;
  background-color: var(--bx-blue);
}

.bx-button--ghost {
  color: var(--bx-text);
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
}

.bx-button--text {
  height: auto;
  padding: 0;
  color: var(--bx-blue);
  background-color: transparent;
}

.bx-button--hover {
  opacity: 0.86;
}

.bx-button--disabled {
  opacity: 0.45;
}

.bx-button__loading {
  margin-right: 6px;
  letter-spacing: 1px;
}
</style>
