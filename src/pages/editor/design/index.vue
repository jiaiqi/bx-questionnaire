<script setup lang="ts">
/**
 * 可视化问卷设计器
 *
 * ## 布局：V6「清简」三栏工作台
 *
 * 宽度用 `@media` 判断（微信小程序 WXSS 支持媒体查询），**不用 JS 监听 resize**：
 * JS 方案要在 `onResize` 里维护一个宽度状态，初值、旋转屏、小程序 PC 端窗口拉伸
 * 三种情况都得各自处理，而 CSS 一次就够。于是：
 *
 * - 宽屏（≥1024px）：左「题纲」280 + 中「画布」自适应 + 右「属性」320；
 * - 中屏（900–1199px）：题纲 + 属性两栏，画布收起（挤下三栏，纸面就没法看了）；
 * - 窄屏（<900px）：题纲铺满，属性栏变成**全屏浮层**（原型的手机降级逻辑）。
 *
 * 这样 PC 与手机各用各的顺手形态，且两端共用同一份模板与逻辑
 * （不是两套页面，不会出现「PC 上修好了、手机上还是旧的」）。
 *
 * ## 三栏各答一个问题
 *
 * - **题纲**（左）：有哪些题 —— 题号 + 题干摘要 + 题型 / 选项数 / 分值
 * - **画布**（中）：这份问卷长什么样 —— 一张连续的纸，封面 + 题目卡
 * - **属性**（右）：当前这道题怎么改 —— 分组表单；未选题时就是「问卷信息」
 *
 * 业务逻辑（题目增删改排序、选项编辑、拖拽重排、保存编排、校验定位）全在
 * `useEditorDesign` 里：布局是模板的事、编排是 composable 的事，本文件只做绑定。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNetworkBar from '@/components/base/BxNetworkBar.vue'
import { ITEM_ROW_HEIGHT } from '@/components/editor/constants'
import DesignerPreview from '@/components/editor/DesignerPreview.vue'
import EditorActivityForm from '@/components/editor/EditorActivityForm.vue'
import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import EditorItemPanel from '@/components/editor/EditorItemPanel.vue'
import EditorItemRow from '@/components/editor/EditorItemRow.vue'
import EditorTypePicker from '@/components/editor/EditorTypePicker.vue'
import { useChunkedList } from '@/composables/useChunkedList'
import { useEditorDesign } from '@/composables/useEditorDesign'
import { answerUrl } from '@/domain/questionnaire/routes'
import { confirmDialog, toast } from '@/utils/ui'

// 解构出来的名字与模板里用的一致，改模板时不必再去 composable 里找别名
const {
  doc,
  loading,
  saving,
  loaded,
  loadError,
  saveError,
  issues,
  dirty,
  selectedKey,
  selectedIndex,
  selectedItem,
  activeTab,
  addingType,
  itemDragging,
  itemFromIndex,
  itemOverIndex,
  beginItemDrag,
  onItemDragMove,
  onItemDragEnd,
  onItemDragCancel,
  moveItem,
  onActivityPatch,
  onItemPatch,
  onItemAttrPatch,
  onItemIssues,
  onPickType,
  onRemoveItem,
  onDuplicateItem,
  onSelectItem,
  onClosePanel,
  onChangeType,
  onBackToList,
  onOptionAdd,
  onOptionReplaceAll,
  onOptionRemove,
  onOptionMoveUp,
  onOptionMoveDown,
  onOptionDragDrop,
  onOptionUpdateValue,
  onOptionUpdateAnswer,
  onOptionUpdatePoints,
  onSave,
  onDiscard,
} = useEditorDesign()

/**
 * 右栏显示哪一块
 *
 * - `item`：选中了某道题且停在「题目」页签；
 * - `info`：没有选中题目，或校验把用户送回了「问卷信息」。
 *
 * 一处状态（`activeTab` + `selectedKey`）派生两种视图，避免再维护一个「当前面板」
 * 变量 —— 三个状态源两两不一致时，界面就会互相打架。
 */
const panelMode = computed<'info' | 'item'>(() =>
  activeTab.value === 'items' && selectedItem.value ? 'item' : 'info',
)

/** 窄屏：属性栏是浮层，这两类状态打开它 */
const panelVisible = computed(() => panelMode.value === 'item' || activeTab.value === 'info')

