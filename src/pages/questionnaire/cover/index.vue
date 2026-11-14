<script setup lang="ts">
/**
 * 问卷封面页
 *
 * 入参：activity_no（必填）
 * 老链接（#/questionnaire/index/index）由 main.ts 的 hash 重写兼容，本页用于新入口。
 *
 * 视觉（docs/UI-UX-V6-设计系统.md §5/§6）：
 * 冷白画布 + 左对齐的排版层级：小标签 → 32/600 大标题 → 副标题（分享摘要）→
 * 描述（活动描述）→ 2×2 细分隔信息网格 → 可展开的「作答说明」→ 50px 通栏主行动 +
 * ghost 次行动。不用卡片墙分区：层级由字号、字重与 1px 细线承担。
 *
 * 分享：H5 走页内分享面板（ShareSheet），小程序走右上角转发 —— 后者需要在
 * `onShareAppMessage` / `onShareTimeline` 里注册，路径与答题页共用 `shareAnswerPath`。
 */

import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import BxAppearanceSheet from '@/components/base/BxAppearanceSheet.vue'
import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxQrCode from '@/components/base/BxQrCode.vue'
import { plainText } from '@/components/editor/plainText'
import ShareSheet from '@/components/share/ShareSheet.vue'

import { useQuestionnaire } from '@/composables/useQuestionnaire'
import { useShare } from '@/composables/useShare'
import { useUrlTicket } from '@/composables/useUrlTicket'
import { answerUrl, coverUrl, historyUrl, queryString, shareAnswerPath } from '@/domain/questionnaire/routes'
import { readQuery } from '@/utils/query'

// 先采纳 URL 票据：必须在页面自己的 onLoad 之前注册（uni-app 按注册顺序调用）
useUrlTicket()

/**
 * 开放「分享到朋友圈」
 *
 * `onShareTimeline` 只负责**返回值**；小程序端还要页面配置里开了这项，右上角才会
 * 出现「分享到朋友圈」入口，否则回调注册了也没有触发路径（与 `enablePullDownRefresh`
 * 必须在 `definePage` 里声明是同一类静默失效）。`style` 嵌套是 uni-app 的硬要求。
 */
definePage({ style: { enableShareTimeline: true } })

const { loading, activity, fields, errorMessage, needLogin, load } = useQuestionnaire()

const activityNo = ref('')

/**
 * 登录引导
 *
 * 「登录访问」的问卷在**加载阶段**就会被平台拦下（`0011 当前活动接口需要登录访问`），
 * 页面此前只显示一句通用加载失败，用户刷新多少次都一样。这里给出明确出口：
 * 送去登录，成功后用 redirect 回到本页。
 */
function goLogin(): void {
  const redirect = coverUrl(activityNo.value)
  uni.reLaunch({ url: `/pages/login/index?reason=required&redirect=${encodeURIComponent(redirect)}` })
}

/** 作答说明默认收起：首屏只留「这是什么、要答多久、怎么开始」 */
const expanded = ref(false)
/** 分享面板只在 H5 打开（小程序端入口用条件编译隐藏） */
const shareOpen = ref(false)
/** 外观（字号 / 主题）面板：作答者也能调，H5 入口 */
const appearanceOpen = ref(false)
const { shareLink } = useShare()

/** 分享「邀请作答」链接：保留 activity_no / status，不带票据 */
const shareUrl = computed(() =>
  shareLink(answerUrl(activityNo.value, { status: String(activity.value?.status ?? '进行中') })),
)

/**
 * 二维码内容：**本页**（问卷首页）的绝对地址
 *
 * 与 `shareUrl` 刻意不同 —— 那个指向答题页，用于「邀请别人作答」；
 * 二维码是给业务方自己换到手机上继续看的，扫开必须落在同一个封面页。
 * `shareLink` 在非 H5 返回空串，此时二维码不渲染（小程序里扫给自己没意义）。
 */
const homeQrUrl = computed(() => shareLink(coverUrl(activityNo.value)))

