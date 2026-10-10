<script setup lang="ts">
/**
 * 图片题
 *
 * 上传类接口（srvfile_attachment_add / srvfile_attachment_upload / srvfile_upload）
 * 当前票据均返回「无权限访问」，老工程也没有上传实现，因此这里做**只读回显**：
 * 作答值存 file_no，渲染时按 file_no 查附件，再拼上网关前缀显示。
 *
 * 待文件服务开通写入权限后，只需在本组件补一个上传按钮，
 * 把返回的 file_no 写进 v-model 即可，接口层无需改动。
 */

import type { BxAttachmentRow } from '@/api/file/attachment'
import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed, ref, watch } from 'vue'

import { attachmentSelect, resolveFileUrl } from '@/api/file/attachment'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

/** 作答值可能是单个 file_no，也可能是逗号分隔的多个 */
const fileNos = computed<string[]>(() => {
  const raw = props.modelValue
  if (raw === null || raw === undefined || raw === '') {
    return []
  }
  return String(raw)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
})

const rows = ref<BxAttachmentRow[]>([])
const loading = ref(false)

watch(
  fileNos,
  async (list) => {
    if (!list.length) {
      rows.value = []
      return
    }

    loading.value = true
    try {
      // 附件服务的 `in` 条件语法未经验证，逐条用 eq 查询更稳妥
      const envelopes = await Promise.all(list.map(fileNo => attachmentSelect({ fileNo })))
      rows.value = envelopes.flatMap(envelope => envelope.data ?? [])
    }
    catch {
      // 拿不到附件时保持空态，不影响整页作答
      rows.value = []
    }
    finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const images = computed(() =>
  rows.value
    .map(row => ({ url: resolveFileUrl(row.fileurl), name: String(row.src_name ?? '') }))
    .filter(item => item.url),
)
</script>

<template>
  <view class="bx-image">
    <view v-if="images.length" class="bx-image__list">
      <image
        v-for="(img, index) in images"
        :key="index"
        class="bx-image__item"
        :src="img.url"
        mode="aspectFill"
      />
    </view>
    <view v-else class="bx-image__empty">
      <text class="bx-image__empty-text">
        {{ loading ? '图片加载中…' : '暂无图片（文件服务写入权限待开通）' }}
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bx-image__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bx-image__item {
  width: 88px;
  height: 88px;
  border-radius: var(--bx-radius);
  background-color: var(--bx-bg);
}

.bx-image__empty {
  padding: 14px 12px;
  background-color: var(--bx-bg);
  border: 1px dashed var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-image__empty-text {
  font-size: 13px;
  color: var(--bx-text-3);
}
</style>