/** 新建（还没有平台编号）：此时「已保存」是假话，状态一律说未保存 */
const isNewDoc = computed(() => !String(doc.value.activity.activityNo ?? ''))

/** 顶栏保存状态：保存中 / 未保存 / 已保存 */
const saveStateText = computed(() => {
  if (saving.value) {
    return '保存中'
  }
  return dirty.value || isNewDoc.value ? '未保存' : '已保存'
})

/** 未落盘时用警告色圆点，已保存用成功色 */
const saveStateDirty = computed(() => !saving.value && (dirty.value || isNewDoc.value))

/** 切回「问卷信息」时清掉题目选中（与原型「选中封面 = 不选题目」一致） */
watch(activeTab, (tab) => {
  if (tab === 'info') {
    onClosePanel()
  }
})

/** 从 uni-app 的 `event.detail.value` 读输入值；读不到就不改（不要写空串） */
function readInput(event: unknown): string | null {
  const value = (event as { detail?: { value?: string } })?.detail?.value
  return typeof value === 'string' ? value : null
}

/** 顶栏的问卷标题：直接写回活动字段，与左栏表单是同一个数据源 */
function onTitleInput(event: unknown): void {
  const value = readInput(event)
  if (value !== null) {
    onActivityPatch({ title: value })
  }
}

/** 题纲 / 画布选中题目：同时保证右栏切到「题目属性」 */
function selectItem(clientKey: string): void {
  activeTab.value = 'items'
  onSelectItem(clientKey)
}

/** 点封面 / 「问卷信息」：右栏切到问卷基本信息 */
function selectSurvey(): void {
  activeTab.value = 'info'
}

/** 窄屏浮层的返回：收起浮层并清掉选中 */
function closePanel(): void {
  activeTab.value = 'items'
  onClosePanel()
}

/** 删除当前题：走 composable 的二次确认（新增题 vs 已存题的后果不同） */
function onRemoveCurrentItem(): void {
  const item = selectedItem.value
  if (item) {
    void onRemoveItem(item.clientKey)
  }
}

/** 复制当前题目：副本插在原题之后并自动选中，方便直接改文案 */
function onDuplicateCurrentItem(): void {
  const item = selectedItem.value
  if (item) {
    onDuplicateItem(item.clientKey)
  }
}

/** 预览：打开内嵌手机实时预览（含未保存的修改） */
const previewOpen = ref(false)

function onPreview(): void {
  previewOpen.value = true
}

/** 关闭预览并把焦点还给触发按钮（H5；小程序端无 DOM 焦点概念） */
function closePreview(): void {
  previewOpen.value = false
  // #ifdef H5
  nextTick(() => {
    document.getElementById('design-preview-btn')?.focus()
  })
  // #endif
}

/**
 * 内嵌预览里的「在新页面打开已保存版本」
 *
 * 打开的是**预览模式**（`formType=preview`）：只读、不可填写、不产生提交记录，
 * 页面里带二维码，方便业务方扫码换到手机上核对真实版式。
 *
 * 只有保存过（有 activity_no）才能打开；有未保存修改时先确认 ——
 * 新页面里看到的是已保存的版本。
 */
async function onOpenLive(): Promise<void> {
  const activityNo = String(doc.value.activity.activityNo ?? '')
  if (!activityNo) {
    toast('保存后可预览')
    return
  }
  if (dirty.value) {
    const confirmed = await confirmDialog('当前有未保存的修改，打开的是已保存的版本。继续吗？')
    if (!confirmed) {
      return
    }
  }
  closePreview()
  uni.navigateTo({
    url: answerUrl(activityNo, {
      formType: 'preview',
      status: String(doc.value.activity.status ?? ''),
    }),
  })
}

/** 发布 = 保存并把状态置为「进行中」（服务端不会自动改状态，必须显式写） */
async function onPublish(): Promise<void> {
  if (saving.value) {
    return
  }
  if (doc.value.activity.status !== '进行中') {
    onActivityPatch({ status: '进行中' })
  }
  await onSave()
}

/** 返回列表：有未保存改动时先确认（防止误触丢掉整份编辑） */
async function onBack(): Promise<void> {
  if (dirty.value) {
    const confirmed = await confirmDialog('有未保存的修改，确定离开吗？')
    if (!confirmed) {
      return
    }
  }
  onBackToList()
}

