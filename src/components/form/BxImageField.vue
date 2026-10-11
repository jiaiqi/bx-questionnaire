<script setup lang="ts">
/**
 * 图片题
 *
 * 作答值存**批次号 file_no**（平台模型：一个附件字段一个批次号，同批次多文件），
 * 渲染时按 file_no 查附件表拿到该批次下的全部文件。
 *
 * 上传端点是专用路径 `{gateway}/file/upload`（multipart），
 * 不是标准 `{app}/{action}/{service}` —— 详见 `@/api/file/upload` 的实测记录。
 * 此前把「端点用错」误判成「文件写入无权限」，故这里一度只有只读回显。
 */

import type { BxAttachmentRow } from '@/api/file/attachment'
import type { AnswerValue, QuestionField } from '@/domain/questionnaire'

import { computed, ref, watch } from 'vue'

import { attachmentSelect, resolveFileUrl } from '@/api/file/attachment'
import { uploadAttachment } from '@/api/file/upload'
import { BxError } from '@/utils/request'
import { toast } from '@/utils/ui'

interface Props {
  field: QuestionField
  modelValue: AnswerValue
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [AnswerValue] }>()

/** 默认上限：平台用 `item_type_attr.fileNum` 配，缺省给 9 */
const DEFAULT_MAX = 9

const maxCount = computed(() => {
  const raw = props.field.raw?.item_type_attr
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).fileNum : undefined
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : DEFAULT_MAX
})

/**
 * 作答值 = 批次号
 *
 * 兼容逗号分隔（历史上可能存过多个批次），但**上传只追加到第一个批次** ——
 * 平台模型是一个字段一个批次，多批次没有语义依据。
 */
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
const uploading = ref(false)

async function loadRows(): Promise<void> {
  const list = fileNos.value
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
}

watch(fileNos, () => {
  void loadRows()
}, { immediate: true })

const images = computed(() =>
  rows.value
    .map(row => ({ url: resolveFileUrl(row.fileurl), name: String(row.src_name ?? '') }))
    .filter(item => item.url),
)

const reachLimit = computed(() => images.value.length >= maxCount.value)

/** 选图：H5 与小程序都走 uni 的原生实现 */
function chooseImages(): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    uni.chooseImage({
      count: Math.max(1, maxCount.value - images.value.length),
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        // 类型上 tempFilePaths 可能是 string | string[]（单选时部分平台给字符串）
        const raw = res.tempFilePaths
        const list = Array.isArray(raw) ? raw : [raw]
        resolve(list.map(item => String(item)).filter(Boolean))
      },
      fail: (err) => {
        // 用户主动取消不算错误，不打扰
        const message = String(err?.errMsg ?? '')
        if (message.includes('cancel')) {
          resolve([])
          return
        }
        reject(new BxError('选择图片失败', 'UPLOAD'))
      },
    })
  })
}

async function onUpload(): Promise<void> {
  if (props.disabled || uploading.value || reachLimit.value) {
    return
  }

  let paths: string[] = []
  try {
    paths = await chooseImages()
  }
  catch (error) {
    toast(error instanceof BxError ? error.message : '选择图片失败')
    return
  }
  if (!paths.length) {
    return
  }

  uploading.value = true
  try {
    // 批次号只在首次上传时为空，之后一直复用 —— 这样多张图落在同一个 file_no 下
    let batchNo = fileNos.value[0] ?? ''
    for (const filePath of paths) {
      const result = await uploadAttachment({
        filePath,
        fileNo: batchNo || undefined,
      })
      batchNo = String(result.file_no ?? batchNo)
    }
    emit('update:modelValue', batchNo)
    toast('图片上传成功')
  }
  catch (error) {
    toast(error instanceof BxError ? error.message : '图片上传失败')
  }
  finally {
    uploading.value = false
    // 上传后刷新列表：即使中途失败，已成功的部分也要显示出来
    await loadRows()
  }
}

/**
 * 清空本题图片
 *
 * **为什么不做「删掉其中一张」**：作答值是一个**批次号 file_no**，
 * 同一题的多张图共用它。要删中间一张，只能新建一个批次把剩下的重新传一遍
 * （本地没有文件字节，做不到），或者把作答值改成文件列表（平台模型不是这样）。
 * 所以逐张移除在当前数据模型下**不可表达** —— 硬做出来的效果是
 * 「界面上少了一张，刷新后又回来了，提交的作答值也没变」，即假操作。
 *
 * 只清引用，不调 `/file/delete`：同一批次可能被草稿与提交记录共用，
 * 真删会让历史作答里的图一起消失。
 */
function onClear(): void {
  if (props.disabled) {
    return
  }
  rows.value = []
  emit('update:modelValue', '')
}
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

    <view v-else-if="!disabled" class="bx-image__empty">
      <text class="bx-image__empty-text">
        {{ loading ? '图片加载中…' : '暂无图片' }}
      </text>
    </view>

    <view v-if="!disabled" class="bx-image__actions">
      <view
        class="bx-image__upload"
        :class="{ 'bx-image__upload--disabled': uploading || reachLimit }"
        role="button"
        :aria-label="uploading ? '图片上传中' : '上传图片'"
        :aria-disabled="uploading || reachLimit"
        tabindex="0"
        @click="onUpload"
      >
        <text class="bx-image__upload-text">
          {{ uploading ? '上传中…' : (reachLimit ? `最多 ${maxCount} 张` : '上传图片') }}
        </text>
      </view>

      <view
        v-if="images.length"
        class="bx-image__clear"
        role="button"
        :aria-label="`清空本题图片（共 ${images.length} 张）`"
        tabindex="0"
        @click="onClear"
      >
        <text class="bx-image__clear-text">
          清空图片
        </text>
      </view>

      <text v-if="images.length" class="bx-image__count">
        {{ images.length }} / {{ maxCount }}
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

.bx-image__cell {
  position: relative;
}

.bx-image__item {
  display: block;
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

.bx-image__actions {
  display: flex;
  align-items: center;
  margin-top: 10px;
}

.bx-image__upload {
  padding: 7px 14px;
  border: 1px solid var(--bx-blue);
  border-radius: var(--bx-radius);
}

.bx-image__upload--disabled {
  border-color: var(--bx-line);
}

.bx-image__upload-text {
  font-size: 13px;
  color: var(--bx-blue);
}

.bx-image__upload--disabled .bx-image__upload-text {
  color: var(--bx-text-3);
}

.bx-image__clear {
  margin-left: 10px;
  padding: 7px 14px;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.bx-image__clear-text {
  font-size: 13px;
  color: var(--bx-text-2);
}

.bx-image__count {
  margin-left: 10px;
  font-size: 12px;
  color: var(--bx-text-3);
}
</style>
