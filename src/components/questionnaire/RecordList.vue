<script setup lang="ts">
/**
 * 作答记录列表
 *
 * `history/history` 与 `survey/history` 共用。
 * 分页与触底加载由页面调用 `loadMore`，避免组件内依赖页面级生命周期。
 *
 * 视觉（docs/UI-UX-V6-设计系统.md §5/§6）：
 * 一条记录 = 状态点 + 状态文字 + 时间（一行），标题 + 分数（一行），
 * 批次号 + 行动入口（一行）；行间只有 1px 细线，不做卡片墙。
 * 顶部是「全部 / 已提交 / 草稿」分段筛选，未登录时给明确登录入口。
 */

import type { DaqRecordReplyRow } from '@/api/daq/types'

import type { LocalDraft } from '@/domain/questionnaire/draft'

import { computed, onMounted, ref, watch } from 'vue'
import { recordReplySelect } from '@/api/daq/record'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNetworkBar from '@/components/base/BxNetworkBar.vue'
import { useChunkedList } from '@/composables/useChunkedList'

import { formatDateTime } from '@/domain/questionnaire'
import { filterMyRecords } from '@/domain/questionnaire/records'
import { answerUrl } from '@/domain/questionnaire/routes'
import { useSessionStore } from '@/stores/session'
import { BxError } from '@/utils/request'
import { draftAnswersKey, getMyBatches, storage } from '@/utils/storage'
import { toast } from '@/utils/ui'

interface Props {
  activityNo: string
}

const props = defineProps<Props>()

const session = useSessionStore()

/** 服务端返回的原始行（分页记账用原始条数，不能用过滤后的） */
const rows = ref<DaqRecordReplyRow[]>([])
const loading = ref(false)
const finished = ref(false)
const loaded = ref(false)
/** 加载失败：与 finished 区分开，失败后必须允许重试 */
const failed = ref(false)
/** 首次加载失败的原因，用于页面级错误态 */
const errorMessage = ref('')
const pageNo = ref(1)
// 与老工程 history.vue 的 rownumber 一致，减少翻页请求次数
const rownumber = 20

/** 筛选分段：只过滤已加载到本地的行，不改接口参数 */
type RecordFilter = 'all' | 'done' | 'draft'

const filter = ref<RecordFilter>('all')

const filterTabs: Array<{ key: RecordFilter, label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'done', label: '已提交' },
  { key: 'draft', label: '未提交' },
]

/**
 * 记录归属过滤
 *
 * `record_reply_select` **未登录时不带 user_no 条件**，会返回该活动的全部记录
 * （含他人批次号，点进去还能看到他人作答）。已登录时服务端已按 user_no 过滤，
 * 这里仍然再判一次 —— 服务端行为变了也不会直接漏出他人数据。
 */
const ownership = computed(() => ({
  userNo: session.userInfo?.user_no || '',
  myBatches: getMyBatches(props.activityNo),
}))

/** 只属于当前用户的记录 */
const visibleRows = computed(() => filterMyRecords(rows.value, ownership.value).mine)

/**
 * 本机未提交的草稿
 *
 * 逐题上报下线后服务端不再产生 `state='未完成'` 记录：用户填一半退出，这个列表
 * 此前**看不到任何痕迹**，只有再点一次「开始作答」才会被恢复。这里把本机草稿
 * 显式渲染成一行，带保存时间与「继续作答」。
 */
const localDraft = ref<LocalDraft | null>(null)

function refreshLocalDraft(): void {
  const saved = storage.get<LocalDraft | null>(draftAnswersKey(props.activityNo), null)
  const answers = saved?.answers ?? {}
  localDraft.value = saved && Object.keys(answers).length > 0 ? saved : null
}