/**
 * 刷新 / 关闭标签页时拦截未保存改动
 *
 * 顶栏返回（`onBack`）已有确认，但浏览器刷新、点关闭、Ctrl+W 这些路径完全绕过它：
 * 编辑器一次编辑动辄十几分钟，误触刷新等于整份丢失。H5 用 `beforeunload` 兜住。
 *
 * 小程序没有刷新语义（页面由微信托管，`onUnload` 也无法取消），这里不涉及；
 * 极端的「编辑到一半被系统回收」目前没有本机草稿兜底，属于已知缺口。
 */
/* #ifdef H5 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dirty.value) {
    return
  }
  // 现代浏览器忽略自定义文案，但必须 preventDefault + 设置 returnValue 才会弹原生确认框
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
/* #endif */

/**
 * 题纲分片渲染
 *
 * 上百道题全部渲染时，左栏每行约 20 个节点，DOM 会涨到两千上下（小程序首屏明显掉帧）。
 * 这里只渲染**前缀**（首屏 20 条，每次追加 20 条）：
 * - 前缀的下标与原数组一致，所以拖拽落点（按 `index × 行高` 反算）、选中态、
 *   上下移 / 删除全部沿用原下标，不需要「窗口偏移」换算；
 * - 触底自动追加，也可以点列表末尾的「加载更多」；
 * - 选中项（画布点选、校验定位、新增题目）若还没渲染，先展开到它再滚动定位。
 *
 * 刻意不做虚拟滚动：题纲行高固定但拖拽落点依赖「行连续渲染」，未经真机验证的
 * 虚拟滚动会把拖拽一起弄坏，收益也只是再省几十个节点。
 */
const {
  renderedCount: outlineRenderedCount,
  hasMore: outlineHasMore,
  remaining: outlineRemaining,
  loadMore: loadMoreOutline,
  ensureVisible: ensureOutlineVisible,
} = useChunkedList({ total: () => doc.value.items.length })

/** 只渲染前缀：`slice` 不改变下标语义 */
const outlineItems = computed(() => doc.value.items.slice(0, outlineRenderedCount.value))

/** 题纲滚动位置（受控值；只在需要定位时改，不在滚动事件里逐帧同步） */
const outlineScrollTop = ref(0)

/** 用户当前真实滚动位置（普通变量：逐帧同步到 ref 会让整页每帧重渲染） */
let lastOutlineScrollTop = 0

function onOutlineScroll(event: unknown): void {
  const top = (event as { detail?: { scrollTop?: number } })?.detail?.scrollTop
  if (typeof top === 'number' && Number.isFinite(top)) {
    lastOutlineScrollTop = top
  }
}

/** 触底自动追加一屏（与「加载更多」按钮共用同一个入口） */
function onOutlineReachBottom(): void {
  loadMoreOutline()
}

/**
 * 把某一行滚进视野
 *
 * `scroll-top` 是受控属性，**值不变就不会触发滚动**；而「用户手动滚走后再选中同一行」
 * 时受控值恰好还停在上次的目标上。所以先把受控值设成用户当前位置（一般与目标不同，
 * 若相同也不会产生视觉变化），下一帧再设到目标 —— 两次赋值保证一定有一次变化。
 */
function scrollOutlineTo(index: number): void {
  const target = Math.max(0, index * ITEM_ROW_HEIGHT - ITEM_ROW_HEIGHT * 2)
  outlineScrollTop.value = lastOutlineScrollTop
  void nextTick(() => {
    outlineScrollTop.value = target
  })
}

/** 题纲里点选：不滚动（这一行本来就在眼前，跳一下反而丢上下文） */
let selectingFromOutline = false

function selectItemFromOutline(clientKey: string): void {
  // 只有「换成另一题」才会触发下面的 watch；点已选中的行不会，别把标记留在 true
  selectingFromOutline = clientKey !== selectedKey.value
  selectItem(clientKey)
}

/**
 * 选中变化 → 保证这一行已渲染并滚进视野
 *
 * 来自题纲的点击跳过滚动；来自画布、校验定位（composable 直接改 selectedKey）、
 * 新增题目（自动选中新题）都需要定位 —— 否则左栏看不到选中项。
 */
