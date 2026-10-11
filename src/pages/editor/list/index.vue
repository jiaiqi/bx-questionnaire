<script setup lang="ts">
/**
 * 问卷列表页（活动清单）
 *
 * 这是老工程**没有**的页面：老工程只有作答链路，问卷是别人在平台后台建好的。
 * 新工程把「建问卷」也收进来，所以需要一个入口页。
 *
 * ## 交互取舍
 *
 * - 搜索在服务端做（`title like`，实测可用），不在前端过滤已加载的几行 ——
 *   后者看起来能搜，实际只搜当前页，用户会以为「明明存在的问卷搜不到」。
 * - 分页也在服务端做（实测 `page.total` 与实际总数一致、相邻页无重叠）。
 * - 移动端触底自动翻页，PC 端底部有翻页器；两者共用 `hasNext` 守卫，
 *   不会因为触底与点击同时发生而重复请求。
 * - 删除是**物理删除**且会连带题目与选项，所以必须二次确认，并把后果写清楚。
 */

import type { DaqActivityRow } from '@/api/daq/types'

import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import EditorListCard from '@/components/editor/EditorListCard.vue'
import { ACTIVITY_STATUS_OPTIONS, useEditorList } from '@/composables/useEditorList'
import { editorCreateUrl, editorDesignUrl } from '@/domain/editor/routes'
import { answerUrl } from '@/domain/questionnaire/routes'
import { BxError } from '@/utils/request'
import { confirmDialog, toast } from '@/utils/ui'

/**
 * 页面级配置
 *
 * `definePage` **必须用 `style` 嵌套**：写成扁平键能过类型检查、也会写进 pages.json，
 * 但 uni-app 只读 `style`，小程序端拿不到 —— 是彻底的静默失效。
 *
 * 另：H5 端 `enablePullDownRefresh` 是**编译期特性开关**，
 * 由 pages.json 推导并在 dev server 启动时烘进 bundle，**改完要重启 dev server**，
 * 否则整段下拉刷新被 tree-shake 掉，表现是「手势没反应」而不是报错。
 */
definePage({ style: { enablePullDownRefresh: true } })

const statusOptions = ACTIVITY_STATUS_OPTIONS

const {
  rows,
  total,
  pageNo,
  pageCount,
  hasPrev,
  hasNext,
  keyword,
  status,
  loading,
  loaded,
  errorMessage,
  load,
  search,
  reset,
  goPrev,
  goNext,
  remove,
} = useEditorList()

/** 正在删除的问卷编号，用于禁用重复点击 */
const removing = ref('')

onLoad(() => {
  void load(1)
})

/** 触底翻页：只在确实还有下一页且没有请求在飞时才发 */
onReachBottom(() => {
  if (hasNext.value && !loading.value) {
    void goNext()
  }
})

onPullDownRefresh(async () => {
  try {
    await load(1)
  }
  finally {
    // 指示器一定要收；异常刻意不吞（load 内部已转成页面错误态）
    uni.stopPullDownRefresh()
  }
})

function readInput(event: unknown): string | null {
  const value = (event as { detail?: { value?: string } })?.detail?.value
  return typeof value === 'string' ? value : null
}

function onKeywordInput(event: unknown): void {
  const value = readInput(event)
  if (value !== null) {
    keyword.value = value
  }
}

function onSearch(): void {
  void search()
}

function onReset(): void {
  void reset()
}

/** 状态筛选是单选开关：再点一次同一个即取消筛选 */
function onStatusFilter(value: string): void {
  status.value = status.value === value ? '' : value
  void search()
}

function onCreate(): void {
  uni.navigateTo({ url: editorCreateUrl() })
}

function onEdit(row: DaqActivityRow): void {
  uni.navigateTo({ url: editorDesignUrl(String(row.activity_no ?? '')) })
}

function onAnswer(row: DaqActivityRow): void {
  uni.navigateTo({
    url: answerUrl(String(row.activity_no ?? ''), { status: String(row.status ?? '') }),
  })
}

async function onRemove(row: DaqActivityRow): Promise<void> {
  const activityNo = String(row.activity_no ?? '')
  const title = String(row.title ?? '') || '这份问卷'
  const confirmed = await confirmDialog(
    `确定删除「${title}」吗？该问卷的题目与选项会一并删除，已提交的作答记录不会被清理，操作不可恢复。`,
  )
  if (!confirmed || !activityNo) {
    return
  }

  removing.value = activityNo
  try {
    await remove(activityNo)
    toast('已删除', 'success')
  }
  catch (error) {
    // 删除失败必须说出来：界面照旧显示那一行而用户以为删掉了，是最糟的结果
    toast(error instanceof BxError ? error.message : '删除失败，请稍后重试')
  }
  finally {
    removing.value = ''
  }
}
</script>