/** 毫秒时间戳 → `2026-11-06 19:08`；自己造的 Date，不涉及后端字符串解析的跨端坑 */
function formatSavedAt(ms: number | undefined): string {
  if (!ms) {
    return ''
  }
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function resumeLocalDraft(): void {
  uni.navigateTo({ url: answerUrl(props.activityNo) })
}

onMounted(refreshLocalDraft)

function isDraft(row: DaqRecordReplyRow): boolean {
  return String(row.state ?? '') === '未完成'
}

/**
 * 记录时间：**已提交优先取 `end_time`**（真实提交时刻），草稿才退回 `start_time`
 *
 * 与「我的测评」（couple）统一口径 —— 那边一直用 `end_time ?? start_time`。
 * 此前这里固定取 `start_time` 却贴在「已提交」标签旁边，用户读到的「提交时间」
 * 其实是开始作答时间，同一批次在两个页面显示的时间也不一样。
 */
function recordTime(row: DaqRecordReplyRow): string {
  return formatDateTime(row.end_time) || formatDateTime(row.start_time)
}

/** 分段筛选后的行：草稿 = state 未完成，已提交 = 其余（含无状态的历史行） */
const filteredRows = computed(() =>
  visibleRows.value.filter((row) => {
    if (filter.value === 'all') {
      return true
    }
    return filter.value === 'draft' ? isDraft(row) : !isDraft(row)
  }),
)

/**
 * 分片渲染（首屏 20 条，每次追加 20 条）
 *
 * 分页本身按 20 条一页从服务端拉，但**累计**几页之后全部渲染，DOM 会随浏览深度线性增长
 * （每行约 15 个节点，200 条就是 3000 个）。这里只渲染前 N 条：
 * 先放本地已加载的分片，本地放完了再去请求下一页 —— 一次点击只放一屏，滚动到底也能自动追加
 * （页面 `onReachBottom` → 暴露的 `loadMore`）。
 *
 * 不做虚拟滚动：记录列表挂在页面级滚动上（下拉刷新 / 触底加载都依赖它），
 * 组件自己接管滚动会把这两件事一起弄坏。
 */
const {
  renderedCount: recordRenderedCount,
  hasMore: hasMoreLoaded,
  remaining: hiddenLoadedCount,
  loadMore: revealMoreRows,
  reset: resetRenderWindow,
} = useChunkedList({ total: () => filteredRows.value.length })

/** 实际渲染的行：前缀切片，下标与原数组一致 */
const renderedRows = computed(() => filteredRows.value.slice(0, recordRenderedCount.value))

/** 服务端命中的总条数；只在登录态可信 —— 未登录时该服务返回的是所有人的记录 */
const serverTotal = ref(0)

/**
 * 是否展示「共 N 条」
 *
 * 三个条件缺一不可：登录态（未登录时服务端返回所有人的记录，总数会包含别人的）、
 * 「全部」分段（分段时 total 是过滤后的，与已加载数对比意义不大）、以及确实拿到了值。
 * 其余情况仍显示「已显示 x / y 条」。
 */
const showServerTotal = computed(() => session.isLogin && filter.value === 'all' && serverTotal.value > 0)

/**
 * 条数文案
 *
 * 用计算属性而不是模板里的 `v-if`/三元：小程序的 `<text>` 只接受纯文本子节点，
 * 里面塞 `<template>` 或 `<view>` 会被编译器丢掉。
 */
const countText = computed(() =>
  showServerTotal.value
    ? `共 ${serverTotal.value} 条 · 已显示 ${renderedRows.value.length}`
    : `${renderedRows.value.length} / ${filteredRows.value.length} 条`,
)

/**
 * 切换筛选：回到首屏条数并**重新拉第一页**
 *
 * 「草稿」这个分段已经下推成服务端 `state='未完成'` 条件。不重新拉的话，
 * 分段里看到的永远只是「已加载的前 20 条」里筛出来的那几条，
 * 用户会以为草稿记录丢了。
 */
watch(filter, () => {
  resetRenderWindow()
  void fetchPage(true)
})

/** 底部「加载更多」是否可用：本地还有未渲染的，或服务端还有下一页 */
const canLoadMore = computed(() => hasMoreLoaded.value || !finished.value)

/**
 * 顶部提示文案
 *
 * 未登录时列表天然只能覆盖本机，必须解释一句，否则用户会以为记录丢了；
 * 被过滤掉的条数也如实写出来 —— 「不是没有记录，是不给你看别人的」和
 * 「一条都没有」是完全不同的两件事，让用户自己判断。
 */
const loginHint = computed(() => {
  if (session.isLogin || visibleRows.value.length === 0) {
    return ''
  }
  const hidden = filterMyRecords(rows.value, ownership.value).hidden
  return hidden > 0
    ? `未登录，仅显示本机作答记录（已隐藏 ${hidden} 条其他账号的记录）`
    : '未登录，仅显示本机作答记录'
})

/**
 * 空态提示
 *
 * 未登录时「暂无记录」有两种含义：真的没有，或者**本页 20 条全是别人的**、自己的在后面。
 * 后者可以用「加载更多记录」继续找，提示里必须把这一层说清楚，否则用户以为记录丢了。
 */
const emptyTip = computed(() => {
  if (session.isLogin) {
    return '当前账号在本问卷下还没有作答记录'
  }
  return finished.value
    ? '未登录时只显示本机作答记录；换设备或清过浏览器数据就看不到，登录后可查看账号下的全部记录'
    : '未登录时只显示本机作答记录。已加载的这批里没有你的，可以点「加载更多记录」继续找'
})

/**
 * 请求序号
 *
 * 切换筛选会 `reset` 重拉，而 `loading` 锁只挡得住「触底加载」：快速来回点分段时，
 * 旧请求后返回会把新筛选的结果覆盖掉。用序号丢弃过期响应（含 catch / finally）。
 */
let fetchToken = 0

async function fetchPage(reset = false): Promise<void> {
  // 触底加载不抢占进行中的请求；`reset`（切换筛选 / 下拉刷新）必须抢占
  if (loading.value && !reset) {
    return
  }
  if (reset) {
    pageNo.value = 1
    rows.value = []
    finished.value = false
  }
  if (finished.value) {
    return
  }

  const token = ++fetchToken
  loading.value = true
  try {
    const envelope = await recordReplySelect({
      activityNo: props.activityNo,
      // 用 || 而非 ??：空字符串也要视为「无用户」，否则会传 user_no eq '' 导致查不到任何记录
      userNo: session.userInfo?.user_no || undefined,
      // 「草稿」下推成服务端条件；「已提交」是「非未完成」，eq 表达不了，仍走本地过滤
      state: filter.value === 'draft' ? '未完成' : undefined,
      pageNo: pageNo.value,
      rownumber,
    })
    if (token !== fetchToken) {
      return
    }

    const page = envelope.data ?? []
    rows.value = [...rows.value, ...page]
    serverTotal.value = Number(envelope.page?.total ?? rows.value.length)

    const total = envelope.page?.total ?? rows.value.length
    finished.value = rows.value.length >= total || page.length === 0
    pageNo.value += 1
    loaded.value = true
    failed.value = false
  }
  catch (error) {
    if (token !== fetchToken) {
      return
    }
    // 不置 finished：一次网络抖动不该让列表永久停在「没有更多了」；
    // pageNo 也不递增，重试请求的仍是同一页。
    const message = error instanceof BxError ? error.message : '记录加载失败'
    errorMessage.value = message
    failed.value = true
    // 首次失败由页面级错误态呈现；只有触底加载失败才补一次轻提示，
    // 否则同一个错误会被提示两遍。
    if (rows.value.length > 0) {
      toast(message)
    }
  }
  finally {
    // 只有最新一次请求结束时才收起 loading，否则加载态会提前消失
    if (token === fetchToken) {
      loading.value = false
    }
  }
}

async function refresh(): Promise<void> {
  // 刷新后数据整体换掉：渲染窗口回到首屏条数
  resetRenderWindow()
  await fetchPage(true)
}

/**
 * 加载更多（「加载更多」按钮与页面触底共用）
 *
 * 两段式：
 * 1. 本地还有已加载但没渲染的记录 → 先放出一屏（不再发请求）；
 * 2. 本地放完了 → 拉下一页；新页到达后立刻再放一屏，
 *    否则用户点一次只看到「正在加载…」然后还要再点一次。
 */
async function loadMore(): Promise<void> {
  if (loading.value) {
    return
  }
  if (revealMoreRows()) {
    return
  }
  if (finished.value) {
    return
  }
  const before = filteredRows.value.length
  await fetchPage(false)
  if (filteredRows.value.length > before) {
    revealMoreRows()
  }
}

function openDetail(row: DaqRecordReplyRow): void {
  const state = String(row.state ?? '')
  const formType = state === '未完成' ? 'form' : 'detail'
  uni.navigateTo({
    url: answerUrl(String(row.activity_no ?? ''), {
      formType,
      status: state,
      fillBatchNo: String(row.fill_batch_no ?? ''),
    }),
  })
}

/**
 * 键盘激活
 *
 * 记录行与「加载更多」都是可点击的 <view> / <text>，天然不可聚焦 ——
 * 键盘用户看不到也打不开这些记录。与 BxButton / BxOptionList 同一类问题。
 */
function isActivateKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar'
}