watch(selectedKey, (key) => {
  const fromOutline = selectingFromOutline
  selectingFromOutline = false
  if (!key || fromOutline) {
    return
  }
  const index = doc.value.items.findIndex(item => item.clientKey === key)
  if (index < 0) {
    return
  }
  ensureOutlineVisible(index)
  scrollOutlineTo(index)
})

/** 拖拽落点超出已渲染范围时先展开：落点行必须可见，否则「拖到哪」无从判断 */
watch(itemOverIndex, (index) => {
  if (index >= 0) {
    ensureOutlineVisible(index)
  }
})

/**
 * 落点插在目标行的上边还是下边
 *
 * `moveItem(from, to)` 的语义是「把第 from 行挪到第 to 行」：
 * 往下拖时它落在目标行**之后**，往上拖时落在目标行**之前**。
 * 插入线画错边，落点就与实际落位差一整行 —— 所以这里按方向算，不猜。
 */
const itemDropPosition = computed<'before' | 'after' | undefined>(() => {
  if (!itemDragging.value || itemOverIndex.value < 0 || itemFromIndex.value === itemOverIndex.value) {
    return undefined
  }
  return itemFromIndex.value < itemOverIndex.value ? 'after' : 'before'
})
</script>

<template>
  <view class="design">
    <!-- ── 顶栏：返回 / 可编辑标题 / 保存状态 / 预览 / 保存 / 发布 ── -->
    <view class="design__top">
      <view
        class="design__back"
        role="button"
        tabindex="0"
        aria-label="返回问卷列表"
        @click="onBack"
        @keydown.enter.prevent="onBack"
      >
        <view class="design__back-arrow" aria-hidden="true" />
      </view>

      <view class="design__top-div" aria-hidden="true" />

      <input
        class="design__name"
        type="text"
        :value="doc.activity.title"
        aria-label="问卷标题"
        :placeholder="loading ? '加载中…' : '未命名问卷'"
        @input="onTitleInput"
      >

      <view v-if="!loadError" class="design__state" :class="{ 'design__state--dirty': saveStateDirty }">
        <view class="design__state-dot" aria-hidden="true" />
        <text>{{ saveStateText }}</text>
      </view>

      <view class="design__top-spacer" />

      <view v-if="!loadError" class="design__top-actions">
        <view
          v-if="dirty"
          class="design__topbtn"
          role="button"
          tabindex="0"
          aria-label="放弃未保存的修改"
          @click="onDiscard"
          @keydown.enter.prevent="onDiscard"
        >
          <text class="design__topbtn-text">放弃</text>
        </view>
        <view
          id="design-preview-btn"
          class="design__topbtn design__topbtn--preview"
          role="button"
          tabindex="0"
          aria-label="实时预览问卷"
          @click="onPreview"
          @keydown.enter.prevent="onPreview"
        >
          <view class="design__eye" aria-hidden="true" />
          <text class="design__topbtn-text">预览</text>
        </view>
        <BxButton
          type="secondary"
          size="small"
          aria-label="保存问卷"
          :loading="saving"
          @click="onSave"
        >
          保存
        </BxButton>
        <BxButton
          type="primary"
          size="small"
          aria-label="发布问卷"
          @click="onPublish"
        >
          发布
        </BxButton>
      </view>
    </view>

    <!-- 网络状态条：内容区顶部（不遮顶栏），离线 / 弱网时出现 -->
    <BxNetworkBar />

    <view v-if="loadError" class="design__error">
      <text class="design__error-text">{{ loadError }}</text>
      <view
        class="design__error-btn"
        role="button"
        tabindex="0"
        aria-label="返回问卷列表"
        @click="onBack"
        @keydown.enter.prevent="onBack"
      >
        <text class="design__error-btn-text">返回列表</text>
      </view>
    </view>

    <view v-else class="design__body">
      <!-- ── 左：题纲 ── -->
      <view class="design__pane design__pane--outline">
        <view class="design__outline-head">
          <text class="design__outline-label">题目</text>
          <text class="design__outline-count">{{ doc.items.length }}</text>
        </view>

        <scroll-view
          class="design__outline-scroll"
          scroll-y
          :scroll-top="outlineScrollTop"
          :scroll-with-animation="true"
          :lower-threshold="160"
          @scroll="onOutlineScroll"
          @scrolltolower="onOutlineReachBottom"
        >
          <view v-if="loading" class="design__loading">
            <text class="design__loading-text">加载中…</text>
          </view>

          <!--
            只渲染前缀（首屏 20 条）：下标与原数组一致，
            拖拽落点 / 选中 / 上下移都直接用原下标，不需要窗口偏移换算。
          -->
          <EditorItemRow
            v-for="(item, index) in outlineItems"
            :key="item.clientKey"
            :item="item"
            :index="index"
            :total="doc.items.length"
            :selected="item.clientKey === selectedKey"
            :dragging="itemDragging && itemFromIndex === index"
            :drop-target="itemDragging && itemOverIndex === index"
            :drop-position="itemDropPosition"
            :has-issues="onItemIssues(item.clientKey).length > 0"
            @select="selectItemFromOutline(item.clientKey)"
            @remove="onRemoveItem(item.clientKey)"
            @move-up="moveItem(index, index - 1)"
            @move-down="moveItem(index, index + 1)"
            @drag-start="event => beginItemDrag(index, event)"
          />

          <!-- 分片追加：滚动到底会自动追加，这里再给一个明确的点击入口 -->
          <view
            v-if="outlineHasMore"
            class="design__outline-more"
            role="button"
            tabindex="0"
            aria-label="加载更多题目"
            @click="loadMoreOutline"
            @keydown.enter.prevent="loadMoreOutline"
          >
            <text class="design__outline-more-text">加载更多（还有 {{ outlineRemaining }} 题）</text>
          </view>

          <BxEmpty
            v-if="loaded && doc.items.length === 0"
            text="还没有题目"
            tip="点下方「添加题目」开始设计"
          />
        </scroll-view>

        <!-- 添加题目：题型面板就地展开在题纲下方（不弹全屏层，选择题型就能看到题目被加进来） -->
        <view v-if="addingType" class="design__type-panel">
          <EditorTypePicker @select="onPickType" @close="addingType = false" />
        </view>

        <view class="design__outline-foot">
          <view
            class="design__add-btn"
            role="button"
            tabindex="0"
            aria-label="添加题目"
            @click="addingType = !addingType"
            @keydown.enter.prevent="addingType = !addingType"
          >
            <view class="design__plus" aria-hidden="true" />
            <text class="design__add-text">添加题目</text>
          </view>
          <view
            class="design__survey-btn"
            :class="{ 'design__survey-btn--on': panelMode === 'info' }"
            role="button"
            tabindex="0"
            aria-label="问卷信息"
            @click="selectSurvey"
            @keydown.enter.prevent="selectSurvey"
          >
            <view class="design__pencil" aria-hidden="true" />
            <text class="design__add-text">问卷信息</text>
          </view>
        </view>
      </view>

      <!-- ── 中：画布（≥1024 才与其它两栏并排） ── -->
      <view class="design__pane design__pane--canvas">
        <scroll-view class="design__canvas-scroll" scroll-y>
          <view class="design__canvas">
            <EditorCanvas
              :items="doc.items"
              :activity="doc.activity"
              :selected-key="selectedKey"
              @select="selectItem"
              @select-activity="selectSurvey"
            />
          </view>
        </scroll-view>
      </view>

      <!-- ── 右：属性面板（窄屏时是全屏浮层） ── -->
      <view
        class="design__pane design__pane--props"
        :class="{ 'design__pane--open': panelVisible }"
      >
        <view class="design__props-head">
          <view
            class="design__panel-close"
            role="button"
            tabindex="0"
            aria-label="返回题目列表"
            @click="closePanel"
            @keydown.enter.prevent="closePanel"
          >
            <text class="design__panel-close-text">← 返回</text>
          </view>
          <text class="design__props-title">
            {{ panelMode === 'item' ? '题目属性' : '问卷信息' }}
          </text>
          <text class="design__props-index">
            {{ panelMode === 'item' ? `第 ${selectedIndex + 1} / ${doc.items.length} 题` : (doc.activity.activityNo || '未编号') }}
          </text>
        </view>

        <scroll-view class="design__props-scroll" scroll-y>
          <EditorItemPanel
            v-if="selectedItem"
            v-show="panelMode === 'item'"
            :item="selectedItem"
            :issues="onItemIssues(selectedItem.clientKey)"
            @patch="onItemPatch"
            @attr-patch="onItemAttrPatch"
            @change-type="onChangeType"
            @remove="onRemoveCurrentItem"
            @duplicate="onDuplicateCurrentItem"
            @option-add="onOptionAdd"
            @option-replace-all="onOptionReplaceAll"
            @option-remove="onOptionRemove"
            @option-move-up="onOptionMoveUp"
            @option-move-down="onOptionMoveDown"
            @option-drag-drop="onOptionDragDrop"
            @option-update-value="onOptionUpdateValue"
            @option-update-answer="onOptionUpdateAnswer"
            @option-update-points="onOptionUpdatePoints"
          />

          <view v-show="panelMode === 'info'" class="design__info">
            <EditorActivityForm
              :activity="doc.activity"
              :issues="issues"
              @patch="onActivityPatch"
            />
            <text v-if="saveError" class="design__save-error">{{ saveError }}</text>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 题目拖拽浮层：覆盖整页，指针移到列表外也能接住 -->
    <view
      v-if="itemDragging"
      class="design__drag-layer"
      @touchmove.stop.prevent="onItemDragMove"
      @touchend="onItemDragEnd"
      @touchcancel="onItemDragCancel"
      @mousemove="onItemDragMove"
      @mouseup="onItemDragEnd"
    />

    <!-- 手机实时预览：显示当前草稿（含未保存修改），不提交、不校验 -->
    <DesignerPreview
      v-if="previewOpen"
      :title="doc.activity.title"
      :summary="doc.activity.summary"
      :intro="doc.activity.startRemark"
      :items="doc.items"
      :submit-label="doc.activity.submitLabel"
      :status="doc.activity.status"
      :end-time="doc.activity.endTime"
      :can-open-live="!!doc.activity.activityNo"
      @close="closePreview"
      @open-live="onOpenLive"
    />
  </view>
