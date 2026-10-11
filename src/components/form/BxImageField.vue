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
import { resolveImageDisplay } from '@/domain/questionnaire/images'
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
/** 附件查询失败（网络/权限/服务异常，原因不猜，只如实标记「读不到」） */
const loadError = ref(false)
/**
 * 刚上传成功的本地预览（blob URL）
 *
 * 为什么需要：**「传上去了」和「看得见」是两件事** —— 上传成功之后
 * 回显还要再查一次附件列表，而这次查询可能失败（网络抖动、权限变更、服务异常）。
 * 只靠服务端列表的话，用户传完图界面还是「暂无图片」，会以为没传上而反复重传。
 * 本地预览让「刚传了什么」立刻可见。
 *
 * 注意：这条兜底**不是**为某个具体 bug 写的补丁。我一度把「请求打错应用」
 * 误判成「`srvfile_attachment_select` 无权限」，而真正的权限问题并不存在
 * （见验收清单限制 2）。修好 app 之后走的是服务端地址，但这条安全网仍然该留。
 */
const localPreviews = ref<string[]>([])

async function loadRows(): Promise<void> {
  const list = fileNos.value
  if (!list.length) {
    rows.value = []
    loadError.value = false
    return
  }

  loading.value = true
  try {
    // 附件服务的 `in` 条件语法未经验证，逐条用 eq 查询更稳妥
    const envelopes = await Promise.all(list.map(fileNo => attachmentSelect({ fileNo })))
    rows.value = envelopes.flatMap(envelope => envelope.data ?? [])
    loadError.value = false
  }
  catch {
    // 拿不到附件不影响整页作答，但**必须如实标记**，不能伪装成「没有图片」
    rows.value = []
    loadError.value = true
  }
  finally {
    loading.value = false
  }
}

/**
 * 自己刚写进去的批次号
 *
 * 上传成功后要 `emit` 新批次号，而 watch 会因此触发；若不区分来源，
 * 就会把刚建立的本地预览立刻清掉 —— 正是要避免的「传了却看不见」。
 */
let selfSetBatch = ''

watch(fileNos, (next) => {
  // 自己刚设的值：保留本地预览
  if (next.length === 1 && next[0] === selfSetBatch) {
    void loadRows()
    return
  }
  // 作答值换了别的来源（切到只读详情、外部改写），本地预览不再对应当前值
  localPreviews.value = []
  void loadRows()
}, { immediate: true })

const images = computed(() => {
  const serverUrls = rows.value.map(row => resolveFileUrl(row.fileurl)).filter(Boolean)
  // 服务端列表优先；读不到时退回本地预览（详见 resolveImageDisplay 的注释）
  return resolveImageDisplay({ serverUrls, localUrls: localPreviews.value }).images
})

/** 有本地预览却读不到服务端列表 —— 需要向用户解释清楚，否则像是没传上 */
const showLocalOnlyHint = computed(() =>
  resolveImageDisplay({
    serverUrls: rows.value.map(row => resolveFileUrl(row.fileurl)).filter(Boolean),
    localUrls: localPreviews.value,
  }).localOnly,
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
      // 上传成功的本地预览（去重）
      if (!localPreviews.value.includes(filePath)) {
        localPreviews.value = [...localPreviews.value, filePath]
      }
    }
    selfSetBatch = batchNo
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
  localPreviews.value = []
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
        :src="img"
        mode="aspectFill"
      />
    </view>

    <view v-else-if="!disabled" class="bx-image__empty">
      <text class="bx-image__empty-text">
        {{ loading ? '图片加载中…' : '暂无图片' }}
      </text>
    </view>

    <text v-if="showLocalOnlyHint" class="bx-image__hint">
      以下为本机预览：附件列表暂时读不到（{{ loadError ? '查询失败' : '服务未返回数据' }}），已上传的图片会随作答一起提交
    </text>

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

.bx-image__hint {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--bx-warn);
}

.bx-image__clear {  margin-left: 10px;
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