function onCardKeydown(event: KeyboardEvent, row: DaqRecordReplyRow): void {
  if (!isActivateKey(event)) {
    return
  }
  event.preventDefault()
  openDetail(row)
}

function onMoreKeydown(event: KeyboardEvent): void {
  if (!isActivateKey(event)) {
    return
  }
  event.preventDefault()
  void loadMore()
}

function onFilterKeydown(event: KeyboardEvent, key: RecordFilter): void {
  if (!isActivateKey(event)) {
    return
  }
  event.preventDefault()
  filter.value = key
}

function setFilter(key: RecordFilter): void {
  filter.value = key
}

/**
 * 未登录时给一个可点的出口
 *
 * 空态提示已经写明「登录后可查看账号下的全部记录」，但原来没有任何入口 ——
 * 用户看完提示仍然不知道去哪里登录。
 */
function goLogin(): void {
  uni.navigateTo({ url: '/pages/login/index' })
}

function onLoginKeydown(event: KeyboardEvent): void {
  if (!isActivateKey(event)) {
    return
  }
  event.preventDefault()
  goLogin()
}

/** 空态的主操作：回到这份问卷去答 */
function goAnswer(): void {
  uni.navigateTo({ url: answerUrl(props.activityNo, { status: '进行中' }) })
}