const title = computed(() => activity.value?.title || '问卷')

/**
 * 副标题与描述：口径与设计器封面预览（EditorCanvas 的 coverSub / coverIntro）一致
 *
 * 平台把这三列用得很反直觉，实测（214 两个真实活动）：
 * - `remark` 是**活动描述**（富文本 HTML），也是编辑器里唯一必填的一段，实际有内容的就是它；
 * - `summary` 是分享摘要，`start_remark` 是开始语 —— 两个活动里**都是 null**。
 *
 * 本页此前读的是 `start_remark`，于是设计器预览看得见描述、真机封面却空着。
 * 现在按设计器口径：`summary` 作副标题在最上，`remark` 作描述在下（都走 plainText）。
 *
 * `start_remark` 只作为描述的**兜底**保留：它在前端出现过的唯一位置就是本页，
 * 直接丢掉会让「只写了开始语」的活动从有字变成没字；作为 remark 之后的兜底，
 * 描述非空时两者显示的文本与设计器预览完全一致，不会多出一段。
 */
const subtitle = computed(() => plainText(activity.value?.summary))
const description = computed(
  () => plainText(activity.value?.remark) || plainText(activity.value?.start_remark),
)

const count = computed(() => fields.value.filter(field => field.widget !== 'section').length)
const ended = computed(() => activity.value?.status === '已结束')

/**
 * 尚未开始
 *
 * 此前只判「已结束」：未开始的活动照样显示「开始作答」，用户点进去才发现答不了，
 * 或者答完提交时才被平台拒绝。这里把状态三态化，未开始直接禁掉主按钮。
 */
const notStarted = computed(() => activity.value?.status === '未开始')

/** 开始时间：与 deadline 同一口径，只取到天 */
const startAt = computed(() => {
  const raw = String(activity.value?.start_time ?? '').trim()
  return raw.length >= 10 ? raw.slice(0, 10) : ''
})

/**
 * 标题上方的小标签
 *
 * 已结束优先说状态 —— 此时「能不能答」比「匿名还是登录」更重要；
 * 其余情况用访问方式（匿名问卷 / 需登录），它决定了用户对隐私的预期。
 */
const kicker = computed(() => {
  if (ended.value) {
    return '已结束'
  }
  const perm = String(activity.value?.perm_type ?? '').trim()
  // 「匿名访问 / 登录访问」是权限术语，对填写者换成能直接读懂的表述
  if (perm === '登录访问') {
    return '需登录后作答'
  }
  if (perm === '匿名访问') {
    return '无需登录'
  }
  const status = String(activity.value?.status ?? '').trim()
  return perm || status || '问卷'
})

/** 截止日期：只取到天，「截止 2026-12-31」比带时分更耐看 */
const deadline = computed(() => {
  const raw = String(activity.value?.end_time ?? '').trim()
  return raw.length >= 10 ? raw.slice(0, 10) : ''
})

/**
 * 封面信息网格（2×2）
 *
 * 只展示活动行里**真实存在**的字段：活动没有「预计用时」就不编一个
 * 「约 3 分钟」—— 假信息比没有信息更糟。缺项时网格自动少一格，
 * 奇数个最后一项横跨两列（模板里用 --wide 类表达）。
 */
const infoItems = computed(() => {
  const rows: Array<{ label: string, value: string }> = [
    { label: '题目', value: `${count.value} 题` },
  ]

  if (deadline.value) {
    rows.push({ label: '截止', value: deadline.value })
  }

  const submitCount = Number(activity.value?.submit_count ?? 0)
  if (Number.isFinite(submitCount) && submitCount > 0) {
    rows.push({ label: '已答人数', value: `${submitCount} 人` })
  }

  const answerTimes = String(activity.value?.answer_times ?? '').trim()
  if (answerTimes) {
    rows.push({ label: '作答次数', value: answerTimes })
  }

  return rows
})

