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
 * - 搜索是**显式触发**（回车 / 「搜索」按钮 / 清空后自动重查）：服务端查询
 *   不做输入即搜，否则每敲一个字都要发一次请求，还会有响应乱序覆盖的问题。
 * - 移动端触底自动翻页，PC 端底部有翻页器；两者共用 `hasNext` 守卫，
 *   不会因为触底与点击同时发生而重复请求。
 * - 删除是**物理删除**且会连带题目与选项，所以必须二次确认，并把后果写清楚。
 *
 * ## 版式（V6「清简」§9.2）
 *
 * 页头（24/600 标题 + 13 灰说明 + 唯一主行动）→ 一行内联工具行
 * （300px 搜索 + 状态分段 + 重置）→ 一张数据表（表头 12/500、行高 60、
 * 行内操作悬停 / 聚焦显形、分页靠右）→ 空态用 BxEmpty。
 * 整页限宽走 `.bx-container--wide`，与原型的管理端列宽一致。
 */

import type { DaqActivityRow } from '@/api/daq/types'

import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'

import BxAppearanceSheet from '@/components/base/BxAppearanceSheet.vue'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxSkeleton from '@/components/base/BxSkeleton.vue'
import EditorListRow from '@/components/editor/EditorListRow.vue'
import EditorSegmented from '@/components/editor/EditorSegmented.vue'
import { ACTIVITY_STATUS_OPTIONS, EDITOR_LIST_PAGE_SIZE, useEditorList } from '@/composables/useEditorList'
import { editorCreateUrl, editorDesignUrl, editorStatsUrl } from '@/domain/editor/routes'
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

/** 外观设置面板（仅 H5：小程序端主题跟随系统） */
const appearanceOpen = ref(false)

/** 是否有生效中的筛选（「重置」据此禁用，与原型一致） */
const hasFilter = computed(() => keyword.value.trim() !== '' || status.value !== '')

