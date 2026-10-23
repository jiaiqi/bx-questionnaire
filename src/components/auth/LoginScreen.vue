<script setup lang="ts">
/**
 * 全屏登录界面
 *
 * 结构（docs/UI-UX-V6-设计系统.md §5/§6）：
 * - 移动端：锁屏式单列 —— 品牌字、账号、密码（可切换明文）、记住我、通栏登录；
 * - H5 ≥900px：左右分栏 —— 左侧品牌与说明，右侧表单（**小程序端不出现分栏**）：
 *   分栏样式与左侧 DOM 都包在 `#ifdef H5` 里。
 *
 * 交互要点（每条都有理由，别当成随手写的）：
 * - 提交中**不再接受提交**：登录接口有频次限制，连续失败会锁号 1 小时，
 *   连点是最容易触发锁定的行为；
 * - 错误文案直接用平台返回的原文，不翻译成「登录失败」——
 *   用户需要知道是「密码错误」还是「账号已锁定」；
 * - 「记住我」只记账号，**绝不记密码**；
 * - 校验失败时抖动对应输入框：只弹一行字很容易被忽略。
 */

import { computed, nextTick, onUnmounted, ref } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import { useDialogFocus } from '@/composables/useDialogFocus'
import { useLogin } from '@/composables/useLogin'
import { toast } from '@/utils/ui'

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
/** 密码明文切换：只影响显示，不改变提交值 */
const showPassword = ref(false)

const shakingField = ref<'userNo' | 'password' | ''>('')
let shakeTimer: ReturnType<typeof setTimeout> | null = null

onUnmounted(() => {
  if (shakeTimer) {
    clearTimeout(shakeTimer)
  }
})

/**
 * 校验失败：抖一下比只弹一行字更容易被看到
 *
 * 幅度 6px、时长 400ms、**只抖一次**：
 * 循环抖动会让人以为界面卡住了。定时器比动画长一点点，
 * 保证动画播完再摘掉 class，下一次失败能重新触发。
 */
function shake(field: 'userNo' | 'password'): void {
  shakingField.value = field
  if (shakeTimer) {
    clearTimeout(shakeTimer)
  }
  shakeTimer = setTimeout(() => {
    shakingField.value = ''
  }, 420)
}

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

function togglePassword(): void {
  showPassword.value = !showPassword.value
}

// ── 忘记密码弹层 ─────────────────────────────────────────

/** 弹层态：点击「忘记密码？」打开，说明联系管理员重置密码（不改后端） */
const forgotOpen = ref(false)
const forgotPanelEl = ref<HTMLElement | null>(null)
/** 可复制的账号：去掉首尾空格，空值时按钮不出现 */
const accountForCopy = computed(() => userNo.value.trim())

/** 先声明再赋值：关闭回调里要用到它，避免函数提升带来的循环引用 */
let forgotFocus: ReturnType<typeof useDialogFocus> | null = null

function closeForgot(): void {
  if (!forgotOpen.value) {
    return
  }
  forgotOpen.value = false
  forgotFocus?.deactivate()
}

function openForgot(): void {
  forgotOpen.value = true
  forgotFocus?.activate()
  void nextTick().then(() => forgotFocus?.focusPanel())
}

function copyAccount(): void {
  const account = accountForCopy.value
  if (!account) {
    toast('请先在上方填写账号')
    return
  }
  uni.setClipboardData({
    data: account,
    success: () => toast('账号已复制'),
    fail: () => toast('复制失败，请手动记下账号'),
  })
}

forgotFocus = useDialogFocus(forgotPanelEl, () => closeForgot())

