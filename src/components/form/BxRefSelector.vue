<script setup lang="ts">
/**
 * 引用题型选择器
 *
 * 对应老工程 `item_type === '引用'`（组件 type=Selector）：
 * 由题目配置动态指定数据源与取值列 ——
 * - `serviceName`：要调用的服务
 * - `srv_app`：应用名（缺省跟随全局 daq）
 * - `refed_col`：答案存哪一列的值
 * - `key_disp_col`：界面展示哪一列
 *
 * 配置优先取 `item_type_attr`（老工程写法），行上的独立列（servicename / refed_col /
 * key_disp_col / srv_app）作为兜底 —— 真实表里这两种来源都存在。
 *
 * V6（设计系统 §5.2 / §5.6）：选择入口与其它输入类同款（白底 + 1px 描边 +
 * 10px 圆角 + 44px 高）；底部弹层用 --bx-overlay 遮罩 + 白面 + 顶部圆角 20 +
 * 36×4 拖拽条 + --bx-elev-3，展开 260ms ease-out。
 */

import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed, ref, watch } from 'vue'

import { parseRefConfig } from '@/domain/questionnaire/refs'
import { BxError, bxSelect } from '@/utils/request'
import { toast } from '@/utils/ui'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { disabled: false })

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

interface RefOption {
  value: string
  label: string
}

const config = computed(() => parseRefConfig(props.field.raw as Record<string, unknown>) ?? {
  serviceName: '',
  valueCol: 'no',
  labelCol: 'name',
})

const visible = ref(false)
const loading = ref(false)
/** 加载失败的原因：必须与「确实没有数据」区分开 */
const errorMessage = ref('')
const options = ref<RefOption[]>([])
const draft = ref<string[]>([])

const selected = computed<string[]>(() => {
  const value = props.modelValue
  if (Array.isArray(value)) {
    return value.map(item => String(item))
  }
  return value === null || value === undefined || value === '' ? [] : [String(value)]
})

/** 已选值的展示文案：优先用已加载选项，否则直接显示原始值 */
const display = computed(() => {
  if (selected.value.length === 0) {
    return ''
  }
  return selected.value
    .map((value) => {
      const matched = options.value.find(item => item.value === value)
      return matched?.label ?? value
    })
    .join('、')
})

async function load(): Promise<void> {
  if (!config.value.serviceName) {
    toast('该引用题未配置数据源')
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const envelope = await bxSelect<Record<string, unknown>>({
      serviceName: config.value.serviceName,
      ...(config.value.app ? { app: config.value.app } : {}),
      colNames: ['*'],
      page: { pageNo: 1, rownumber: 200 },
    })

    options.value = (envelope.data ?? [])
      .map((row) => {
        const value = String(row[config.value.valueCol] ?? '')
        const label = String(row[config.value.labelCol] ?? value)
        return { value, label }
      })
      .filter(item => !!item.value)

    if (options.value.length === 0) {
      toast('数据源没有可选项')
    }
  }
  catch (error) {
    // 失败必须与「确实没有数据」区分开：否则权限/网络错误会被「暂无可选项」掩盖
    errorMessage.value = error instanceof BxError ? error.message : '引用数据加载失败'
    toast(errorMessage.value)
  }
  finally {
    loading.value = false
  }
}

async function open(): Promise<void> {
  if (props.disabled) {
    return
  }
  draft.value = [...selected.value]
  visible.value = true
  if (options.value.length === 0) {
    await load()
  }
}

function toggle(value: string): void {
  if (props.field.multi) {
    draft.value = draft.value.includes(value)
      ? draft.value.filter(item => item !== value)
      : [...draft.value, value]
    return
  }
  draft.value = draft.value[0] === value ? [] : [value]
}

function confirm(): void {
  emit('update:modelValue', props.field.multi ? [...draft.value] : (draft.value[0] ?? ''))
  visible.value = false
}

watch(() => props.field.key, () => {
  options.value = []
  draft.value = []
  visible.value = false
}, { immediate: true })

/**
 * 键盘激活
 *
 * 这个组件里有三处可点击的 <view>（选择入口 / 选项行 / 确定），用 <view> 渲染的元素
 * 天然不可聚焦 —— 键盘用户连题都答不了。统一走这一个入口，避免三处各写一遍
 * Enter / Space 判断（老工程正是「同一件事抄三遍，改一处漏两处」）。
 */
