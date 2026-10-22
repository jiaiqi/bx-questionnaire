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
 *
 * ## 版式：表格，不是卡片墙
 *
 * 按设计系统 §7.5：搜索区一行内联（输入 + 搜索 + 重置 + 状态分段控件），
 * 下面是一行一问卷的表格 —— 左：标题 + 摘要 + 元信息，中：状态 chip，右：操作。
 */

import type { DaqActivityRow } from '@/api/daq/types'

import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import { ref } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import BxSkeleton from '@/components/base/BxSkeleton.vue'
import EditorListRow from '@/components/editor/EditorListRow.vue'
import EditorSegmented from '@/components/editor/EditorSegmented.vue'
import { ACTIVITY_STATUS_OPTIONS, useEditorList } from '@/composables/useEditorList'
import { editorCreateUrl, editorDesignUrl } from '@/domain/editor/routes'
import { answerUrl } from '@/domain/questionnaire/routes'
import { useSessionStore } from '@/stores/session'
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
 *
 * 本页是**启动页**：从根路径进入即到这里。相比作答页（必须带 `activity_no`，
 * 直接打开只会看到「缺少活动编号」），列表页不依赖入参，是个能用的入口；
 * 代价是它需要登录态，未登录时会被会话过期链路送到登录页。
 * `type: 'home'` 与 vite.config.ts 的 `UniPages.homePage` 必须同时指向本页。
 */
definePage({ type: 'home', style: { enablePullDownRefresh: true } })

/**
 * 状态筛选：分段控件
 *
 * 「全部」是本地加的清空项 —— 服务端的筛选值本来就是空串表示不过滤
 * （`useEditorList` 里 `status.value || undefined`），所以它不是新语义，
 * 只是把「取消筛选」这件事摆到台面上，而不是靠「再点一次同一个」。
 */
const statusFilterOptions = [
  { label: '全部', value: '' },
  ...ACTIVITY_STATUS_OPTIONS.map(option => ({ label: option, value: option })),
]

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

const session = useSessionStore()

/**
 * 未登录时的显式入口
 *
 * 列表页的所有能力（查询 / 新建 / 编辑 / 删除）都要登录态：会话过期会被请求层
 * 自动送到登录页，但在那之前用户没有任何主动登录的入口。
 */
function onLogin(): void {
  uni.navigateTo({ url: '/pages/login/index' })
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

/** 状态筛选：选「全部」清空筛选；再点一次同一个状态也清空（与旧行为一致） */
function onStatusFilter(value: string): void {
  status.value = value && status.value === value ? '' : value
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
        <BxButton
          v-if="!session.isLogin"
          type="secondary"
          size="small"
          aria-label="登录"
          @click="onLogin"
        >
          登录
        </BxButton>
        <BxButton type="primary" size="small" aria-label="新建问卷" @click="onCreate">
          <view class="editor-list__create-icon" aria-hidden="true" />
          <text class="editor-list__create-text">新建</text>
        </BxButton>
      </template>
    </BxNavBar>

    <view class="editor-list__body">
      <!--
        搜索区：**一行内联**，不堆叠成三块卡片
        （输入 + 搜索 + 重置 + 状态分段控件）
      -->
      <view class="editor-list__toolbar">
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
        <BxButton type="secondary" aria-label="搜索" @click="onSearch">
          搜索
        </BxButton>
        <BxButton type="secondary" aria-label="重置搜索条件" @click="onReset">
          重置
        </BxButton>
        <!--
          分组语义：分段控件本身给每一项「进行中 / 未开始 / 已结束」这样的名字，
          单独读出来不知道是筛选用。外面再包一层 group + 组名，读屏就完整了。
        -->
        <view class="editor-list__filter" role="group" aria-label="按状态筛选">
          <EditorSegmented
            :model-value="status"
            :options="statusFilterOptions"
            @update:model-value="onStatusFilter"
          />
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
        <!-- 表头：宽屏才出现（窄屏一行放不下三列，表头反而碍事） -->
        <view class="editor-list__head">
          <text class="editor-list__head-cell editor-list__head-cell--main">问卷</text>
          <text class="editor-list__head-cell editor-list__head-cell--status">状态</text>
          <text class="editor-list__head-cell editor-list__head-cell--actions">操作</text>
        </view>

        <view class="editor-list__table">
          <view
            v-for="(row, index) in rows"
            :key="String(row.activity_no)"
            class="editor-list__row"
          >
            <EditorListRow
              :row="row"
              :last="index === rows.length - 1"
              @edit="onEdit(row)"
              @answer="onAnswer(row)"
              @remove="onRemove(row)"
            />
          </view>
        </view>

        <BxEmpty
          v-if="loaded && !loading && rows.length === 0"
          text="没有找到问卷"
          tip="换个关键字试试，或点右上角「新建」创建一份"
        />

        <view v-if="loading" class="editor-list__skeleton" aria-busy="true">
          <BxSkeleton :lines="1" :height="72" :radius="20" />
          <BxSkeleton :lines="1" :height="72" :radius="20" />
          <BxSkeleton :lines="1" :height="72" :radius="20" />
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

/* 加号用两条线绘制（原为「＋ 新建」里的全角加号，字形随字体变化） */
.editor-list__create-icon {
  position: relative;
  flex: none;
  width: 10px;
  height: 10px;
  margin-right: 6px;
}

.editor-list__create-icon::before,
.editor-list__create-icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 10px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: #fff;
  border-radius: 1px;
}

.editor-list__create-icon::after {
  transform: rotate(90deg);
}

.editor-list__body {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--bx-content-width-wide);
  margin: 0 auto;
  padding: 16px;
}