</template>

<style lang="scss" scoped>
.design {
  display: flex;
  flex-direction: column;
  /* 固定视口高度：各栏才能各自内部滚动（scroll-view 需要确定的高度） */
  height: 100vh;
  background-color: var(--bx-bg);
}

/* ── 顶栏：48 + 状态栏，白底 1px 下沿 ── */

.design__top {
  position: sticky;
  top: 0;
  z-index: var(--bx-z-sticky);
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: calc(var(--bx-navbar-height) + var(--status-bar-height, 0px));
  padding: var(--status-bar-height, 0px) 20px 0;
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line);
}

.design__back {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .design__back:hover {
    background-color: var(--bx-surface-2);
  }
}

.design__back:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

/* 返回箭头：两条边框旋转 45°（不用 ‹ 文字符号） */
.design__back-arrow {
  width: 8px;
  height: 8px;
  border-bottom: 1.5px solid var(--bx-text-2);
  border-left: 1.5px solid var(--bx-text-2);
  transform: rotate(45deg);
}

.design__top-div {
  flex: none;
  width: 1px;
  height: 16px;
  background-color: var(--bx-line);
}

/*
 * 可编辑标题
 *
 * 平时是「无框标题」，悬停出现淡底、聚焦出现主色描边 + 柔光环 ——
 * 与原型 `.adm-nameinput` 同一套：看不出是输入框，但点进去就知道能改。
 */
