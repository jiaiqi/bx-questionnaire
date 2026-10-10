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
import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { readQuery } from '@/utils/query'
import { storage, STORAGE_KEYS } from '@/utils/storage'
import { toast } from '@/utils/ui'

const { activity, load } = useQuestionnaire()

const activityNo = ref('')
const company = ref('')
const userName = ref('')
const userPhone = ref('')

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
            v-model="company"
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
            v-model="userName"
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
            v-model="userPhone"
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