/** 可点的 view / 开关 / 眼睛按钮共用：Enter 与 Space 都触发 */
function onToggleKeydown(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  action()
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
    <!-- H5 宽屏的左侧品牌区：小程序端不渲染（避免出现分栏） -->
    <!-- #ifdef H5 -->
    <view class="login-aside">
      <view class="login-aside__brand">
        <view class="login-aside__mark" aria-hidden="true">
          问
        </view>
        <view class="login-aside__brand-main">
          <text class="login-aside__word">园区问卷</text>
          <text class="login-aside__tag">健康与体验调研</text>
        </view>
      </view>

      <view class="login-aside__body">
        <text class="login-aside__title">登录后，继续你的问卷。</text>
        <text class="login-aside__desc">
          查看已完成的测评、历史作答与结果详情。作答记录仅本人可见，不会用于绩效评估。
        </text>
      </view>

      <text class="login-aside__foot">© 2026 园区服务中心 · 内部系统</text>
    </view>
    <!-- #endif -->

    <view class="login-screen__body">
      <view class="login-form">
        <!-- 移动端品牌字：宽屏时由左侧品牌区接管 -->
        <view class="login-brand">
          <view class="login-brand__mark" aria-hidden="true">
            问
          </view>
          <view class="login-brand__main">
            <text class="login-brand__word">园区问卷</text>
            <text class="login-brand__tag">健康与体验调研</text>
          </view>
        </view>

        <text class="login-form__title">登录你的账号</text>
        <text class="login-form__sub">查看已完成的测评与历史作答</text>
        <text class="login-form__notice">{{ props.notice }}</text>

        <view class="login-field" :class="{ 'login-field--shake': shakingField === 'userNo' }">
          <text class="login-field__label">账号</text>
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
          <text class="login-field__label">密码</text>
          <view class="login-pass">
            <input
              class="login-field__input login-pass__input"
              :password="!showPassword"
              :value="password"
              placeholder="请输入密码"
              placeholder-class="login-field__placeholder"
              aria-label="密码"
              :disabled="submitting"
              @input="onPasswordInput"
              @confirm="onSubmit"
            >
            <!--
              自绘眼睛：小程序端没有可用的原生控件，用两块纯 CSS 图形拼出
              「睁眼 / 闭眼」，不用图标字体也不用 svg（小程序不支持 svg）。
            -->
            <view
              class="login-pass__toggle"
              role="button"
              tabindex="0"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword ? 'true' : 'false'"
              @click="togglePassword"
              @keydown="onToggleKeydown($event, togglePassword)"
            >
              <view class="login-eye" :class="{ 'login-eye--off': showPassword }" aria-hidden="true" />
            </view>
          </view>
        </view>

        <!-- 记住我 + 忘记密码：两个次级操作同一行，不抢登录按钮的注意力 -->
        <view class="login-extras">
          <view
            class="login-remember"
            role="switch"
            :aria-checked="remember ? 'true' : 'false'"
            aria-label="记住我"
            tabindex="0"
            @click="toggleRemember"
            @keydown="onToggleKeydown($event, toggleRemember)"
          >
            <view class="login-remember__track" :class="{ 'login-remember__track--on': remember }">
              <view class="login-remember__knob" />
            </view>
            <text class="login-remember__text">记住我</text>
          </view>

          <view
            class="login-forgot"
            role="button"
            tabindex="0"
            aria-haspopup="dialog"
            :aria-expanded="forgotOpen ? 'true' : 'false'"
            @click="openForgot"
            @keydown="onToggleKeydown($event, openForgot)"
          >
            忘记密码？
          </view>
        </view>

        <!--
          用 aria-live 而不是 role="alert"：scripts/a11y.mjs 的选择器含 [role]，
          会给命中元素加上「必须可聚焦」的要求，而一行错误文本不该进 Tab 序列。
          `login-card__error` 是 scripts/login-e2e.mjs 读取错误原文的稳定钩子，保留。
        -->
        <text
          v-if="errorMessage"
          class="login-form__error login-card__error"
          aria-live="assertive"
        >
          {{ errorMessage }}
        </text>

        <BxButton type="primary" size="large" block :loading="submitting" @click="onSubmit">
          {{ submitting ? '登录中' : '登录' }}
        </BxButton>

        <text class="login-form__hint">登录即表示同意按园区规定使用本系统</text>
        <text class="login-form__hint">账号由园区统一发放</text>
      </view>
    </view>

    <!-- 忘记密码弹层：说明联系行政服务中心重置，可复制当前账号（不改后端） -->
    <view v-if="forgotOpen" class="forgot-layer">
      <view class="forgot-scrim" @click="closeForgot" />

      <view
        ref="forgotPanelEl"
        class="forgot-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bx-forgot-title"
        tabindex="-1"
      >
        <view class="forgot-head">
          <text id="bx-forgot-title" class="forgot-title">忘记密码？</text>
          <view
            class="forgot-close"
            role="button"
            tabindex="0"
            aria-label="关闭忘记密码说明"
            @click="closeForgot"
            @keydown="onToggleKeydown($event, closeForgot)"
          >
            <view class="forgot-close__icon" aria-hidden="true" />
          </view>
        </view>

        <view class="forgot-note">
          <view class="forgot-note__icon" aria-hidden="true">
            <view class="forgot-note__bar" />
            <view class="forgot-note__dot" />
          </view>
          <text class="forgot-note__text">
            账号密码由园区统一管理。请联系行政服务中心（内线 8100）重置密码，
            重置后使用新密码登录。
          </text>
        </view>

        <view class="forgot-account">
          <text class="forgot-account__label">当前账号</text>
          <text
            v-if="accountForCopy"
            class="forgot-account__value"
          >
            {{ accountForCopy }}
          </text>
          <text v-else class="forgot-account__value forgot-account__value--empty">
            尚未填写，可先在上方输入账号
          </text>
          <view
            v-if="accountForCopy"
            class="forgot-account__copy"
            role="button"
            tabindex="0"
            aria-label="复制当前账号"
            @click="copyAccount"
            @keydown="onToggleKeydown($event, copyAccount)"
          >
            复制账号
          </view>
        </view>

        <BxButton type="primary" block @click="closeForgot">
          知道了
        </BxButton>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/*
 * 页面底：冷白画布
 *
 * 移动端单列、内容垂直居中；H5 宽屏在下面单独切成左右分栏。
 */
.login-screen {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bx-bg);
}