function resetFilter(): void {
  filter.value = 'all'
}

defineExpose({ refresh, loadMore })

void fetchPage(true)
</script>

<template>
  <view class="records">
    <!-- 网络状态条：记录列表依赖网关，断网 / 弱网时在内容区顶部常驻说明 -->
    <BxNetworkBar />

    <!-- 加载：三条骨架保持布局稳定，比一行「正在加载记录…」更符合「内容马上来」 -->
    <view v-if="visibleRows.length === 0 && loading" class="records__skeleton" aria-busy="true">
      <view v-for="n in 3" :key="n" class="records__skeleton-row" />
    </view>

    <view v-else-if="visibleRows.length === 0 && failed" class="records__state">
      <BxEmpty
        :text="errorMessage || '记录加载失败'"
        tip="网络恢复后可以重新加载"
      />
      <view class="records__retry">
        <BxButton type="secondary" size="small" @click="refresh">
          重新加载
        </BxButton>
      </view>
    </view>

    <view v-else-if="visibleRows.length === 0 && loaded" class="records__empty">
      <BxEmpty
        text="暂无作答记录"
        :tip="emptyTip"
      />
      <view class="records__retry">
        <!--
          还有下一页时必须给出口：未登录时首页 20 条可能全是别人的，自己的记录在后面。
          没有这个按钮，空态就是一个死胡同（内容短于视口时也不会触发 onReachBottom）。
        -->
        <BxButton v-if="!finished" type="secondary" size="small" @click="loadMore">
          加载更多记录
        </BxButton>
        <BxButton type="primary" size="small" @click="goAnswer">
          去答一份问卷
        </BxButton>
        <BxButton v-if="!session.isLogin" type="ghost" size="small" @click="goLogin">
          去登录
        </BxButton>
      </view>
    </view>

    <view v-else class="records__list">
      <!-- 未登录提示 + 登录入口 -->
      <view v-if="loginHint" class="records__notice">
        <text class="records__notice-text">{{ loginHint }}</text>
        <view
          class="records__notice-link"
          role="button"
          tabindex="0"
          @click="goLogin"
          @keydown="onLoginKeydown"
        >
          <text class="records__notice-link-text">去登录</text>
        </view>
      </view>

      <!-- 筛选分段：全部 / 已提交 / 草稿 -->
      <view v-if="visibleRows.length > 0" class="records__bar">
        <view class="records__seg" role="group" aria-label="筛选作答记录">
          <view
            v-for="tab in filterTabs"
            :key="tab.key"
            class="records__seg-item"
            :class="{ 'records__seg-item--active': filter === tab.key }"
            role="button"
            tabindex="0"
            :aria-pressed="filter === tab.key ? 'true' : 'false'"
            @click="setFilter(tab.key)"
            @keydown="onFilterKeydown($event, tab.key)"
          >
            {{ tab.label }}
          </view>
        </view>
        <text class="records__count">{{ countText }}</text>
      </view>

      <!-- 筛选后为空：给回「查看全部」的出口 -->
      <view v-if="filteredRows.length === 0" class="records__filter-empty">
        <text class="records__filter-empty-text">{{ filter === 'draft' ? '没有未提交的草稿' : '没有已提交的记录' }}</text>
        <view
          class="records__filter-empty-link"
          role="button"
          tabindex="0"
          @click="resetFilter"
          @keydown.enter.prevent="resetFilter"
          @keydown.space.prevent="resetFilter"
        >
          查看全部
        </view>
      </view>

      <!--
        本机草稿：服务端不再产生「未完成」记录，填到一半的痕迹只能从本机读。
        放在列表最上方 —— 它是用户最可能接着做的事。
      -->
      <view
        v-if="localDraft && filter !== 'done'"
        class="record record--local-draft"
        role="button"
        tabindex="0"
        aria-label="本机保存的草稿，继续作答"
        @click="resumeLocalDraft"
        @keydown.enter.prevent="resumeLocalDraft"
        @keydown.space.prevent="resumeLocalDraft"
      >
        <view class="record__meta">
          <view class="record__dot record__dot--draft" aria-hidden="true" />
          <text class="record__state record__state--draft">未提交</text>
          <text v-if="formatSavedAt(localDraft.savedAt)" class="record__time">
            本机保存于 {{ formatSavedAt(localDraft.savedAt) }}
          </text>
        </view>
        <view class="record__main">
          <text class="record__title">继续作答（答案存在本机）</text>
        </view>
      </view>

      <!--
        一行一条记录：状态点 + 状态 + 时间 / 标题 + 分数 / 批次 + 行动。
        记录是同质条目，每行都「浮」起来会变成盒子墙 —— 这里用一条细线分隔。
        只渲染分片前缀（首屏 20 条），其余靠底部「加载更多」/ 触底追加。
      -->
      <view
        v-for="row in renderedRows"
        :key="String(row.fill_batch_no)"
        class="record"
        role="button"
        :aria-label="`查看作答记录 ${row.title || row.activity_no} ${row.state || ''}`"
        tabindex="0"
        hover-class="record--hover"
        :hover-stay-time="60"
        @click="openDetail(row)"
        @keydown="onCardKeydown($event, row)"
      >
        <view class="record__meta">
          <view
            class="record__dot"
            :class="isDraft(row) ? 'record__dot--draft' : 'record__dot--done'"
            aria-hidden="true"
          />
          <text class="record__state" :class="isDraft(row) ? 'record__state--draft' : 'record__state--done'">
            {{ isDraft(row) ? '草稿' : '已提交' }}
          </text>
          <text v-if="recordTime(row)" class="record__time">
            {{ recordTime(row) }}
          </text>
        </view>

        <view class="record__main">
          <text class="record__title">{{ row.title || row.activity_no }}</text>
          <view v-if="row.score !== null && row.score !== undefined" class="record__score">
            <text class="record__score-num">{{ row.score }}</text>
            <text class="record__score-unit">分</text>
          </view>
        </view>

        <view class="record__foot">
          <text v-if="row.fill_batch_no" class="record__batch">批次 {{ row.fill_batch_no }}</text>
          <text class="record__action">
            {{ isDraft(row) ? '继续作答' : '查看结果' }}
          </text>
        </view>
      </view>

      <view v-if="filteredRows.length > 0" class="records__more">
        <text v-if="loading" class="records__more-text">正在加载…</text>
        <text v-else-if="hasMoreLoaded" class="records__more-text" role="button" tabindex="0" @click="loadMore" @keydown="onMoreKeydown">
          显示更多（还有 {{ hiddenLoadedCount }} 条）
        </text>
        <text v-else-if="finished" class="records__more-text">没有更多了</text>
        <text
          v-else-if="failed"
          class="records__more-text"
          role="button"
          tabindex="0"
          @click="loadMore"
          @keydown="onMoreKeydown"
        >
          加载失败，点击重试
        </text>
        <text
          v-else-if="canLoadMore"
          class="records__more-text"
          role="button"
          tabindex="0"
          @click="loadMore"
          @keydown="onMoreKeydown"
        >
          点击加载更多
        </text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 失败态容器：BxEmpty 自带内边距，这里只留按钮上方的呼吸空间 */
