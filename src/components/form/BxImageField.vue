<script setup lang="ts">
/**
 * 图片题
 *
 * **作答值是批次号列表**：一个元素一张图（一个批次号）。
 * 逐张移除 = 去掉一个元素（引用移除，不动服务端文件），因此天然可表达。
 *
 * > 改造前作答值是**一个批次号**，同题多图共用它 —— 逐张移除做不了，只能整体清空。
 * > 旧数据仍能读：一个批次号就是「长度为 1 的列表」。
 *
 * **为什么作答值里不存文件路径**：实测图片题的 `option_value` 上限约 50 字符
 * （50 过、52 不过），而路径有 55 字符以上，提交直接
 * `FAILURE Data truncation: Data too long for column 'option_value'`。
 * 批次号是 20 位数字，放得下。详见 `@/domain/questionnaire/images`。
 *
 * **每张图各自成批**（上传时不传 `file_no`）：这样每个批次号对应一张图，
 * 逐张移除才有意义；也避免「同批次被草稿与提交记录共用」的连带风险。
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
import { imageAnswerTargets, resolveImageDisplay } from '@/domain/questionnaire/images'
import { parseItemTypeAttr } from '@/domain/questionnaire/refs'
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

/**
 * 图片数量上限
 *
 * `item_type_attr` 必须经 `parseItemTypeAttr` 归一化 —— 同一列在 `init_view_select`
 * 下是对象、在 `item_cfg_select` 下是 JSON 字符串（见 `api/daq/types.ts`）。
 * 早先直接判 `typeof raw === 'object'`，遇到字符串会静默回退成默认值 9，
 * 配置的上限被无声忽略。
 */
const maxCount = computed(() => {
  const value = parseItemTypeAttr(props.field.raw?.item_type_attr).fileNum
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : DEFAULT_MAX
})

/** 作答值 = 批次号列表，一个元素一张图 */
const fileNos = computed(() => imageAnswerTargets([
  { key: props.field.key, widget: props.field.widget, value: props.modelValue },
]).map(target => target.fileNo))

const rows = ref<BxAttachmentRow[]>([])
const loading = ref(false)
const uploading = ref(false)
/** 附件查询失败（网络/权限/服务异常，原因不猜，只如实标记「读不到」） */
const loadError = ref(false)
/**
 * 本次会话上传得到的 `批次号 → 文件地址`
 *
 * 刚上传的图立刻就能显示，不必再查一次附件表 —— 少一个失败点，
 * 也就少一次「传上去了却显示暂无图片」。
 */
const uploadedUrls = ref<Record<string, string>>({})
/**
 * 刚上传成功的本地预览（blob URL）
 *
 * 为什么需要：**「传上去了」和「看得见」是两件事** —— 上传成功后还要再查一次
 * 附件列表才能拿到服务端地址，而这次查询可能失败。只靠服务端地址的话，
 * 用户传完图界面还是「暂无图片」，会以为没传上而反复重传。
 *
 * 注意：这条兜底**不是**为某个具体 bug 写的补丁。我一度把「请求打错应用」
 * 误判成「`srvfile_attachment_select` 无权限」，而真正的权限问题并不存在
 * （见验收清单限制 2）。修好 app 之后走的是服务端地址，但这条安全网仍然该留。
 */
const localPreviews = ref<string[]>([])