/* 宽屏左侧品牌区：只在 H5 的宽屏媒体查询里显示 */
.login-aside {
  display: none;
}

.login-screen__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 40px 20px 32px;
}

/* ── 移动端品牌字 ───────────────────────────────────────────────── */
.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login-brand__mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--bx-radius);
  background-color: var(--bx-primary);
  color: #fff;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1;
}

.login-brand__main {
  min-width: 0;
}

.login-brand__word {
  display: block;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.02em;
  color: var(--bx-text);
}

.login-brand__tag {
  display: block;
  margin-top: 1px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

/* ── 表单 ───────────────────────────────────────────────────────── */
.login-form {
  display: flex;
  flex-direction: column;
}

.login-form__title {
  margin-top: 32px;
  font-size: var(--bx-font-title);
  font-weight: 600;
  line-height: var(--bx-leading-title);
  letter-spacing: -0.02em;
  color: var(--bx-text);
}

.login-form__sub {
  margin-top: 4px;
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
}

.login-form__notice {
  margin-top: 8px;
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-3);
}

.login-field {
  margin-top: 20px;
}

.login-field__label {
  display: block;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

/* 输入框：白底 + 1px line 描边 + 圆角 10 + 44 高 */
.login-field__input {
  box-sizing: border-box;
  width: 100%;
  height: var(--bx-control-height-md);
  margin-top: 6px;
  padding: 0 12px;
  font-size: var(--bx-font-body);
  color: var(--bx-text);
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

.login-field__input:focus-within {
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
}

/* 外层的描边变化是主指示；内层再补焦点环 —— 可访问性审计读的是 activeElement 自身 */
:deep(.login-field__input .uni-input-input:focus-visible) {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.login-field__placeholder {
  color: var(--bx-text-4);
}

/* 密码框：右侧留出 44px 的切换按钮 */
.login-pass {
  position: relative;
}

.login-pass__input {
  padding-right: 48px;
}

.login-pass__toggle {
  position: absolute;
  top: 50%;
  right: 2px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transform: translateY(-50%);
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .login-pass__toggle:hover {
    background-color: var(--bx-surface-2);
  }
}

.login-pass__toggle:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

/* 眼睛：椭圆轮廓 + 瞳孔；明文状态下加一道斜线 */
.login-eye {
  position: relative;
  width: 18px;
  height: 12px;
  border: 1.5px solid var(--bx-text-3);
  border-radius: 50%;
}

.login-eye::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background-color: var(--bx-text-3);
}

.login-eye--off::before {
  content: '';
  position: absolute;
  top: 50%;
  left: -2px;
  width: 22px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: var(--bx-text-3);
  transform: rotate(-35deg);
}

/* ── 记住我 / 忘记密码 ──────────────────────────────────────────── */
.login-extras {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.login-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  cursor: pointer;
}

.login-remember:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
  border-radius: var(--bx-radius-sm);
}

/* 忘记密码：文字级次级操作，44px 触摸目标 */
.login-forgot {
  display: inline-flex;
  align-items: center;
  flex: none;
  min-height: 44px;
  padding: 0 4px;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  line-height: var(--bx-leading-sub);
  color: var(--bx-primary);
  cursor: pointer;
  border-radius: var(--bx-radius-xs);
}

@media (hover: hover) {
  .login-forgot:hover {
    color: var(--bx-primary-hover);
  }
}

.login-forgot:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

/* 开关：轨道 36×21、滑块 17；开 = 主色 */
.login-remember__track {
  position: relative;
  flex: none;
  width: 36px;
  height: 21px;
  border-radius: var(--bx-radius-pill);
  background-color: var(--bx-line-strong);
  transition: background-color var(--bx-duration-base) var(--bx-ease-out);
}

.login-remember__track--on {
  background-color: var(--bx-primary);
}

.login-remember__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background-color: var(--bx-surface);
  box-shadow: var(--bx-elev-1);
  transition: transform var(--bx-duration-base) var(--bx-ease-out);
}