.records__state {
  padding: 0 0 24px;
}

/* 加载骨架 */
.records__skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.records__skeleton-row {
  height: 76px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-card);
}

.records__retry {
  /* BxButton 基类是块级元素，不套 flex 会撑满整行 */
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

/* 两个动作之间留间距 */
.records__retry > :not(:first-child) {
  margin-left: 10px;
}

/* 列表容器化：一条分割线代替逐卡阴影 —— 记录是同质条目，不该每行都「浮」起来 */
.records__list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

/* ── 未登录提示 ─────────────────────────────────────────────────── */
.records__notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: var(--bx-surface-2);
  border-bottom: 1px solid var(--bx-line-2);
}

.records__notice-text {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-caption);
  line-height: 1.6;
  color: var(--bx-text-3);
}

/* 触摸目标 44px：全文的设计约定，32px 在手机上点偏一次就会误触到旁边的文字 */
.records__notice-link {
  flex: none;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 2px;
  cursor: pointer;
}

.records__notice-link:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
  border-radius: var(--bx-radius-xs);
}

.records__notice-link-text {
  font-size: var(--bx-font-caption);
  font-weight: 500;
  line-height: 1.6;
  color: var(--bx-primary);
}

/* ── 筛选分段 ───────────────────────────────────────────────────── */
.records__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--bx-line-2);
}