.design__name {
  flex: 1;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 360px;
  height: 30px;
  padding: 0 8px;
  color: var(--bx-text);
  font-size: 13px;
  font-weight: 500;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: var(--bx-radius-xs);
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    box-shadow var(--bx-duration-base) var(--bx-ease-out);
}

.design__name::placeholder {
  color: var(--bx-text-4);
  font-weight: 400;
}

@media (hover: hover) {
  .design__name:hover {
    background-color: var(--bx-surface-2);
    border-color: var(--bx-line);
  }
}

.design__name:focus-within {
  background-color: var(--bx-surface);
  border-color: var(--bx-primary);
  box-shadow: var(--bx-focus-glow);
}

/*
 * 焦点可见性：uni-app 内置样式把 outline 设成 none，键盘用户看不到焦点在哪。
 * 选择器要落到内层原生 input（`uni-input-input`），外层的 `uni-input`
 * 永远不会获得 :focus-visible —— 与 BxTextField 里那条规则同一原因。
 */
:deep(.design__name .uni-input-input:focus-visible) {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

/* 保存状态：一颗 6px 圆点 + 一句话（已保存 ok / 未保存 warn） */
.design__state {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  color: var(--bx-text-3);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.design__state-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--bx-success);
}

.design__state--dirty {
  color: var(--bx-warn);
}