.login-remember__track--on .login-remember__knob {
  transform: translateX(15px);
}

.login-remember__text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

/* ── 错误与提交 ─────────────────────────────────────────────────── */
.login-form__error {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-danger);
}

.login-form .bx-button {
  margin-top: 20px;
}

.login-form__hint {
  display: block;
  margin-top: 8px;
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-3);
  text-align: center;
}

/* ── 错误抖动 ───────────────────────────────────────────────────── */
.login-field--shake {
  animation: login-shake 400ms var(--bx-ease-out);
}

@keyframes login-shake {
  0%,
  100% {
    transform: translateX(0);
  }

  20% {
    transform: translateX(-6px);
  }

  40% {
    transform: translateX(6px);
  }

  60% {
    transform: translateX(-4px);
  }

  80% {
    transform: translateX(3px);
  }
}

/* ── 忘记密码弹层 ───────────────────────────────────────────────── */
.forgot-layer {
  position: fixed;
  inset: 0;
  z-index: var(--bx-z-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.forgot-scrim {
  position: absolute;
  inset: 0;
  background-color: var(--bx-overlay);
  animation: forgot-fade var(--bx-duration-base) var(--bx-ease-out);
}

.forgot-panel {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 360px;
  padding: 20px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-3);
  animation: forgot-in var(--bx-duration-base) var(--bx-ease-out);
}

.forgot-panel:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.forgot-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.forgot-title {
  flex: 1;
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1.4;
  color: var(--bx-text);
}

.forgot-close {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .forgot-close:hover {
    background-color: var(--bx-surface-2);
  }
}

.forgot-close:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

/* 关闭图标：两根 45° 细线（不用文字符号） */
.forgot-close__icon {
  position: relative;
  width: 16px;
  height: 16px;
}

.forgot-close__icon::before,
.forgot-close__icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 16px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: var(--bx-text-2);
  border-radius: 1px;
}

.forgot-close__icon::before {
  transform: rotate(45deg);
}

.forgot-close__icon::after {
  transform: rotate(-45deg);
}