<template>
  <view class="editor-list">
    <BxNavBar title="问卷列表">
      <template #extra>
        <view
          class="editor-list__create"
          role="button"
          tabindex="0"
          aria-label="新建问卷"
          @click="onCreate"
          @keydown.enter.prevent="onCreate"
        >
          <text class="editor-list__create-text">＋ 新建</text>
        </view>
      </template>
    </BxNavBar>

    <view class="editor-list__body">
      <view class="editor-list__search">
        <input
          class="editor-list__input"
          type="text"
          :value="keyword"
          aria-label="搜索问卷标题"
          placeholder="搜索问卷标题"
          confirm-type="search"
          @input="onKeywordInput"
          @confirm="onSearch"
        >
        <view
          class="editor-list__search-btn"
          role="button"
          tabindex="0"
          aria-label="搜索"
          @click="onSearch"
          @keydown.enter.prevent="onSearch"
        >
          <text class="editor-list__search-btn-text">搜索</text>
        </view>
        <view
          class="editor-list__search-btn"
          role="button"
          tabindex="0"
          aria-label="重置搜索条件"
          @click="onReset"
          @keydown.enter.prevent="onReset"
        >
          <text class="editor-list__search-btn-text">重置</text>
        </view>
      </view>

      <view class="editor-list__filters">
        <view
          v-for="option in statusOptions"
          :key="option"
          class="editor-list__filter"
          :class="{ 'editor-list__filter--on': status === option }"
          role="button"
          tabindex="0"
          :aria-label="`筛选状态 ${option}`"
          @click="onStatusFilter(option)"
          @keydown.enter.prevent="onStatusFilter(option)"
        >
          <text class="editor-list__filter-text">{{ option }}</text>
        </view>
      </view>

      <view v-if="errorMessage" class="editor-list__error">
        <text class="editor-list__error-text">{{ errorMessage }}</text>
        <view
          class="editor-list__retry"
          role="button"
          tabindex="0"
          aria-label="重试加载"
          @click="load(pageNo)"
          @keydown.enter.prevent="load(pageNo)"
        >
          <text class="editor-list__retry-text">重试</text>
        </view>
      </view>

      <template v-else>
        <BxEmpty
          v-if="loaded && !loading && rows.length === 0"
          text="没有找到问卷"
          tip="换个关键字试试，或点右上角「新建」创建一份"
        />

        <EditorListCard
          v-for="row in rows"
          :key="String(row.activity_no)"
          :row="row"
          @edit="onEdit(row)"
          @answer="onAnswer(row)"
          @remove="onRemove(row)"
        />

        <view v-if="loading" class="editor-list__loading">
          <text class="editor-list__loading-text">加载中…</text>
        </view>
      </template>
    </view>

    <view v-if="rows.length > 0" class="editor-list__pager">
      <view
        class="editor-list__pager-btn"
        :class="{ 'editor-list__pager-btn--off': !hasPrev }"
        role="button"
        tabindex="0"
        aria-label="上一页"
        @click="goPrev"
        @keydown.enter.prevent="goPrev"
      >
        <text class="editor-list__pager-text">上一页</text>
      </view>
      <text class="editor-list__pager-info">
        第 {{ pageNo }} / {{ pageCount }} 页 · 共 {{ total }} 份
      </text>
      <view
        class="editor-list__pager-btn"
        :class="{ 'editor-list__pager-btn--off': !hasNext }"
        role="button"
        tabindex="0"
        aria-label="下一页"
        @click="goNext"
        @keydown.enter.prevent="goNext"
      >
        <text class="editor-list__pager-text">下一页</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.editor-list {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.editor-list__create {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 10px;
  background-color: var(--bx-blue);
  border-radius: var(--bx-radius);
}

.editor-list__create-text {
  font-size: 13px;
  color: #ffffff;
}

.editor-list__body {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--bx-content-width);
  margin: 0 auto;
  padding: 12px;
}

.editor-list__search {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.editor-list__input {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 10px;
  font-size: 14px;
  color: var(--bx-text);
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

/**
 * 焦点可见性
 *
 * uni-app 内置样式把 outline 设成 none，键盘用户看不到焦点在哪。
 * 选择器必须落到 `.uni-input-input`：uni-app 的 postcss 插件会把选择器里的
 * `input` 改写成 `uni-input`（外层自定义元素），而真正被聚焦的是内层原生 input，
 * 写 `input` 编译出来是 `uni-input:focus-visible`，永远不会触发。
 * 真实结构：UNI-INPUT > DIV.uni-input-wrapper > INPUT.uni-input-input
 * （与 BxTextField 里那条规则同一原因）
 */
:deep(.editor-list__input .uni-input-input:focus-visible) {
  border-color: var(--bx-blue);
  outline: 2px solid var(--bx-blue);
  outline-offset: 1px;
}

.editor-list__search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  margin-left: 8px;
  padding: 0 12px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.editor-list__search-btn:active {
  border-color: var(--bx-blue);
  background-color: var(--bx-blue-soft);
}

.editor-list__search-btn-text {
  font-size: 14px;
  color: var(--bx-text-2);
}

.editor-list__filters {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.editor-list__filter {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  margin: 0 8px 8px 0;
  padding: 0 12px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: 15px;
}

.editor-list__filter--on {
  border-color: var(--bx-blue);
  background-color: var(--bx-blue-soft);
}

.editor-list__filter-text {
  font-size: 13px;
  color: var(--bx-text-2);
}

.editor-list__filter--on .editor-list__filter-text {
  color: var(--bx-blue);
}

.editor-list__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
}

.editor-list__error-text {
  font-size: 14px;
  color: var(--bx-danger);
  text-align: center;
}

.editor-list__retry {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  margin-top: 12px;
  padding: 0 16px;
  border: 1px solid var(--bx-blue);
  border-radius: var(--bx-radius);
}

.editor-list__retry-text {
  font-size: 13px;
  color: var(--bx-blue);
}

.editor-list__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.editor-list__loading-text {
  font-size: 13px;
  color: var(--bx-text-3);
}

.editor-list__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  max-width: var(--bx-content-width);
  margin: 0 auto;
  padding: 0 12px 24px;
}

.editor-list__pager-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 14px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.editor-list__pager-btn--off {
  opacity: 0.4;
}

.editor-list__pager-text {
  font-size: 13px;
  color: var(--bx-text-2);
}

.editor-list__pager-info {
  margin: 0 12px;
  font-size: 13px;
  color: var(--bx-text-3);
}
</style>