/* ── 搜索区：一行内联 ── */

.editor-list__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.editor-list__input {
  box-sizing: border-box;
  flex: 1 1 220px;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  font-size: 15px;
  color: var(--bx-text);
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line-strong);
  border-radius: var(--bx-radius);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

/* 聚焦：描边变主色 + 光晕（不用 outline，保证小程序一致） */
.editor-list__input:focus-within {
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
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
  outline: 2px solid var(--bx-blue);
  outline-offset: 1px;
}

/* 状态分段控件：窄屏时整块换行，宽屏跟在按钮后面 */
.editor-list__filter {
  flex: 0 1 auto;
  margin-left: auto;
}

/* ── 表格 ── */

/*
 * 表头与行的列宽必须一致（96 / 180），否则「状态」「操作」两列会错位。
 * 这两个数字与 EditorListRow 里的 grid-template-columns 是同一套定义。
 */
.editor-list__head {
  display: none;
  grid-template-columns: minmax(0, 1fr) 96px 180px;
  gap: 12px 16px;
  padding: 0 16px 8px;
}

.editor-list__head-cell {
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
}

/* 状态列是居中的（chip 也在列内居中），表头与内容才对得上 */
.editor-list__head-cell--status {
  text-align: center;
}

.editor-list__table {
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-lg);
}

/* 行之间只有一条细线（表格的读法）；末行的下边线由行组件自己去掉 */

/*
 * 进场编排：逐行淡入 + translateY(6px→0)，delay 30ms，最多前 12 项
 * （设计系统 §5.2 第 12 条）。
 *
 * 只在 H5 端做：小程序端长列表逐项动画会掉帧（规范 §5.3）。
 */
@media (min-width: 640px) {
  .editor-list__head {
    display: grid;
  }
}

/* #ifdef H5 */
.editor-list__row {
  animation: editor-list-row-in var(--bx-duration-slow) var(--bx-ease-out) both;
}

.editor-list__row:nth-child(1) { animation-delay: 0ms; }
.editor-list__row:nth-child(2) { animation-delay: 30ms; }
.editor-list__row:nth-child(3) { animation-delay: 60ms; }
.editor-list__row:nth-child(4) { animation-delay: 90ms; }
.editor-list__row:nth-child(5) { animation-delay: 120ms; }
.editor-list__row:nth-child(6) { animation-delay: 150ms; }
.editor-list__row:nth-child(7) { animation-delay: 180ms; }
.editor-list__row:nth-child(8) { animation-delay: 210ms; }
.editor-list__row:nth-child(9) { animation-delay: 240ms; }
.editor-list__row:nth-child(10) { animation-delay: 270ms; }
.editor-list__row:nth-child(11) { animation-delay: 300ms; }
.editor-list__row:nth-child(12) { animation-delay: 330ms; }

/* 超出 12 行就不再参与编排：后面的行一次性出现，不排第二波队 */
.editor-list__row:nth-child(n+13) {
  animation: none;
}

@keyframes editor-list-row-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* #endif */

/* ── 错误 / 空态 / 骨架 ── */

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
  border: 1px solid var(--bx-primary);
  border-radius: var(--bx-radius);
}

.editor-list__retry-text {
  font-size: 13px;
  color: var(--bx-primary);
}

/* 加载：三条骨架保持布局稳定（原来是居中一行「加载中…」） */
.editor-list__skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

/* ── 翻页器 ── */

.editor-list__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  max-width: var(--bx-content-width-wide);
  margin: 0 auto;
  padding: 16px 16px 24px;
}

.editor-list__pager-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 14px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-sm);
}

.editor-list__pager-btn--off {
  opacity: var(--bx-disabled-opacity);
}

.editor-list__pager-text {
  font-size: 13px;
  color: var(--bx-text-2);
}

.editor-list__pager-info {
  margin: 0 12px;
  font-size: 13px;
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
}
</style>