.design__state--dirty .design__state-dot {
  background-color: var(--bx-warn);
}

.design__top-spacer {
  flex: 1;
  min-width: 8px;
}

.design__top-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

/* 顶栏里的静默文字按钮（放弃 / 预览） */
.design__topbtn {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 8px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
  transition: background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .design__topbtn:hover {
    background-color: var(--bx-surface-2);
  }
}

.design__topbtn:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.design__topbtn-text {
  color: var(--bx-text-2);
  font-size: 12px;
  white-space: nowrap;
}

/* 预览图标：一个椭圆 + 中间一个点（纯 CSS） */
.design__eye {
  box-sizing: border-box;
  width: 14px;
  height: 9px;
  border: 1.5px solid var(--bx-text-3);
  border-radius: 50%;
}

.design__eye::after {
  content: '';
  display: block;
  width: 3px;
  height: 3px;
  margin: 1.5px auto 0;
  border-radius: 50%;
  background-color: var(--bx-text-3);
}

/* ── 主体 ── */

.design__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.design__pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

/* 左：题纲 280 */
.design__pane--outline {
  flex: 1;
  background-color: var(--bx-surface);
}

.design__outline-head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 20px 8px;
}

.design__outline-label {
  color: var(--bx-text-3);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  letter-spacing: 0.06em;
}

.design__outline-count {
  color: var(--bx-text-3);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.design__outline-scroll {
  flex: 1;
  height: 100%;
  min-height: 0;
}

.design__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.design__loading-text {
  color: var(--bx-text-3);
  font-size: 12px;
}

/* 题纲分片：列表末尾的「加载更多」（滚动到底也会自动追加） */
.design__outline-more {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  margin: 8px;
  border: 1px dashed var(--bx-line-strong);
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    border-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .design__outline-more:hover {
    background-color: var(--bx-surface-2);
    border-color: var(--bx-primary-line);
  }
}

.design__outline-more:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.design__outline-more-text {
  color: var(--bx-text-3);
  font-size: 12px;
  line-height: 18px;
}

/* 题型面板：就地展开在题纲下方 */
.design__type-panel {
  flex: none;
  padding: 12px;
  background-color: var(--bx-surface);
  border-top: 1px solid var(--bx-line);
}

/* 左栏底部：添加题目（虚线框）+ 问卷信息（静默项） */
.design__outline-foot {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border-top: 1px solid var(--bx-line);
}

.design__add-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 34px;
  padding: 0 12px;
  border: 1px dashed var(--bx-line-strong);
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition:
    border-color var(--bx-duration-fast) var(--bx-ease-out),
    background-color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .design__add-btn:hover {
    background-color: var(--bx-primary-soft);
    border-color: var(--bx-primary-line);
  }
}

.design__add-btn:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.design__add-text {
  color: var(--bx-text-2);
  font-size: 12px;
  line-height: 1;
}

@media (hover: hover) {
  .design__add-btn:hover .design__add-text {
    color: var(--bx-primary);
  }
}

/* 添加题目 / 问卷信息 的图标：加号与铅笔都用两条线画 */
.design__plus,
.design__pencil {
  position: relative;
  flex: none;
  width: 10px;
  height: 10px;
}

.design__plus::before,
.design__plus::after,
.design__pencil::before,
.design__pencil::after {
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

.design__plus::after {
  transform: rotate(90deg);
}

/* 铅笔：一条斜线 + 一条短斜线（笔尖） */
.design__pencil::before {
  transform: rotate(-45deg);
}

.design__pencil::after {
  width: 4px;
  left: 8px;
  transform: rotate(-45deg);
}

.design__survey-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
  transition:
    background-color var(--bx-duration-fast) var(--bx-ease-out),
    color var(--bx-duration-fast) var(--bx-ease-out);
}

@media (hover: hover) {
  .design__survey-btn:hover {
    background-color: var(--bx-surface-2);
  }
}