/** 展开区里的说明行：与上方信息网格重复的项不再重复列 */
const notes = computed(() => {
  const rows: Array<{ label: string, value: string }> = []
  const answerTimes = String(activity.value?.answer_times ?? '').trim()
  if (answerTimes) {
    rows.push({ label: '作答次数', value: answerTimes })
  }
  const perm = String(activity.value?.perm_type ?? '').trim()
  if (perm) {
    rows.push({ label: '访问方式', value: perm })
  }
  return rows
})

/**
 * 展开区的内容：只有说明行
 *
 * 分享摘要（`summary`）已经作为副标题显示在标题下方，这里**不再重复渲染** ——
 * 同一段文字在首屏与展开区各出现一次，读者会以为活动写了两遍。
 */
const hasMore = computed(() => notes.value.length > 0)

/**
 * 页脚隐私说明
 *
 * 「匿名」不能写死：活动可能配置成需登录，把登录问卷说成匿名是错误信息，
 * 比少一句话更糟。只在访问方式确实含「匿名」时才提。
 */
const privacyFoot = computed(() => {
  const perm = String(activity.value?.perm_type ?? '')
  return perm.includes('匿名')
    ? '匿名作答 · 数据仅用于整体分析'
    : '数据仅用于整体分析'
})

onLoad((query) => {
  activityNo.value = readQuery(query, 'activity_no')
  void init()
})

async function init(): Promise<void> {
  if (!activityNo.value) {
    errorMessage.value = '缺少活动编号，无法加载问卷'
    return
  }
  await load(activityNo.value, { mode: 'plain' })
}

/**
 * 小程序转发
 *
 * 封面页此前**没有**注册转发回调，全仓只有答题页注册过 —— 小程序里停在封面时
 * 右上角「转发」拿不到自定义标题与路径，等于转发不可用。这里补齐，与答题页同一套写法。
 *
 * 分享目标是**答题页**（好友点开可直接作答），路径复用 `shareAnswerPath`。
 *
 * `path` 要自己补前导 `/`：微信 `onShareAppMessage` 要求的是「以 / 开头的完整路径」，
 * `shareAnswerPath` 只返回去掉了 `/` 的片段（便于调用方按需拼接）。这与答题页
 * `index/index.vue` 的 `path: \`/${shareAnswerPath(...)}\`` 是同一写法，改一处必须改另一处。
 */
onShareAppMessage(() => ({
  title: title.value,
  path: `/${shareAnswerPath(activityNo.value)}`,
}))

/** 分享到朋友圈：只接受 `query`（查询串），页面路径由微信按当前页补全 */
onShareTimeline(() => ({
  title: title.value,
  query: queryString({ formType: 'form', activity_no: activityNo.value, status: '进行中' }),
}))

function start(): void {
  uni.navigateTo({ url: answerUrl(activityNo.value, { status: activity.value?.status ?? '进行中' }) })
}

/**
 * 预览问卷
 *
 * 运营在电脑上想自己看效果，此前必须绕去设计器。这里给一个直达入口：
 * `formType=preview` 是只读模式，不产生提交记录，也不会读已有作答。
 */
function openPreview(): void {
  uni.navigateTo({
    url: answerUrl(activityNo.value, {
      formType: 'preview',
      status: String(activity.value?.status ?? ''),
    }),
  })
}

function openRecords(): void {
  uni.navigateTo({ url: historyUrl(activityNo.value, title.value) })
}

function openShare(): void {
  if (!shareUrl.value) {
    return
  }
  shareOpen.value = true
}

function toggleMore(): void {
  expanded.value = !expanded.value
}

/** 与 BxButton / BxNavBar 同一套键盘约定：可点的 view 要能回车触发 */
function onToggleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  toggleMore()
}

function onRecordsKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  openRecords()
}

function onShareKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
    return
  }
  event.preventDefault()
  openShare()
}
</script>