/* 说明块：浅灰底 + 1px 描边，和提交信息页的隐私卡同构 */
.forgot-note {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  padding: 12px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-md);
}

/* 提示图标：圆圈 + 感叹号（两块 CSS 图形） */
.forgot-note__icon {
  position: relative;
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border: 1.5px solid var(--bx-text-3);
  border-radius: 50%;
  color: var(--bx-text-3);
}

.forgot-note__bar {
  position: absolute;
  top: 3px;
  left: 50%;
  width: 1.5px;
  height: 5px;
  margin-left: -0.75px;
  background-color: currentColor;
  border-radius: 1px;
}

.forgot-note__dot {
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 2px;
  height: 2px;
  margin-left: -1px;
  border-radius: 50%;
  background-color: currentColor;
}

.forgot-note__text {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-sub);
  line-height: 1.7;
  color: var(--bx-text-2);
}

/* 当前账号：可复制给管理员，避免用户在电话里念错 */
.forgot-account {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-top: 12px;
  padding: 12px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-md);
}

.forgot-account__label {
  flex: none;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.forgot-account__value {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  line-height: var(--bx-leading-sub);
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.forgot-account__value--empty {
  font-weight: 400;
  color: var(--bx-text-3);
}

.forgot-account__copy {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 2px;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  color: var(--bx-primary);
  cursor: pointer;
  border-radius: var(--bx-radius-xs);
}

.forgot-account__copy:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.forgot-panel .bx-button {
  margin-top: 16px;
}

@keyframes forgot-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes forgot-in {
  from {
    transform: translateY(8px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/*
 * H5 宽屏（≥900px）：左右分栏
 *
 * 整段包在条件编译里：小程序端（含微信 PC 宽窗口）不会出现分栏。
 * 左侧品牌区同样是 H5 专属 DOM，两端结构一致但小程序不渲染它。
 */
/* #ifdef H5 */
@media (min-width: 900px) {
  .login-screen {
    flex-direction: row;
  }

  .login-aside {
    display: flex;
    flex: 1 1 52%;
    flex-direction: column;
    box-sizing: border-box;
    padding: 48px 56px;
    background-color: var(--bx-surface-2);
    border-right: 1px solid var(--bx-line);
  }

  .login-aside__brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .login-aside__mark {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: var(--bx-radius);
    background-color: var(--bx-primary);
    color: #fff;
    font-size: var(--bx-font-h2);
    font-weight: 600;
    line-height: 1;
  }

  .login-aside__word {
    display: block;
    font-size: var(--bx-font-h2);
    font-weight: 600;
    line-height: 1.4;
    color: var(--bx-text);
  }

  .login-aside__tag {
    display: block;
    margin-top: 1px;
    font-size: var(--bx-font-caption);
    line-height: var(--bx-leading-caption);
    letter-spacing: 0.08em;
    color: var(--bx-text-3);
  }

  .login-aside__body {
    margin-top: auto;
    margin-bottom: auto;
    padding: 48px 0;
  }

  .login-aside__title {
    display: block;
    max-width: 12em;
    font-size: var(--bx-font-display);
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.02em;
    color: var(--bx-text);
  }

  .login-aside__desc {
    display: block;
    max-width: 30em;
    margin-top: 16px;
    font-size: var(--bx-font-body);
    line-height: 1.75;
    color: var(--bx-text-2);
  }

  .login-aside__foot {
    font-size: var(--bx-font-caption);
    line-height: var(--bx-leading-caption);
    letter-spacing: 0.04em;
    color: var(--bx-text-3);
  }

  .login-screen__body {
    flex: 1 1 48%;
    justify-content: center;
    max-width: none;
    padding: 48px 56px;
  }

  .login-form {
    width: 100%;
    max-width: 380px;
    margin: 0 auto;
  }

  /* 宽屏由左侧品牌区承担品牌字 */
  .login-brand {
    display: none;
  }

  .login-form__title {
    margin-top: 0;
  }
}
/* #endif */
</style>