/** 查附件表换出地址；本次会话传过的直接用缓存，不重复查 */
async function loadRows(): Promise<void> {
  const list = fileNos.value
  if (!list.length) {
    rows.value = []
    loadError.value = false
    return
  }

  const missing = list.filter(fileNo => !uploadedUrls.value[fileNo])
  if (!missing.length) {
    rows.value = []
    loadError.value = false
    return
  }

  loading.value = true
  try {
    // 附件服务的 `in` 条件语法未经验证（拿不到两个真实批次来验），逐条 eq 更稳妥
    const envelopes = await Promise.all(missing.map(fileNo => attachmentSelect({ fileNo })))
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
 * 自己刚写进去的批次号列表
 *
 * 上传成功后要 `emit` 新列表，而 watch 会因此触发；若不区分来源，
 * 就会把刚建立的本地预览立刻清掉 —— 正是要避免的「传了却看不见」。
 */
let selfSetFileNos: string[] = []

watch(() => [props.modelValue, props.field.key], () => {
  const next = fileNos.value
  // 自己刚设的值：保留本地预览
  if (next.length && next.join('|') === selfSetFileNos.join('|')) {
    void loadRows()
    return
  }
  // 作答值换了别的来源（切到只读详情、外部改写），本地预览不再对应当前值
  localPreviews.value = []
  void loadRows()
}, { immediate: true })

/**
 * 按**作答值的顺序**取地址
 *
 * 不能直接用 `rows` 的顺序：一次会话里可能既有刚上传的（走缓存）又有早先的
 * （走附件表），两条来源合起来顺序就乱了。按 `fileNos` 逐个取，界面顺序才与
 * 作答值一致 —— 移除某一张时下标才对得上。
 */
const serverUrls = computed(() => fileNos.value
  .map((fileNo) => {
    const cached = uploadedUrls.value[fileNo]
    if (cached) {
      return resolveFileUrl(cached)
    }
    const row = rows.value.find(item => String(item.file_no ?? '') === fileNo)
    return row ? resolveFileUrl(row.fileurl) : ''
  })
  .filter(Boolean))

const display = computed(() => resolveImageDisplay({ serverUrls: serverUrls.value, localUrls: localPreviews.value }))

const images = computed(() => display.value.images)

/** 有本地预览却读不到服务端列表 —— 需要向用户解释清楚，否则像是没传上 */
const showLocalOnlyHint = computed(() => display.value.localOnly)

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

  let localPaths: string[] = []
  try {
    localPaths = await chooseImages()
  }
  catch (error) {
    toast(error instanceof BxError ? error.message : '选择图片失败')
    return
  }
  if (!localPaths.length) {
    return
  }

  uploading.value = true
  /** 逐张上传：成功一张就记一张，中途失败已成功的部分也要留下 */
  const added: string[] = []
  let failedCount = 0
  try {
    for (const filePath of localPaths) {
      try {
        // 不传 file_no：每张图各自成批，一个批次号对应一张图
        const result = await uploadAttachment({ filePath })
        const fileNo = String(result.file_no ?? '')
        if (fileNo) {
          added.push(fileNo)
          uploadedUrls.value = { ...uploadedUrls.value, [fileNo]: String(result.fileurl ?? '') }
        }
        // 上传成功的本地预览（去重）
        if (!localPreviews.value.includes(filePath)) {
          localPreviews.value = [...localPreviews.value, filePath]
        }
      }
      catch {
        failedCount += 1
      }
    }

    if (added.length) {
      const next = [...fileNos.value, ...added]
      selfSetFileNos = next
      emit('update:modelValue', next)
    }

    if (failedCount) {
      // 部分失败必须说出来，不能只报成功
      toast(`有 ${failedCount} 张图片上传失败，请重试`)
    }
    else if (added.length) {
      toast('图片上传成功')
    }
  }
  finally {
    uploading.value = false
    await loadRows()
  }
}

/**
 * 移除其中一张
 *
 * 只做**引用移除**（从作答值里去掉这个元素），不调 `/file/delete`：
 * 真删会让服务端文件消失，而同一张图可能还被草稿或历史作答引用。
 * 这是平台惯例里明确写的顺序（「先引用移除，确认删除才调 /file/delete」）。
 */
function onRemove(index: number): void {
  if (props.disabled) {
    return
  }
  const fileNo = fileNos.value[index]
  if (!fileNo) {
    return
  }

  const next = fileNos.value.filter(item => item !== fileNo)
  selfSetFileNos = next
  emit('update:modelValue', next)

  const preview = localPreviews.value[index]
  if (preview) {
    localPreviews.value = localPreviews.value.filter(item => item !== preview)
  }
}

/** 清空本题图片（引用移除） */
function onClear(): void {
  if (props.disabled) {
    return
  }
  rows.value = []
  localPreviews.value = []
  selfSetFileNos = []
  emit('update:modelValue', [])
}
</script>

<template>
  <view class="bx-image">
    <view v-if="images.length" class="bx-image__list">
      <view v-for="(img, index) in images" :key="index" class="bx-image__cell">
        <image class="bx-image__item" :src="img" mode="aspectFill" />
        <view
          v-if="!disabled"
          class="bx-image__remove"
          role="button"
          :aria-label="`移除第 ${index + 1} 张图片`"
          tabindex="0"
          @click="onRemove(index)"
        >
          <text class="bx-image__remove-text">
            ×
          </text>
        </view>
      </view>
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

.bx-image__remove {
  position: absolute;
  top: -6px;
  right: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background-color: var(--bx-text);
  border-radius: 50%;
}

.bx-image__remove-text {
  font-size: 14px;
  line-height: 1;
  color: #FFFFFF;
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