<template>
  <view class="c-page">
    <view class="c-page__body bx-container">
      <view class="c-page__content">
        <!-- 骨架屏：与真实版式同构，加载完不跳动 -->
        <view v-if="loading" class="c-skeleton" aria-busy="true">
          <view class="c-skeleton__kicker" />
          <view class="c-skeleton__title" />
          <view class="c-skeleton__line" />
          <view class="c-skeleton__grid" />
        </view>

        <view v-else-if="errorMessage" class="c-error">
          <BxEmpty
            :text="errorMessage"
            :tip="needLogin ? '该问卷仅限登录后作答' : '请确认链接是否有效，或联系活动发起人'"
          />
          <view v-if="needLogin" class="c-error__action">
            <BxButton size="large" block @click="goLogin">
              登录后作答
            </BxButton>
          </view>
        </view>

        <template v-else>
          <!-- 顶部：品牌小字 + 分享 / 记录入口（44px 触摸目标） -->
          <view class="c-top">
            <text class="c-top__brand">园区问卷</text>
            <view class="c-top__actions">
              <!-- #ifdef H5 -->
              <view
                class="c-top__appearance"
                role="button"
                tabindex="0"
                aria-label="字号与主题"
                @click="appearanceOpen = true"
                @keydown.enter.prevent="appearanceOpen = true"
              >
                <text class="c-top__appearance-text">Aa</text>
              </view>
              <view
                class="c-top__share"
                role="button"
                tabindex="0"
                aria-label="分享问卷"
                @click="openShare"
                @keydown="onShareKeydown"
              >
                <view class="c-share-icon" aria-hidden="true">
                  <view class="c-share-icon__tip" />
                  <view class="c-share-icon__shaft" />
                  <view class="c-share-icon__box" />
                </view>
              </view>
              <!-- #endif -->
              <view
                class="c-top__records"
                role="button"
                tabindex="0"
                aria-label="查看作答记录"
                @click="openRecords"
                @keydown="onRecordsKeydown"
              >
                <text class="c-top__records-text">作答记录</text>
                <view class="c-top__chev" aria-hidden="true" />
              </view>
            </view>
          </view>

          <!-- 标题区：小标签 → 32/600 大标题 → 副标题（分享摘要）→ 描述（活动描述） -->
          <view class="c-head">
            <text class="c-head__kicker">{{ kicker }}</text>
            <text class="c-head__title">{{ title }}</text>
            <text v-if="subtitle" class="c-head__subtitle">{{ subtitle }}</text>
            <text v-if="description" class="c-head__intro">{{ description }}</text>
          </view>

          <!-- 信息网格：2×2，细线分隔，不是四个卡 -->
          <view class="c-info">
            <view
              v-for="(item, index) in infoItems"
              :key="item.label"
              class="c-info__cell"
              :class="{ 'c-info__cell--wide': infoItems.length % 2 === 1 && index === infoItems.length - 1 }"
            >
              <text class="c-info__label">{{ item.label }}</text>
              <text class="c-info__value">{{ item.value }}</text>
            </view>
          </view>

          <!-- 作答说明：可展开，收起时不占首屏注意力 -->
          <view class="c-more">
            <view
              class="c-more__toggle"
              role="button"
              tabindex="0"
              :aria-expanded="expanded ? 'true' : 'false'"
              @click="toggleMore"
              @keydown="onToggleKeydown"
            >
              <text class="c-more__toggle-text">作答说明</text>
              <view class="c-more__chev" :class="{ 'c-more__chev--open': expanded }" aria-hidden="true" />
            </view>

            <view v-if="expanded" class="c-more__body">
              <view v-for="note in notes" :key="note.label" class="c-more__row">
                <text class="c-more__row-label">{{ note.label }}</text>
                <text class="c-more__row-value">{{ note.value }}</text>
              </view>
              <text v-if="!hasMore" class="c-more__empty">
                本问卷未提供额外说明，如有疑问请联系活动发起人。
              </text>
            </view>
          </view>

          <!-- 主行动：通栏 50px，次行动 ghost -->
          <view class="c-actions">
            <!-- 未开始不给「开始作答」：点进去答不了、提交还会被平台拒 -->
            <BxButton v-if="notStarted" size="large" block disabled>
              尚未开始
            </BxButton>
            <BxButton v-else-if="!ended" size="large" block @click="start">
              开始作答
            </BxButton>
            <BxButton v-else type="secondary" size="large" block @click="start">
              查看问卷内容
            </BxButton>
            <BxButton type="ghost" size="large" block @click="openRecords">
              查看我的记录
            </BxButton>
            <text v-if="notStarted" class="c-actions__tip">
              {{ startAt ? `本问卷将于 ${startAt} 开始，届时可作答` : '本问卷尚未开始' }}
            </text>
            <text v-else class="c-actions__tip">作答过程中会自动保存草稿，可随时返回继续</text>
            <text class="c-actions__foot">{{ privacyFoot }}</text>
          </view>

          <!--
            问卷二维码

            只在宽屏出现：手机上打开本页时扫码给自己没有意义，还会占掉首屏。
            内容是本页（问卷首页）的绝对地址，扫开落在同一个封面。
          -->
          <view v-if="homeQrUrl" class="c-qr">
            <BxQrCode :value="homeQrUrl" :size="128" caption="扫码在手机上打开问卷首页" />
            <!-- #ifdef H5 -->
            <!-- 运营在电脑上想自己看效果，此前必须绕去设计器；这里给一个直达预览的入口 -->
            <view
              class="c-qr__preview"
              role="button"
              tabindex="0"
              aria-label="预览问卷"
              @click="openPreview"
              @keydown.enter.prevent="openPreview"
            >
              <text class="c-qr__preview-text">预览问卷</text>
            </view>
            <!-- #endif -->
          </view>
        </template>
      </view>
    </view>

    <!-- 分享面板（H5 入口；小程序端不渲染入口，组件也只在 H5 使用） -->
    <ShareSheet
      v-if="!loading && !errorMessage"
      :open="shareOpen"
      :url="shareUrl"
      :title="title"
      @close="shareOpen = false"
    />

    <!-- #ifdef H5 -->
    <BxAppearanceSheet v-if="appearanceOpen" @close="appearanceOpen = false" />
    <!-- #endif -->
  </view>
