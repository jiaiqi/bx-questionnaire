<script setup lang="ts">
/**
 * 全屏登录界面
 *
 * 形态参考 bx-data-v 的锁屏式登录弹窗：整屏铺满、顶部时钟、药丸输入框、
 * 校验失败抖动、回车即提交。配色改用本工程的设计令牌（`tokens.scss`），
 * 不引第二套视觉语言 —— 否则同一个应用会出现两种蓝、两种圆角。
 *
 * 交互要点（每条都有理由，别当成随手写的）：
 * - 提交中**不再接受提交**：登录接口有频次限制，连续失败会锁号 1 小时，
 *   连点是最容易触发锁定的行为；
 * - 错误文案直接用平台返回的原文，不翻译成「登录失败」——
 *   用户需要知道是「密码错误」还是「账号已锁定」；
 * - 「记住我」只记账号，**绝不记密码**；
 * - 校验失败时抖动对应输入框：只弹一行字很容易被忽略。
 */

import { computed, onMounted, onUnmounted, ref } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import { useLogin } from '@/composables/useLogin'

interface Props {
  /** 顶部提示语，如「登录已过期，请重新登录」 */
  notice?: string
}

const props = withDefaults(defineProps<Props>(), { notice: '请登录后继续' })

const emit = defineEmits<{ success: [] }>()

const { submitting, errorMessage, rememberedUser, login, clearError } = useLogin()

/** 记住过账号就直接填上，用户只需要输密码 */
const userNo = ref(rememberedUser.value)
const password = ref('')
const remember = ref(rememberedUser.value !== '')

const shakingField = ref<'userNo' | 'password' | ''>('')
let shakeTimer: ReturnType<typeof setTimeout> | null = null

function shake(field: 'userNo' | 'password'): void {
  shakingField.value = field
  if (shakeTimer) {
    clearTimeout(shakeTimer)
  }
  shakeTimer = setTimeout(() => {
    shakingField.value = ''
  }, 500)
}

// ── 时钟 ────────────────────────────────────────────────

const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
  }
  if (shakeTimer) {
    clearTimeout(shakeTimer)
  }
})

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

const clockTime = computed(() => {
  const date = now.value
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
})

