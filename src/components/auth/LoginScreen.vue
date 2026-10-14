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
            <text v-if="remember" class="login-remember__tick">✓</text>
          </view>
          <text class="login-remember__text">记住我</text>
        </view>

        <text v-if="errorMessage" class="login-card__error" role="alert">{{ errorMessage }}</text>

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
  background: linear-gradient(170deg, #f7faff 0%, var(--bx-bg) 46%, #eef3fb 100%);
}

.login-screen__glow {
  position: absolute;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  pointer-events: none;
}

.login-screen__glow--a {
  top: -160px;
  left: -120px;
  background: radial-gradient(circle, rgba(0, 122, 255, 0.16) 0%, rgba(0, 122, 255, 0) 68%);
}

.login-screen__glow--b {
  right: -140px;
  bottom: -180px;
  background: radial-gradient(circle, rgba(0, 122, 255, 0.12) 0%, rgba(0, 122, 255, 0) 70%);
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
  font-size: 56px;
  font-weight: 300;
  line-height: 1.1;
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
  padding: 28px 22px 24px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-shadow-card);
}

.login-card__notice {
  display: block;
  margin-bottom: 20px;
  font-size: 16px;
  font-weight: 500;
  color: var(--bx-text);
  text-align: center;
}

.login-card__error {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--bx-danger);
  text-align: center;
}

.login-card__hint {
  display: block;
  margin-top: 16px;
  font-size: 12px;
  color: var(--bx-text-3);
  text-align: center;
}

/* ── 输入框 ── */

.login-field {
  margin-bottom: 14px;
}

.login-field__input {
  box-sizing: border-box;
  width: 100%;
  height: 48px;
  padding: 0 18px;
  font-size: 15px;
  color: var(--bx-text);
  background-color: var(--bx-bg);
  border: 1px solid transparent;
  border-radius: 999px;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.login-field__input:focus {
  background-color: var(--bx-surface);
  border-color: var(--bx-blue);
}

.login-field__placeholder {
  color: var(--bx-text-3);
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
  width: 18px;
  height: 18px;
  margin-right: 8px;
  border: 1px solid var(--bx-line);
  border-radius: 4px;
  background-color: var(--bx-surface);
}

.login-remember__box--checked {
  background-color: var(--bx-blue);
  border-color: var(--bx-blue);
}

.login-remember__tick {
  font-size: 12px;
  line-height: 1;
  color: #fff;
}

.login-remember__text {
  font-size: 13px;
  color: var(--bx-text-2);
}

/* 键盘用户要能看到焦点在哪 */
.login-remember:focus-visible {
  outline: 2px solid var(--bx-blue);
  outline-offset: 3px;
  border-radius: 4px;
}
</style>
