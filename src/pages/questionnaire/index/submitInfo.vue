<script setup lang="ts">
/**
 * 登记信息页（老工程 index/submitInfo）
 *
 * 老工程把表单序列化进 `?submitInfo=` 传给答题页，但答题页从未消费该参数，
 * 登记信息实际从未生效。新工程改为写入本地存储，由答题页按题目名称预填。
 *
 * 入参：activity_no
 */

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import { useAriaLabel } from '@/composables/useAriaLabel'
import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { readQuery } from '@/utils/query'
import { storage, STORAGE_KEYS } from '@/utils/storage'
import { toast } from '@/utils/ui'

const { activity, load } = useQuestionnaire()

const activityNo = ref('')
const company = ref('')
const userName = ref('')
const userPhone = ref('')

// 把可读名称补到内层原生 input 上：aria-label 留在外层 uni-input 时屏幕阅读器读不到
const companyRef = ref<HTMLElement | null>(null)
const userNameRef = ref<HTMLElement | null>(null)
const userPhoneRef = ref<HTMLElement | null>(null)
useAriaLabel(companyRef, () => '所属单位')
useAriaLabel(userNameRef, () => '姓名')
useAriaLabel(userPhoneRef, () => '联系电话')

const title = computed(() => activity.value?.title || '填写信息')
const intro = computed(() => activity.value?.start_remark || '')

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')

  const cached = storage.get<Record<string, string>>(STORAGE_KEYS.ENTRY_PARAMS, {})
  company.value = cached.company ?? ''
  userName.value = cached.user_name ?? ''
  userPhone.value = cached.user_phone ?? ''

  if (activityNo.value) {
    void load(activityNo.value, { mode: 'plain' })
  }
})

function onNext(): void {
  if (!company.value.trim()) {
    toast('请输入所属单位')
    return
  }

  const phoneReg = /^1[3-9]\d{9}$/
  if (userPhone.value && !phoneReg.test(userPhone.value.trim())) {
    toast('请输入正确的手机号码')
    return
  }

  storage.set(STORAGE_KEYS.ENTRY_PARAMS, {
    company: company.value.trim(),
    user_name: userName.value.trim(),
    user_phone: userPhone.value.trim(),
  })

  uni.navigateTo({
    url: `/pages/questionnaire/index/index?activity_no=${activityNo.value}&formType=form&status=进行中`,
  })
}
</script>

<template>
  <view class="si-page">
    <BxNavBar :title="title" />

    <view class="si-page__body bx-container">
      <view class="si-card">
        <text class="si-card__title">{{ title }}</text>
        <text v-if="intro" class="si-card__desc">{{ intro }}</text>
      </view>

      <view class="si-form">
        <view class="si-field">
          <view class="si-field__head">
            <text class="si-field__label">所属单位</text>
            <text class="si-field__required">*</text>
          </view>
          <input
            ref="companyRef"
            v-model="company"
            aria-label="所属单位"
            class="si-field__input"
            placeholder="请输入所属单位"
            placeholder-class="si-field__placeholder"
            :maxlength="60"
          >
        </view>

        <view class="si-field">
          <view class="si-field__head">
            <text class="si-field__label">姓名</text>
          </view>
          <input
            ref="userNameRef"
            v-model="userName"
            aria-label="姓名"
            class="si-field__input"
            placeholder="请输入姓名"
            placeholder-class="si-field__placeholder"
            :maxlength="30"
          >
        </view>

        <view class="si-field">
          <view class="si-field__head">
            <text class="si-field__label">联系电话</text>
          </view>
          <input
            ref="userPhoneRef"
            v-model="userPhone"
            aria-label="联系电话"
            class="si-field__input"
            type="number"
            placeholder="请输入手机号码"
            placeholder-class="si-field__placeholder"
            :maxlength="11"
          >
        </view>
      </view>

      <view class="si-actions">
        <BxButton block @click="onNext">
          下一步，开始作答
        </BxButton>
        <text class="si-actions__tip">填写的信息会用于问卷中对应题目的预填</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.si-page {
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.si-page__body {
  padding-top: 12px;
  padding-bottom: 32px;
}

.si-card {
  padding: 18px 16px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
}

.si-card__title {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--bx-text);
}

.si-card__desc {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--bx-text-2);
}

.si-form {
  margin-top: 8px;
  background-color: var(--bx-surface);
  border-radius: var(--bx-radius-card);
}

.si-field {
  padding: 14px 16px;
}

.si-field:not(:first-child) {
  border-top: 1px solid var(--bx-line-2);
}

.si-field__head {
  display: flex;
  align-items: center;
}

.si-field__label {
  font-size: 14px;
  color: var(--bx-text);
}

.si-field__required {
  margin-left: 4px;
  font-size: 14px;
  color: var(--bx-danger);
}

.si-field__input {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  margin-top: 8px;
  padding: 0 12px;
  font-size: 14px;
  color: var(--bx-text);
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.si-field__placeholder {
  color: var(--bx-text-3);
}

/*
 * 焦点可见性：uni-app 内置样式把 outline 设成 none，键盘用户看不到焦点。
 * 用 :focus-visible 补回来（只在键盘聚焦时显示，鼠标点击不显示）。
 *
 * 选择器写法有两个坑，都踩过：
 *
 * 1. uni-app 的 postcss 插件会把选择器里的 `input` **改写**成 `uni-input`。
 *    写成 `:deep(.si-field__input input:focus-visible)` 实际编译出
 *    `[data-v-x] .si-field__input uni-input:focus-visible` —— 命中的是外层
 *    自定义元素，而真正被聚焦的是内层原生 input，永远不会触发。
 * 2. 真实结构是 UNI-INPUT > DIV.uni-input-wrapper > INPUT.uni-input-input，
 *    所以要落到 uni-app 内部的 `.uni-input-input` 上。
 */
:deep(.si-field__input .uni-input-input:focus-visible) {
  border-color: var(--bx-blue);
  outline: 2px solid var(--bx-blue);
  outline-offset: 1px;
}

.si-actions {
  margin-top: 20px;
}

.si-actions__tip {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: var(--bx-text-3);
  text-align: center;
}
</style>