/** 分页文案里的序号区间：`显示 1–10 · 共 26 份` */
const pageStart = computed(() => (total.value === 0 ? 0 : (pageNo.value - 1) * EDITOR_LIST_PAGE_SIZE + 1))
const pageEnd = computed(() => (total.value === 0 ? 0 : pageStart.value + rows.value.length - 1))

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
    // 保持当前页：在第 3 页下拉刷新又跳回第 1 页，等于把用户的浏览位置弄丢
    await load(pageNo.value)
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
  // 带 redirect：登录页的兜底首页虽然也是列表页，但显式传更稳 ——
  // 从别的页面复用这个入口时不会因为改了 HOME_PATH 而回错地方。
  uni.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent('/pages/editor/list/index')}` })
}

/** 顶栏显示的账号名：优先真实姓名，其次用户名，最后账号 */
const userDisplay = computed(() => {
  const info = session.userInfo as { real_name?: string, user_name?: string, user_no?: string } | null
  return info?.real_name || info?.user_name || info?.user_no || '已登录'
})

/**
 * 退出登录
 *
 * `session.clear()` 此前定义了却零调用 —— 想换账号只能清浏览器缓存。
 * 退出后必须重新拉列表：接口按登录态返回不同数据，不刷会留着上一个人的结果。
 */
async function onLogout(): Promise<void> {
  const confirmed = await confirmDialog('退出后需要重新登录才能继续编辑问卷，确定退出吗？')
  if (!confirmed) {
    return
  }
  session.clear()
  await load()
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

/** 清空关键字并立即重查（原型里搜索框右侧的 ✕） */
function onClearKeyword(): void {
  keyword.value = ''
  void search()
}

function onReset(): void {
  if (!hasFilter.value) {
    return
  }
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

function onStats(row: DaqActivityRow): void {
  uni.navigateTo({ url: editorStatsUrl(String(row.activity_no ?? '')) })
}

function onAnswer(row: DaqActivityRow): void {
  uni.navigateTo({
    url: answerUrl(String(row.activity_no ?? ''), { status: String(row.status ?? '') }),
  })
}

async function onRemove(row: DaqActivityRow): Promise<void> {
  const activityNo = String(row.activity_no ?? '')
  const title = String(row.title ?? '') || '这份问卷'
  if (removing.value) {
    return
  }
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
    <!--
      管理端顶栏（对应原型的 `.adm-appbar`）：品牌 + 面包屑 + 右侧会话入口。
      这一层是「外壳」，页面标题在下面的页头里；不重复显示同一句话。
    -->
    <view class="editor-list__appbar">
      <view class="editor-list__brand">
        <view class="editor-list__mark" aria-hidden="true">
          问
        </view>
        <text class="editor-list__wordmark">园区问卷</text>
      </view>
      <view class="editor-list__appbar-div" aria-hidden="true" />
      <text class="editor-list__crumb">问卷</text>
      <view class="editor-list__appbar-spacer" />
      <!-- #ifdef H5 -->
      <BxButton
        type="secondary"
        size="small"
        aria-label="外观设置"
        @click="appearanceOpen = true"
      >
        外观
      </BxButton>
      <!-- #endif -->
      <BxButton
        v-if="!session.isLogin"
        type="secondary"
        size="small"
        aria-label="登录"
        @click="onLogin"
      >
        登录
      </BxButton>
      <template v-else>
        <text class="editor-list__user">{{ userDisplay }}</text>
        <BxButton
          type="secondary"
          size="small"
          aria-label="退出登录"
          @click="onLogout"
        >
          退出
        </BxButton>
      </template>
    </view>

    <view class="editor-list__main bx-container bx-container--wide">
      <!-- 页头：标题 24/600 + 13 灰说明 + 唯一主行动 -->
      <view class="editor-list__pagehead">
        <view class="editor-list__headtext">
          <text class="editor-list__title">问卷列表</text>
          <view class="editor-list__sub">
            <text class="editor-list__sub-item">
              共 <text class="editor-list__num">{{ total }}</text> 份
            </text>
            <text v-if="status" class="editor-list__sub-item">状态：{{ status }}</text>
            <text v-if="keyword.trim()" class="editor-list__sub-item">搜索「{{ keyword.trim() }}」</text>
          </view>
        </view>

        <view class="editor-list__create">
          <BxButton type="primary" aria-label="新建问卷" @click="onCreate">
            <view class="editor-list__plus" aria-hidden="true" />
            <text>新建问卷</text>
          </BxButton>
        </view>
      </view>

      <!-- 工具行：一行内联，不堆成三块卡片 -->
      <view class="editor-list__toolbar">
        <view class="editor-list__search">
          <view class="editor-list__search-icon" aria-hidden="true" />
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
            v-if="keyword"
            class="editor-list__clear"
            role="button"
            tabindex="0"
            aria-label="清除搜索"
            @click="onClearKeyword"
            @keydown.enter.prevent="onClearKeyword"
          >
            <view class="editor-list__clear-icon" aria-hidden="true" />
          </view>
        </view>

        <view
          class="editor-list__search-go"
          role="button"
          tabindex="0"
          aria-label="搜索"
          @click="onSearch"
          @keydown.enter.prevent="onSearch"
        >
          <text class="editor-list__search-go-text">搜索</text>
        </view>

        <!--
          分组语义：分段控件本身给每一项「进行中 / 未开始 / 已结束」这样的名字，
          单独读出来不知道是筛选用。外面再包一层 group + 组名，读屏就完整了。
        -->
        <view class="editor-list__filter" role="group" aria-label="按状态筛选">
          <EditorSegmented
            class="editor-list__seg"
            :model-value="status"
            :options="statusFilterOptions"
            @update:model-value="onStatusFilter"
          />
        </view>

        <view class="editor-list__spacer" />

        <view
          class="editor-list__reset"
          :class="{ 'editor-list__reset--off': !hasFilter }"
          role="button"
          :tabindex="hasFilter ? 0 : -1"
          :aria-disabled="hasFilter ? 'false' : 'true'"
          aria-label="重置搜索条件"
          @click="onReset"
          @keydown.enter.prevent="onReset"
        >
          <view class="editor-list__reset-icon" aria-hidden="true" />
          <text class="editor-list__reset-text">重置</text>
        </view>
      </view>

      <view v-if="errorMessage" class="editor-list__error" role="alert">
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

      <view
        v-else
        class="editor-list__card"
        :class="{ 'editor-list__card--busy': loading }"
        :aria-busy="loading ? 'true' : 'false'"
      >
        <!-- 表头：12/500，窄屏隐藏（一行放不下） -->
        <view class="editor-list__thead">
          <text class="editor-list__th editor-list__th--main">问卷</text>
          <text class="editor-list__th editor-list__th--status">状态</text>
          <text class="editor-list__th editor-list__th--num">题量</text>
          <text class="editor-list__th editor-list__th--num">回收份数</text>
          <text class="editor-list__th editor-list__th--time">截止</text>
          <text class="editor-list__th editor-list__th--acts">操作</text>
        </view>

        <view v-if="loading && !loaded" class="editor-list__skeleton" aria-busy="true">
          <BxSkeleton :lines="3" :height="44" :radius="8" />
        </view>

        <template v-else>
          <EditorListRow
            v-for="(row, index) in rows"
            :key="String(row.activity_no)"
            :row="row"
            :last="index === rows.length - 1"
            @edit="onEdit(row)"
            @stats="onStats(row)"
            @answer="onAnswer(row)"
            @remove="onRemove(row)"
          />

          <BxEmpty
            v-if="loaded && rows.length === 0"
            text="没有找到问卷"
            tip="换个关键字试试，或点右上角「新建问卷」创建一份"
          />
        </template>

        <!-- 分页脚：左计数、右翻页，与原型一致 -->
        <view v-if="rows.length > 0" class="editor-list__foot">
          <text class="editor-list__foot-count">
            显示 {{ pageStart }}–{{ pageEnd }} · 共 {{ total }} 份
          </text>

          <view class="editor-list__pager">
            <view
              class="editor-list__pagebtn"
              :class="{ 'editor-list__pagebtn--off': !hasPrev }"
              role="button"
              :tabindex="hasPrev ? 0 : -1"
              :aria-disabled="hasPrev ? 'false' : 'true'"
              aria-label="上一页"
              @click="goPrev"
              @keydown.enter.prevent="goPrev"
            >
              <view class="editor-list__chevron editor-list__chevron--prev" aria-hidden="true" />
            </view>

            <text class="editor-list__pageinfo">
              {{ pageNo }} / {{ pageCount }}
            </text>

            <view
              class="editor-list__pagebtn"
              :class="{ 'editor-list__pagebtn--off': !hasNext }"
              role="button"
              :tabindex="hasNext ? 0 : -1"
              :aria-disabled="hasNext ? 'false' : 'true'"
              aria-label="下一页"
              @click="goNext"
              @keydown.enter.prevent="goNext"
            >
              <view class="editor-list__chevron editor-list__chevron--next" aria-hidden="true" />
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- #ifdef H5 -->
    <BxAppearanceSheet v-if="appearanceOpen" @close="appearanceOpen = false" />
    <!-- #endif -->
  </view>
</template>

<style lang="scss" scoped>
.editor-list {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bx-bg);
}

/* ── 管理端顶栏：品牌 + 面包屑 + 会话入口（对应原型 `.adm-appbar`） ── */

.editor-list__appbar {
  position: sticky;
  top: 0;
  z-index: var(--bx-z-sticky);
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  height: calc(52px + var(--status-bar-height, 0px));
  padding: var(--status-bar-height, 0px) 24px 0;
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line);
}

.editor-list__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* 品牌标记：靛蓝小方块 + 白字「问」（全页唯一的名义主色块，与原型一致） */
.editor-list__mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  color: var(--bx-surface);
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  background-color: var(--bx-primary);
  border-radius: var(--bx-radius-xs);
}

.editor-list__wordmark {
  color: var(--bx-text);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.editor-list__appbar-div {
  flex: none;
  width: 1px;
  height: 16px;
  background-color: var(--bx-line);
}

.editor-list__crumb {
  color: var(--bx-text-3);
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
}

/* 顶栏账号名：比面包屑稍实一点，但不与两个按钮争注意力 */
.editor-list__user {
  max-width: 120px;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-list__appbar-spacer {
  flex: 1;
  min-width: 8px;
}

/* 页头：标题在桌面端承担主标题；窄屏交给顶部导航栏，避免同一句话出现两遍 */
.editor-list__main {
  padding-top: 28px;
  padding-bottom: 40px;
}

.editor-list__pagehead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}

.editor-list__headtext {
  min-width: 0;
}

/* 主行动不参与收缩：窄屏时宁可挤说明，也不让「新建问卷」折行 */
.editor-list__create {
  flex: none;
}

.editor-list__title {
  display: block;
  color: var(--bx-text);
  font-size: 24px;
  font-weight: 600;
  line-height: 32px;
  letter-spacing: -0.01em;
}

/* 说明：13 / --bx-text-3；数字用等宽数字 */
.editor-list__sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-top: 4px;
  color: var(--bx-text-3);
  font-size: 13px;
  line-height: 20px;
}

.editor-list__sub-item {
  display: inline-flex;
  align-items: center;
}

.editor-list__num {
  color: var(--bx-text-2);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

/* 主按钮里的加号：两条线绘制（全角「＋」字形随字体变化） */
.editor-list__plus {
  position: relative;
  flex: none;
  width: 10px;
  height: 10px;
  margin-right: 7px;
}

.editor-list__plus::before,
.editor-list__plus::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 10px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: currentcolor;
  border-radius: 1px;
}

.editor-list__plus::after {
  transform: rotate(90deg);
}

/* ── 工具行：一行内联 ── */

.editor-list__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.editor-list__search {
  position: relative;
  display: flex;
  flex: 0 1 300px;
  align-items: center;
  min-width: 200px;
}

/* 放大镜：圆环 + 一条斜柄（纯 CSS，不用 svg / 文字符号） */
.editor-list__search-icon {
  position: absolute;
  top: 50%;
  left: 13px;
  z-index: 1;
  box-sizing: border-box;
  width: 13px;
  height: 13px;
  margin-top: -8px;
  border: 1.5px solid var(--bx-text-3);
  border-radius: 50%;
  pointer-events: none;
}

.editor-list__search-icon::after {
  content: '';
  position: absolute;
  right: -4px;
  bottom: -2px;
  width: 6px;
  height: 1.5px;
  background-color: var(--bx-text-3);
  border-radius: 1px;
  transform: rotate(45deg);
}

.editor-list__input {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 0 36px;
  color: var(--bx-text);
  font-size: 13px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-fast) var(--bx-ease-out);
}

.editor-list__input::placeholder {
  color: var(--bx-text-4);
}

/* 聚焦：描边变主色 + 3px 柔光环（不用 outline，保证小程序一致） */
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
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

/* 清除：搜索框右侧的 ✕ */
.editor-list__clear {
  position: absolute;
  top: 50%;
  right: 4px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  transform: translateY(-50%);
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .editor-list__clear:hover {
    background-color: var(--bx-surface-2);
  }
}

.editor-list__clear-icon {
  position: relative;
  width: 10px;
  height: 10px;
}

.editor-list__clear-icon::before,
.editor-list__clear-icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 10px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: var(--bx-text-3);
  border-radius: 1px;
}

.editor-list__clear-icon::before {
  transform: rotate(45deg);
}

.editor-list__clear-icon::after {
  transform: rotate(-45deg);
}

/* 「搜索」：静默文字按钮（显式触发，服务端查询不做输入即搜） */
.editor-list__search-go {
  display: flex;
  flex: none;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .editor-list__search-go:hover {
    background-color: var(--bx-surface-2);
  }
}

.editor-list__search-go:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.editor-list__search-go-text {
  color: var(--bx-text-2);
  font-size: 13px;
}

.editor-list__filter {
  flex: 0 1 auto;
}

/* 状态分段：与原型一致，每项至少 58px 宽，四段读起来才均匀 */
.editor-list__seg :deep(.bx-seg__item) {
  min-width: 58px;
}

.editor-list__spacer {
  flex: 1;
  min-width: 0;
}

/* 重置：静默文字按钮，没有筛选条件时禁用 */
.editor-list__reset {
  display: flex;
  flex: none;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    opacity var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .editor-list__reset:hover {
    background-color: var(--bx-surface-2);
  }
}

.editor-list__reset:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.editor-list__reset--off {
  opacity: 0.38;
  cursor: default;
  pointer-events: none;
}

/* 重置图标：一个 3/4 圆弧 + 箭头（纯 CSS，不用 ⟳ 文字符号） */
.editor-list__reset-icon {
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--bx-text-3);
  border-top-color: transparent;
  border-radius: 50%;
  transform: rotate(-35deg);
}

.editor-list__reset-text {
  color: var(--bx-text-2);
  font-size: 13px;
}

/* ── 数据表 ── */

.editor-list__card {
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

/*
 * 翻页 / 刷新中：旧数据还在，页码却已经跳到目标页。
 * 压暗并挡住点击，避免用户点到上一页的行（点进去是另一份问卷）。
 */
.editor-list__card--busy {
  pointer-events: none;
  opacity: 0.55;
  transition: opacity var(--bx-duration-fast) var(--bx-ease-out);
}

/*
 * 表头与行的列宽必须一致，否则「状态」「操作」两列会错位。
 * 这组数字与 EditorListRow 里的 grid-template-columns 是同一套定义。
 */
.editor-list__thead {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px 64px 88px 108px 190px;
  align-items: center;
  height: 40px;
  background-color: var(--bx-surface-2);
  border-bottom: 1px solid var(--bx-line);
}

.editor-list__th {
  color: var(--bx-text-3);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  padding: 0 16px;
}

.editor-list__th--main {
  padding-left: 20px;
}

.editor-list__th--num {
  text-align: right;
}

.editor-list__th--acts {
  padding-right: 20px;
  text-align: right;
}

.editor-list__skeleton {
  padding: 20px;
}

/* ── 分页脚 ── */

.editor-list__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 0 20px;
  border-top: 1px solid var(--bx-line);
}

.editor-list__foot-count {
  color: var(--bx-text-3);
  font-size: 12px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}

.editor-list__pager {
  display: flex;
  align-items: center;
  gap: 2px;
}

.editor-list__pagebtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .editor-list__pagebtn:hover:not(.editor-list__pagebtn--off) {
    background-color: var(--bx-surface-2);
  }
}

.editor-list__pagebtn:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.editor-list__pagebtn--off {
  opacity: 0.38;
  cursor: default;
  pointer-events: none;
}

/* 翻页箭头：两条边框旋转 45°（不用 ‹ › 文字符号） */
.editor-list__chevron {
  width: 7px;
  height: 7px;
  border-top: 1.5px solid var(--bx-text-2);
  border-right: 1.5px solid var(--bx-text-2);
}

.editor-list__chevron--prev {
  transform: rotate(-135deg);
}

.editor-list__chevron--next {
  transform: rotate(45deg);
}

/* 当前页：浅靛底 + 主色文字，与分段控件的选中语言一致 */
.editor-list__pageinfo {
  min-width: 44px;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--bx-radius-xs);
  background-color: var(--bx-primary-soft);
  color: var(--bx-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 28px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

/* ── 错误 / 重试 ── */

.editor-list__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 24px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
}

.editor-list__error-text {
  color: var(--bx-danger);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}

.editor-list__retry {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  margin-top: 12px;
  padding: 0 14px;
  border: 1px solid var(--bx-primary-line);
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
}

.editor-list__retry:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.editor-list__retry-text {
  color: var(--bx-primary);
  font-size: 13px;
}

/* ── 响应式 ── */

/* 窄屏：页头说明与主行动换成紧凑排布，标题仍然保留（它就是页面的 h1） */
@media (max-width: 759px) {
  .editor-list__appbar {
    padding-left: 16px;
    padding-right: 16px;
  }

  .editor-list__main {
    padding-top: 16px;
  }

  .editor-list__pagehead {
    align-items: center;
    margin-bottom: 16px;
  }

  /* 第一行「搜索框 + 搜索」、第二行「分段 + 重置」 */
  .editor-list__search {
    flex: 1 1 160px;
    min-width: 140px;
  }
}

/* 表头/数字列在窄屏收起：与 EditorListRow 的降级断点一致 */
@media (max-width: 859px) {
  .editor-list__thead {
    display: none;
  }
}
</style>