.records__seg {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 2px;
  padding: 3px;
  background-color: var(--bx-surface-2);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-pill);
}

.records__seg-item {
  flex: 1;
  padding: 0 8px;
  /* 40px：分段是并排的相邻目标，比单按钮更容易点错，取 40 兼顾触摸与视觉高度 */
  height: 40px;
  font-size: var(--bx-font-sub);
  line-height: 40px;
  color: var(--bx-text-3);
  text-align: center;
  border-radius: var(--bx-radius-pill);
  cursor: pointer;
  transition:
    color var(--bx-duration-fast) var(--bx-ease-out),
    background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .records__seg-item:hover {
    color: var(--bx-text);
  }
}

.records__seg-item--active {
  background-color: var(--bx-surface);
  color: var(--bx-text);
  font-weight: 500;
  box-shadow: var(--bx-elev-1);
}

.records__seg-item:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.records__count {
  flex: none;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 筛选后为空 */
.records__filter-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
}

.records__filter-empty-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
}

.records__filter-empty-link {
  min-height: 44px;
  padding: 0 8px;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  line-height: 44px;
  color: var(--bx-primary);
  cursor: pointer;
}

.records__filter-empty-link:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
  border-radius: var(--bx-radius-sm);
}

/* ── 记录行 ─────────────────────────────────────────────────────── */
.record {
  padding: 14px 16px;
  cursor: pointer;
}

.record + .record {
  border-top: 1px solid var(--bx-line-2);
}

/* 本机草稿：左侧主色条 + 淡底，与服务端记录区分，避免被误认为已提交 */
.record--local-draft {
  background-color: var(--bx-primary-soft);
  box-shadow: inset 3px 0 0 var(--bx-primary);
}

/* 焦点可见性：uni-app 内置样式把 outline 设成 none */
.record:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

.record--hover {
  background-color: var(--bx-surface-2);
}

/* 第一行：状态点 + 状态 + 时间 */
.record__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.record__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.record__dot--done {
  background-color: var(--bx-success);
}

.record__dot--draft {
  background-color: var(--bx-warn);
}

.record__state {
  flex: none;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
}

.record__state--done {
  color: var(--bx-success);
}

.record__state--draft {
  color: var(--bx-warn);
}

.record__time {
  min-width: 0;
  margin-left: 4px;
  overflow: hidden;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 第二行：标题 + 分数 */
.record__main {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 4px;
}

.record__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: 1.5;
  color: var(--bx-text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 分数用等宽数字位：多条记录并排时数字宽度不会跳 */
.record__score {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
}

.record__score-num {
  font-size: var(--bx-font-h2);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
}

.record__score-unit {
  font-size: var(--bx-font-caption);
  line-height: 1;
  color: var(--bx-text-3);
}

/* 第三行：批次 + 行动 */
.record__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
}

.record__batch {
  min-width: 0;
  overflow: hidden;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.record__action {
  flex: none;
  font-size: var(--bx-font-sub);
  font-weight: 500;
  line-height: var(--bx-leading-sub);
  color: var(--bx-primary);
}

.records__more {
  padding: 14px 16px;
  border-top: 1px solid var(--bx-line-2);
  text-align: center;
}

.records__more-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
  cursor: pointer;
}

.records__more-text:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
  border-radius: var(--bx-radius-sm);
}
</style>