</template>

<style lang="scss" scoped>
/* ── 页面骨架 ────────────────────────────────────────────────────── */
.c-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bx-bg);
}

.c-page__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  /* 不写死高度：内容比视口高时让它自然溢出（可继续向下滚动） */
  padding-top: 16px;
  padding-bottom: 24px;
}

.c-page__content {
  display: flex;
  flex: 1;
  flex-direction: column;
}

/* ── 加载骨架（与真实版式同构） ────────────────────────────────── */
.c-skeleton {
  display: flex;
  flex-direction: column;
}

.c-skeleton__kicker {
  width: 88px;
  height: 11px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-xs);
}

.c-skeleton__title {
  width: 62%;
  height: 32px;
  margin-top: 12px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-sm);
}

.c-skeleton__line {
  width: 88%;
  height: 15px;
  margin-top: 12px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-xs);
}

.c-skeleton__grid {
  width: 100%;
  height: 108px;
  margin-top: 24px;
  background-color: var(--bx-line-2);
  border-radius: var(--bx-radius-card);
}

/* ── 顶部行 ──────────────────────────────────────────────────────── */
.c-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
}

.c-top__brand {
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

/* 44px 触摸目标：负外距把视觉位置收回去，布局不因此外扩 */
.c-top__records {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  margin-right: -8px;
  padding: 0 8px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .c-top__records:hover {
    background-color: var(--bx-surface-2);
  }
}

.c-top__records:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.c-top__records-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-3);
}

/* 箭头用两条边框旋转绘制：不用图标字体，也不用 svg（小程序不支持） */
.c-top__chev {
  width: 6px;
  height: 6px;
  border-top: 1.5px solid currentColor;
  border-right: 1.5px solid currentColor;
  color: var(--bx-text-3);
  transform: rotate(45deg);
}