function keyboardActivate(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  action()
}
</script>

<template>
  <view class="bx-ref">
    <view
      class="bx-ref__control"
      :class="{ 'bx-ref__control--disabled': props.disabled }"
      role="button"
      tabindex="0"
      :aria-label="props.field.label"
      @click="open"
      @keydown="keyboardActivate($event, open)"
    >
      <text v-if="display" class="bx-ref__text">{{ display }}</text>
      <text v-else class="bx-ref__placeholder">请选择</text>
      <view class="bx-ref__arrow" aria-hidden="true" />
    </view>

    <view v-if="visible" class="bx-ref__mask" @click="visible = false">
      <view class="bx-ref__panel" @click.stop>
        <!-- 拖拽条：纯装饰，告诉用户「这是一张可以收起的底部面板」（V6 §5.6） -->
        <view class="bx-ref__grab" aria-hidden="true" />

        <view class="bx-ref__head">
          <text class="bx-ref__title">{{ props.field.label }}</text>
          <text
            class="bx-ref__close"
            role="button"
            tabindex="0"
            @click="visible = false"
            @keydown="keyboardActivate($event, () => { visible = false })"
          >
            关闭
          </text>
        </view>

        <scroll-view class="bx-ref__list" scroll-y>
          <view v-if="loading" class="bx-ref__state">
            <text class="bx-ref__state-text">正在加载…</text>
          </view>
          <!-- 错误态排在空态之前：否则权限/网络错误会被「暂无可选项」掩盖 -->
          <view v-else-if="errorMessage" class="bx-ref__state">
            <text class="bx-ref__state-text">{{ errorMessage }}</text>
            <text class="bx-ref__retry" @click="load">重新加载</text>
          </view>
          <view v-else-if="options.length === 0" class="bx-ref__state">
            <text class="bx-ref__state-text">暂无可选项</text>
          </view>
          <view
            v-for="option in options"
            v-else
            :key="option.value"
            class="bx-ref__item"
            :class="{ 'bx-ref__item--active': draft.includes(option.value) }"
            role="button"
            tabindex="0"
            :aria-pressed="draft.includes(option.value) ? 'true' : 'false'"
            @click="toggle(option.value)"
            @keydown="keyboardActivate($event, () => toggle(option.value))"
          >
            <text class="bx-ref__item-label">{{ option.label }}</text>
            <!-- 对勾同样用 CSS 画：文字符号「✓」的字形随字体变化 -->
            <view
              v-if="draft.includes(option.value)"
              class="bx-ref__item-check"
              aria-hidden="true"
            />
          </view>
        </scroll-view>

        <view class="bx-ref__foot">
          <text class="bx-ref__hint">{{ props.field.multi ? '可多选' : '单选' }}</text>
          <view
            class="bx-ref__confirm"
            role="button"
            tabindex="0"
            @click="confirm"
            @keydown="keyboardActivate($event, confirm)"
          >
            <text class="bx-ref__confirm-text">确定</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-ref {
  box-sizing: border-box;
  width: 100%;
}

/* 选择入口：与其它输入类同款（V6 §5.2） */
.bx-ref__control {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: var(--bx-control-height-md);
  padding: 0 12px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  cursor: pointer;
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 悬停只加强描边，不给浅灰底：与「禁用」的浅面区分开 */
@media (hover: hover) {
  .bx-ref__control:hover {
    border-color: var(--bx-line-strong);
  }
}

.bx-ref__control:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

/* 禁用：内嵌浅面 + 保留描边 */
.bx-ref__control--disabled {
  cursor: not-allowed;
  background-color: var(--bx-surface-2);
  border-color: var(--bx-line);
}

.bx-ref__text {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-body);
  line-height: 1.4;
  color: var(--bx-text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bx-ref__placeholder {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-body);
  line-height: 1.4;
  /* 占位符色只做提示，不承载信息（V6 §2.1） */
  color: var(--bx-text-4);
}

.bx-ref__control--disabled .bx-ref__text,
.bx-ref__control--disabled .bx-ref__placeholder {
  color: var(--bx-text-3);
}

/* 右向箭头用两条边框旋转绘制（文字符号字形随系统字体变化，小程序又不支持 <svg>） */
.bx-ref__arrow {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: 10px;
  border-top: 1.5px solid var(--bx-text-3);
  border-right: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
}

/*
 * 底部弹层（V6 §5.6 / §5.3 原型）
 *
 * 遮罩 `--bx-overlay`；面板白面、只圆上面两角（20）；顶部一根 36×4 拖拽条，
 * 告诉用户「这是一张可以收起的面板」，而不是一整页。
 */
.bx-ref__mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--bx-z-modal);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background-color: var(--bx-overlay);
  animation: bx-ref-mask-in var(--bx-duration-base) var(--bx-ease-out) both;
}