const clockDate = computed(() => {
  const date = now.value
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`
})

// ── 交互 ────────────────────────────────────────────────

function readInput(event: unknown): string {
  const detail = (event as { detail?: { value?: unknown } })?.detail
  return detail?.value === undefined || detail?.value === null ? '' : String(detail.value)
}

function onUserInput(event: unknown): void {
  userNo.value = readInput(event)
  clearError()
}

function onPasswordInput(event: unknown): void {
  password.value = readInput(event)
  clearError()
}

function toggleRemember(): void {
  remember.value = !remember.value
}

async function onSubmit(): Promise<void> {
  const result = await login(userNo.value, password.value, remember.value)

  if (result.ok) {
    // 登录成功后立刻清掉内存里的明文密码，不给它留任何被读到的窗口
    password.value = ''
    emit('success')
    return
  }

  if (result.field) {
    shake(result.field)
  }
}
</script>

<template>
  <view class="login-screen">
    <!-- 氛围光：用 radial-gradient 而不是 blur，后者在部分小程序内核上不支持 -->
    <view class="login-screen__glow login-screen__glow--a" />
    <view class="login-screen__glow login-screen__glow--b" />

    <view class="login-screen__body">
      <view class="login-clock">
        <text class="login-clock__time">{{ clockTime }}</text>
        <text class="login-clock__date">{{ clockDate }}</text>
      </view>

      <view class="login-card">
        <text class="login-card__notice">{{ props.notice }}</text>

        <view class="login-field" :class="{ 'login-field--shake': shakingField === 'userNo' }">
          <input
            class="login-field__input"
            type="text"
            :value="userNo"
            placeholder="请输入账号"
            placeholder-class="login-field__placeholder"
            aria-label="账号"
            :disabled="submitting"
            @input="onUserInput"
            @confirm="onSubmit"
          >
        </view>

        <view class="login-field" :class="{ 'login-field--shake': shakingField === 'password' }">
          <input
            class="login-field__input"
            :password="true"
            :value="password"
            placeholder="请输入密码"
            placeholder-class="login-field__placeholder"
            aria-label="密码"
            :disabled="submitting"
            @input="onPasswordInput"
            @confirm="onSubmit"
          >
        </view>

        <!--
          自绘勾选框：小程序端没有原生 checkbox 的样式控制能力，
          这里用 view + role/tabindex 补齐键盘与读屏支持（同 BxButton 的做法）。
        -->
        <view
          class="login-remember"
          role="checkbox"
          :aria-checked="remember ? 'true' : 'false'"
          aria-label="记住我"
          :tabindex="0"
          @click="toggleRemember"
          @keydown.enter.prevent="toggleRemember"
          @keydown.space.prevent="toggleRemember"
        >
          <view class="login-remember__box" :class="{ 'login-remember__box--checked': remember }">
            <view v-if="remember" class="login-remember__tick" aria-hidden="true" />
          </view>
          <text class="login-remember__text">记住我</text>
        </view>

        <!--
          用 aria-live 而不是 role="alert"：scripts/a11y.mjs 的选择器含 [role]，
          会给命中元素加上「必须可聚焦」的要求，而一行错误文本不该进 Tab 序列。
        -->
        <text v-if="errorMessage" class="login-card__error" aria-live="assertive">{{ errorMessage }}</text>

        <BxButton type="primary" block :loading="submitting" @click="onSubmit">
          {{ submitting ? '登录中' : '登 录' }}
        </BxButton>

        <text class="login-card__hint">登录即表示同意按园区规定使用本系统</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.login-screen {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  overflow: hidden;
  /*
   * 背景只用令牌：此前是写死的三段浅蓝渐变（#f7faff / #eef3fb），
   * 换主题时不会跟随，也把「主色」偷偷变成了「那个蓝」。
   */
  background-color: var(--bx-bg);
  background-image: radial-gradient(720px 380px at 50% 0%, var(--bx-primary-soft) 0%, rgba(255, 255, 255, 0) 70%);
}

.login-screen__glow {
  position: absolute;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  pointer-events: none;
}

/* 氛围光取主色浅底而不是 rgba(0,122,255,.16)：后者是旧蓝，且不跟随主题 */
.login-screen__glow--a {
  top: -160px;
  left: -120px;
  background: radial-gradient(circle, var(--bx-primary-soft) 0%, rgba(255, 255, 255, 0) 68%);
}

.login-screen__glow--b {
  right: -140px;
  bottom: -180px;
  background: radial-gradient(circle, var(--bx-primary-soft) 0%, rgba(255, 255, 255, 0) 70%);
}

.login-screen__body {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: var(--bx-content-width);
  padding: 0 16px 32px;
}

/* ── 时钟 ── */

.login-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28px;
}

.login-clock__time {
  /* tabular-nums：秒位变化时数字宽度不跳 */
  font-variant-numeric: tabular-nums;
  font-size: var(--bx-font-hero);
  font-weight: 600;
  line-height: var(--bx-leading-hero);
  color: var(--bx-text);
  letter-spacing: 2px;
}

.login-clock__date {
  margin-top: 6px;
  font-size: 14px;
  color: var(--bx-text-3);
}

/* ── 卡片 ── */

.login-card {
  padding: 28px 20px 24px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

/* 提示不是标题：用正文档 + 次级色，避免和时钟抢层级 */
.login-card__notice {
  display: block;
  margin-bottom: 20px;
  font-size: 15px;
  color: var(--bx-text-2);
  text-align: center;
}

.login-card__error {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-danger);
  text-align: center;
}

.login-card__hint {
  display: block;
  margin-top: 16px;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
  text-align: center;
}

/* ── 输入框 ── */

.login-field {
  margin-bottom: 14px;
}

/*
 * 药丸输入框：白底 + 描边立在浅灰页面上 —— 比「浅灰底 + 无描边」更能看出
 * 这里是可输入的。高度取控件档 48px。
 */
.login-field__input {
  box-sizing: border-box;
  width: 100%;
  height: var(--bx-control-height);
  padding: 0 18px;
  font-size: 15px;
  color: var(--bx-text);
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-chip);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 外层的描边变化是主指示；内层再补焦点环 —— 可访问性审计读的是 activeElement 自身 */
.login-field__input:focus-within {
  border-color: var(--bx-primary);
}

:deep(.login-field__input .uni-input-input:focus-visible) {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.login-field__placeholder {
  color: var(--bx-text-4);
}

/* 校验失败：抖一下比只弹一行字更容易被看到 */
.login-field--shake {
  animation: login-shake 0.42s ease;
}

@keyframes login-shake {
  0%,
  100% {
    transform: translateX(0);
  }

  20% {
    transform: translateX(-8px);
  }

  40% {
    transform: translateX(7px);
  }

  60% {
    transform: translateX(-5px);
  }

  80% {
    transform: translateX(3px);
  }
}

/* ── 记住我 ── */

.login-remember {
  display: flex;
  align-items: center;
  margin: 2px 0 18px 4px;
  cursor: pointer;
}

.login-remember__box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 8px;
  border: 1px solid var(--bx-line);
  border-radius: 6px;
  background-color: var(--bx-surface);
}

.login-remember__box--checked {
  background-color: var(--bx-primary);
  border-color: var(--bx-primary);
}

/* 对勾用两条边框旋转绘制：文字符号「✓」的字形随系统字体变化，粗细对不齐 */
.login-remember__tick {
  width: 10px;
  height: 10px;
  margin-bottom: 3px;
  border-right: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: rotate(45deg);
}

.login-remember__text {
  font-size: 13px;
  color: var(--bx-text-2);
}

/* 键盘用户要能看到焦点在哪 */
.login-remember:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 3px;
  border-radius: var(--bx-radius-sm);
}
</style>