.c-top__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 分享入口：44×44 触摸目标，图标是 CSS 绘制的三个点 + 两条连线 */
.c-top__share {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

/* 字号 / 主题入口：Aa 文本标签，与分享入口同尺寸 */
.c-top__appearance {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

.c-top__appearance-text {
  font-size: var(--bx-font-sub);
  font-weight: 600;
  color: var(--bx-text-3);
}

.c-top__appearance:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

@media (hover: hover) {
  .c-top__appearance:hover {
    background-color: var(--bx-surface-2);
  }
}

@media (hover: hover) {
  .c-top__share:hover {
    background-color: var(--bx-surface-2);
  }
}

.c-top__share:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: -2px;
}

/*
 * 分享图标：方框 + 向上箭头（「分享出去」的通用语义）
 *
 * 三段纯 CSS：border 三角作箭头、细长 view 作箭杆、顶部开口的方框作容器。
 * 不用图标字体、不用 svg、不用伪元素 —— 小程序对三者支持都不好。
 */
.c-share-icon {
  position: relative;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  color: var(--bx-text-3);
}

/* 箭头：border 三角朝上，两端透明，跨端一致 */
.c-share-icon__tip {
  position: absolute;
  top: 0;
  left: 50%;
  box-sizing: border-box;
  width: 0;
  height: 0;
  margin-left: -4px;
  border-right: 4px solid transparent;
  border-bottom: 5px solid currentColor;
  border-left: 4px solid transparent;
}

/* 箭杆：接在三角下方，穿过方框顶部缺口 */
.c-share-icon__shaft {
  position: absolute;
  top: 4px;
  left: 50%;
  width: 1.5px;
  height: 8px;
  margin-left: -0.75px;
  background-color: currentColor;
}

/* 方框：顶部不画边，箭头从缺口穿出 */
.c-share-icon__box {
  position: absolute;
  bottom: 1px;
  left: 2px;
  box-sizing: border-box;
  width: 14px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-top: 0;
  border-radius: 0 0 3px 3px;
}

/* 加载失败 / 需要登录：空态下方给一个明确的出口按钮 */
.c-error__action {
  margin-top: var(--bx-space-lg);
  padding: 0 var(--bx-space-lg);
}

/* ── 标题区 ──────────────────────────────────────────────────────── */
.c-head {
  padding-top: 32px;
}

.c-head__kicker {
  display: block;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.08em;
  color: var(--bx-text-3);
}

.c-head__title {
  display: block;
  margin-top: 12px;
  font-size: var(--bx-font-display);
  font-weight: 600;
  line-height: var(--bx-leading-display);
  /* ≥28px 的标题加 -0.02em 字距 */
  letter-spacing: -0.02em;
  color: var(--bx-text);
  /*
   * 不要 break-all：中文标题按标点避头尾规则断行才好看，
   * break-all 会把「（演示问卷）」拆成「（演示问」+「卷」。
   */
  word-break: normal;
  overflow-wrap: break-word;
}

/*
 * 副标题（分享摘要）：夹在 32px 大标题与 15px 描述之间，取 h2 字阶（17px）
 * 并加重一档字重 —— 与描述靠字号 + 颜色区分，不靠留白猜。
 */
.c-head__subtitle {
  display: block;
  max-width: 34em;
  margin-top: 10px;
  font-size: var(--bx-font-h2);
  font-weight: 500;
  line-height: 1.5;
  color: var(--bx-text-2);
}

/*
 * 描述（活动描述，富文本已 plainText 化）：正文大小、1.75 行高，比副标题轻一档
 * 用 `pre-line`：plainText 把 `<br>` 还原成 `\n`，两端的 `text` 都能按行换行
 */
.c-head__intro {
  display: block;
  max-width: 34em;
  margin-top: 8px;
  font-size: var(--bx-font-body);
  line-height: 1.75;
  white-space: pre-line;
  color: var(--bx-text-2);
}

/* ── 信息网格（2×2） ─────────────────────────────────────────────── */
.c-info {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 16px;
  border-top: 1px solid var(--bx-line);
  border-bottom: 1px solid var(--bx-line);
}

.c-info__cell {
  padding: 12px 0;
  min-width: 0;
}

/* 第一行之外加细横线；奇数个时最后一项横跨两列 */
.c-info__cell:nth-child(n + 3) {
  border-top: 1px solid var(--bx-line-2);
}

.c-info__cell:nth-child(odd) {
  padding-right: 12px;
  border-right: 1px solid var(--bx-line-2);
}

.c-info__cell:nth-child(even) {
  padding-left: 12px;
}

.c-info__cell--wide {
  grid-column: span 2;
  padding-right: 0;
  border-right: 0;
}

.c-info__label {
  display: block;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.c-info__value {
  display: block;
  margin-top: 2px;
  font-size: var(--bx-font-body);
  font-weight: 500;
  line-height: 1.4;
  color: var(--bx-text);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* ── 作答说明（可展开） ──────────────────────────────────────────── */
.c-more {
  margin-top: 8px;
}

.c-more__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0;
  cursor: pointer;
  transition: color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .c-more__toggle:hover .c-more__toggle-text {
    color: var(--bx-text);
  }
}

.c-more__toggle:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
  border-radius: var(--bx-radius-xs);
}

.c-more__toggle-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-text-2);
}