.bx-ref__panel {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--bx-content-width);
  max-height: 78vh;
  padding-bottom: env(safe-area-inset-bottom);
  overflow: hidden;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-lg) var(--bx-radius-lg) 0 0;
  box-shadow: var(--bx-elev-3);
  /* 展开：位移 + 淡入，260ms ease-out（V6 §6.1「展开收起」档） */
  animation: bx-ref-panel-in var(--bx-duration-slow) var(--bx-ease-out) both;
}

/* 拖拽条：36×4 强描边色，纯装饰 */
.bx-ref__grab {
  width: 36px;
  height: 4px;
  margin: 8px auto 0;
  background-color: var(--bx-line-strong);
  border-radius: var(--bx-radius-pill);
}

@keyframes bx-ref-mask-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes bx-ref-panel-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bx-ref__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 12px 4px 20px;
}

/* 弹层标题：17/600（V6 §3.2 h2 档） */
.bx-ref__title {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: var(--bx-leading-h2);
  color: var(--bx-text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 关闭：44×44 触摸目标 + 8px 圆角，文字 13px（不抢标题） */
.bx-ref__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0 8px;
  font-size: var(--bx-font-sub);
  line-height: 1;
  color: var(--bx-text-2);
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .bx-ref__close:hover {
    color: var(--bx-text);
    background-color: var(--bx-surface-2);
  }
}

.bx-ref__close:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.bx-ref__list {
  max-height: 46vh;
  padding: 4px 12px 12px;
}

.bx-ref__state {
  padding: 32px 0;
  text-align: center;
}

.bx-ref__state-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
}

/* 重试：行内次级操作，撑到 44 高的触摸目标 */
.bx-ref__retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: 4px;
  padding: 0 12px;
  font-size: var(--bx-font-sub);
  color: var(--bx-primary);
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
}

.bx-ref__retry:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

/* 选项行：48 高、8px 圆角、悬停浅一档面（V6 §5.3 弹层版） */
.bx-ref__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  min-height: var(--bx-control-height);
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--bx-radius-sm);
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    color var(--bx-duration-fast) var(--bx-ease-out);
}

.bx-ref__item + .bx-ref__item {
  margin-top: 4px;
}

.bx-ref__item:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

@media (hover: hover) {
  .bx-ref__item:hover {
    background-color: var(--bx-surface-2);
  }
}

/* 选中：浅靛底（与选项行同一套「落笔」语言，V6 §2.2） */
.bx-ref__item--active {
  background-color: var(--bx-primary-soft);
}

.bx-ref__item-label {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-body);
  line-height: 1.5;
  color: var(--bx-text);
  word-break: break-all;
}

.bx-ref__item--active .bx-ref__item-label {
  font-weight: 500;
  color: var(--bx-primary);
}

/* 对勾：两条边框旋转绘制；旋转后的视觉中心偏下，上移 3px 才落在行中央 */
.bx-ref__item-check {
  flex: none;
  width: 11px;
  height: 11px;
  margin-bottom: 3px;
  margin-left: 12px;
  border-right: 2px solid var(--bx-primary);
  border-bottom: 2px solid var(--bx-primary);
  transform: rotate(45deg);
}

.bx-ref__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--bx-line-2);
}

.bx-ref__hint {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

/* 确定：与 BxButton primary 同款（主色实心 + 白字，44 高，10 圆角） */
.bx-ref__confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  height: var(--bx-control-height-md);
  padding: 0 24px;
  background-color: var(--bx-primary);
  border-radius: var(--bx-radius);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .bx-ref__confirm:hover {
    background-color: var(--bx-primary-hover);
  }
}

.bx-ref__confirm:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.bx-ref__confirm-text {
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: 1;
  color: #fff;
}
</style>