.design__survey-btn:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

/* 当前右栏就是「问卷信息」时，这一项保持选中态 */
.design__survey-btn--on {
  background-color: var(--bx-primary-soft);
}

.design__survey-btn--on .design__add-text {
  color: var(--bx-primary);
}

.design__survey-btn--on .design__pencil::before,
.design__survey-btn--on .design__pencil::after {
  background-color: var(--bx-primary);
}

/* 中：画布 */
.design__pane--canvas {
  display: none;
  background-color: var(--bx-bg);
}

.design__canvas-scroll {
  flex: 1;
  height: 100%;
  min-height: 0;
}

.design__canvas {
  padding: 24px 24px 40px;
}

/* 右：属性面板 */
.design__pane--props {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--bx-z-fixed);
  display: none;
  background-color: var(--bx-surface);
}

.design__pane--open {
  display: flex;
}

.design__props-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  min-height: 48px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--bx-line-2);
}

/* 窄屏浮层里的返回键；宽屏（两栏并排）不显示 */
.design__panel-close {
  display: flex;
  flex: none;
  align-items: center;
  height: 28px;
  padding: 0 4px;
  border-radius: var(--bx-radius-xs);
  cursor: pointer;
}

.design__panel-close:focus-visible {
  outline: 2px solid var(--bx-primary);
  outline-offset: 1px;
}

.design__panel-close-text {
  color: var(--bx-primary);
  font-size: 12px;
}

.design__props-title {
  color: var(--bx-text);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.design__props-index {
  margin-left: auto;
  color: var(--bx-text-3);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.design__props-scroll {
  flex: 1;
  height: 100%;
  min-height: 0;
}

.design__info {
  display: flex;
  flex-direction: column;
}

.design__save-error {
  display: block;
  padding: 0 20px 20px;
  color: var(--bx-danger);
  font-size: 12px;
  line-height: 18px;
}

/* ── 错误页 ── */

.design__error {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.design__error-text {
  color: var(--bx-danger);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}

.design__error-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  margin-top: 14px;
  padding: 0 14px;
  border: 1px solid var(--bx-primary-line);
  border-radius: var(--bx-radius-sm);
  cursor: pointer;
}

.design__error-btn-text {
  color: var(--bx-primary);
  font-size: 12px;
}

/* 拖拽时整页蒙一层极浅的靛蓝（6%），告诉用户「现在是在拖」 */
.design__drag-layer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--bx-z-overlay);
  background-color: var(--bx-glow);
}

/* ── 中屏（≥900）：题纲 + 属性并排，画布收起 ── */
@media (min-width: 900px) {
  .design__pane--outline {
    flex: 1;
    min-width: 280px;
    border-right: 1px solid var(--bx-line);
  }

  .design__pane--props {
    position: static;
    z-index: auto;
    display: flex;
    flex: 0 0 320px;
    max-width: 320px;
    border-left: 1px solid var(--bx-line);
  }

  .design__panel-close {
    display: none;
  }

  .design__props-head {
    padding-left: 20px;
    padding-right: 20px;
  }
}

/* ── 宽屏（≥1024）：三栏，中间是纸面（题纲回到 280，把宽度让给画布） ── */
@media (min-width: 1024px) {
  .design__pane--outline {
    flex: 0 0 280px;
    max-width: 280px;
  }

  .design__pane--canvas {
    display: flex;
    flex: 1;
    min-width: 0;
  }
}

/* ── 窄屏（<900）：顶栏收紧，属性栏是浮层 ── */
@media (max-width: 899px) {
  .design__top {
    padding-left: 10px;
    padding-right: 10px;
    gap: 4px;
  }

  .design__top-div {
    display: none;
  }

  .design__props-title {
    font-size: 13px;
  }
}

@media (max-width: 759px) {
  /*
   * 手机：预览入口让位给「保存 / 发布」，但**保存状态只收文字、保留圆点** ——
   * 改完不知道存没存上，比少一个预览入口严重得多。
   */
  .design__state-text {
    display: none;
  }

  .design__topbtn--preview {
    display: none;
  }

  .design__topbtn {
    padding: 0 6px;
  }

  .design__name {
    font-size: 12px;
  }

  .design__props-index {
    display: none;
  }
}
</style>