.c-more__chev {
  width: 6px;
  height: 6px;
  margin-left: auto;
  margin-right: 4px;
  border-right: 1.5px solid var(--bx-text-3);
  border-bottom: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
  transition: transform var(--bx-duration-base) var(--bx-ease-out);
}

.c-more__chev--open {
  transform: rotate(-135deg);
}

.c-more__body {
  padding: 0 0 12px;
}

.c-more__row {
  display: flex;
  align-items: baseline;
  padding: 8px 0;
  border-top: 1px solid var(--bx-line-2);
}

.c-more__row-label {
  flex: none;
  width: 64px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-3);
}

.c-more__row-value {
  flex: 1;
  min-width: 0;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  color: var(--bx-text-2);
  font-variant-numeric: tabular-nums;
}

/* 活动没有额外说明时的兜底：说明区不空着 */
.c-more__empty {
  display: block;
  padding-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-3);
}

/* ── 主行动 ──────────────────────────────────────────────────────── */
.c-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 内容短时把主行动推到底部：拇指区的按钮比页面中部好按 */
  margin-top: auto;
  padding-top: 32px;
}

/*
 * 宽屏（H5 桌面 / 小程序 PC 横屏）不追「拇指区」：视口高、内容短，
 * margin-top:auto 会留下几百像素的空档。让主行动紧跟内容即可。
 */
@media (min-width: 760px) {
  .c-actions {
    margin-top: 0;
    padding-top: 40px;
  }
}

/* 草稿自动保存提示：既有能力，保持常驻可见 */
.c-actions__tip {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: 1.7;
  color: var(--bx-text-3);
  text-align: center;
}

.c-actions__foot {
  display: block;
  margin-top: 4px;
  font-size: var(--bx-font-caption);
  line-height: var(--bx-leading-caption);
  letter-spacing: 0.04em;
  color: var(--bx-text-3);
  text-align: center;
}

/*
 * 问卷二维码
 *
 * 默认不渲染：手机上打开本页时扫码给自己没有意义，还会占掉首屏。
 * 只在宽屏（业务方在 PC 上核对、需要换到手机继续看）出现。
 */
.c-qr {
  display: none;
}

@media (min-width: 760px) {
  .c-qr {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-top: 32px;
  }
}

/* 预览入口：二维码下方的一行文字链接，弱化处理不抢主行动 */
.c-qr__preview {
  margin-top: 8px;
  padding: 4px 2px;
  cursor: pointer;
}

.c-qr__preview:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 2px;
}

.c-qr__preview-text {
  font-size: var(--bx-font-sub);
  line-height: var(--bx-leading-sub);
  color: var(--bx-primary);
}
</style>
