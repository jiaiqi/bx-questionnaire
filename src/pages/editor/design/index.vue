<script setup lang="ts">
/**
 * 可视化问卷设计器
 *
 * ## 布局：宽屏分栏，窄屏单栏 + 全屏浮层
 *
 * 宽度用 `@media` 判断（微信小程序 WXSS 支持媒体查询），**不用 JS 监听 resize**：
 * JS 方案要在 `onResize` 里维护一个宽度状态，初值、旋转屏、小程序 PC 端窗口拉伸
 * 三种情况都得各自处理，而 CSS 一次就够。于是：
 *
 * - 宽屏（≥900px）：左栏「问卷信息 + 题目列表」、右栏「题目设置」并排；
 * - 窄屏：左栏用顶部标签在「问卷信息 / 题目」间切换，点题目时右栏变成**全屏浮层**。
 *
 * 这样 PC 与手机各用各的顺手形态，且两端共用同一份模板与逻辑
 * （不是两套页面，不会出现「PC 上修好了、手机上还是旧的」）。
 *
 * ## 拖拽排序
 *
 * 题目列表的拖拽浮层覆盖整页（拖到列表外也能接住指针），
 * 落点由 `usePointerReorder` 按**相对位移**算出，不查询 DOM。
 * 选项列表在题目面板内部，用自己的一层浮层（见 `EditorOptionEditor`）。
 *
 * ## 保存
 *
 * 校验失败时**留在本页并跳到第一个出问题的位置**（题目问题 → 选中那道题；
 * 活动问题 → 切回「问卷信息」标签）。只弹一个 toast 的话，用户知道有错却不知道改哪。
 */

import type { EditorActivity, EditorIssue, EditorItem } from '@/domain/editor'

import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'

import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import { ITEM_ROW_HEIGHT } from '@/components/editor/constants'
import EditorActivityForm from '@/components/editor/EditorActivityForm.vue'
import EditorItemPanel from '@/components/editor/EditorItemPanel.vue'
import EditorItemRow from '@/components/editor/EditorItemRow.vue'
import EditorTypePicker from '@/components/editor/EditorTypePicker.vue'
import { useEditorDocument } from '@/composables/useEditorDocument'
import { usePointerReorder } from '@/composables/usePointerReorder'
import {
  describeIssues,
  editorDesignUrl,
  editorListUrl,
  planSummary,
} from '@/domain/editor'
import { EditorValidationError } from '@/domain/editor/validation'
import { readQuery } from '@/utils/query'
import { BxError } from '@/utils/request'
import { confirmDialog, toast } from '@/utils/ui'

const {
  doc,
  loading,
  saving,
  loaded,
  loadError,
  saveError,
  issues,
  plan,
  dirty,
  isNew,
  load,
  save,
  discard,
  itemIssues,
  findItem,
  patchActivity,
  patchItem,
  patchItemAttr,
  addItem,
  removeItem,
  moveItem,
  changeItemType,
  addOption,
  removeOption,
  moveOption,
  setOptionValue,
  setOptionPoints,
  setOptionAnswer,
} = useEditorDocument()

/** 本次保存会做哪些操作的数量，用于「会删几道题」的二次确认 */
const planCounts = computed(() => planSummary(plan.value))

/** 当前选中的题目（`clientKey`）；空串表示未选中 */
const selectedKey = ref('')
/** 窄屏下的标签页；宽屏由 CSS 强制两个区都显示 */
const activeTab = ref<'info' | 'items'>('items')
/** 是否展开「添加题目」的题型面板 */
const addingType = ref(false)

const selectedIndex = computed(() =>
  doc.value.items.findIndex(item => item.clientKey === selectedKey.value),
)
const selectedItem = computed<EditorItem | undefined>(() =>
  selectedIndex.value >= 0 ? doc.value.items[selectedIndex.value] : undefined,
)

const navTitle = computed(() => (isNew.value ? '新建问卷' : '问卷设计'))

const {
  dragging: itemDragging,
  fromIndex: itemFromIndex,
  overIndex: itemOverIndex,
  begin: beginItemDrag,
  onMove: onItemDragMove,
  onEnd: onItemDragEnd,
  onCancel: onItemDragCancel,
} = usePointerReorder({
  rowHeight: ITEM_ROW_HEIGHT,
  count: () => doc.value.items.length,
  onDrop: (from, to) => moveItem(from, to),
})

onLoad((query) => {
  const activityNo = readQuery(query, 'activity_no')
  if (activityNo) {
    void load(activityNo)
  }
  // 新建：初始文档（含默认有效期）由 composable 提供，页面不再自己填，
  // 否则「默认值」会被当成一次真实改动，一打开就显示「放弃」
})

// ── 活动字段 ──

/** 一律走 composable：它负责置「动过」标记，直接改文档会让 `dirty` 失真 */
function onActivityPatch(patch: Partial<EditorActivity>): void {
  patchActivity(patch)
}

// ── 题目字段 ──

function onItemPatch(patch: Partial<EditorItem>): void {
  if (selectedKey.value) {
    patchItem(selectedKey.value, patch)
  }
}

function onItemAttrPatch(patch: Record<string, unknown>): void {
  if (selectedKey.value) {
    patchItemAttr(selectedKey.value, patch)
  }
}

function onItemIssues(clientKey: string): EditorIssue[] {
  return itemIssues(clientKey)
}

// ── 题目增删改与排序 ──

function onPickType(type: string): void {
  addingType.value = false
  const item = addItem(type)
  if (!item) {
    toast(`暂不支持题型「${type}」`)
    return
  }
  selectedKey.value = item.clientKey
  activeTab.value = 'items'
}

async function onRemoveItem(clientKey: string): Promise<void> {
  const item = findItem(clientKey)
  if (!item) {
    return
  }
  const label = item.title.trim() || '这道题'
  // 已存在的题目会在保存时被真删，必须说清楚；新增但未保存的只是本地移除
  const consequence = item.itemNo
    ? '保存后服务端的这道题与它的选项都会被删除。'
    : '这道题还没保存，删除后不会影响服务端。'
  const confirmed = await confirmDialog(`确定删除「${label}」吗？${consequence}`)
  if (!confirmed) {
    return
  }
  removeItem(clientKey)
  if (selectedKey.value === clientKey) {
    selectedKey.value = ''
  }
}

function onSelectItem(clientKey: string): void {
  selectedKey.value = clientKey
}

function onClosePanel(): void {
  selectedKey.value = ''
}

function onChangeType(type: string): void {
  const item = selectedItem.value
  if (item) {
    changeItemType(item.clientKey, type)
  }
}

function onBackToList(): void {
  uni.redirectTo({ url: editorListUrl() })
}

// ── 选项 ──

function onOptionAdd(): void {
  const item = selectedItem.value
  if (item) {
    addOption(item.clientKey)
  }
}

function onOptionRemove(index: number): void {
  const item = selectedItem.value
  const optionKey = item?.options[index]?.clientKey
  if (item && optionKey) {
    removeOption(item.clientKey, optionKey)
  }
}

function onOptionMoveUp(index: number): void {
  const item = selectedItem.value
  if (item) {
    moveOption(item.clientKey, index, index - 1)
  }
}

function onOptionMoveDown(index: number): void {
  const item = selectedItem.value
  if (item) {
    moveOption(item.clientKey, index, index + 1)
  }
}

function onOptionDragDrop(from: number, to: number): void {
  const item = selectedItem.value
  if (item) {
    moveOption(item.clientKey, from, to)
  }
}

function onOptionUpdateValue(index: number, value: string): void {
  if (selectedKey.value) {
    setOptionValue(selectedKey.value, index, value)
  }
}

function onOptionUpdateAnswer(index: number, isAnswer: boolean): void {
  // 交给 composable：单选形态下要互斥（勾一个顶掉其它），逻辑不能散在页面里
  if (selectedKey.value) {
    setOptionAnswer(selectedKey.value, index, isAnswer)
  }
}

function onOptionUpdatePoints(index: number, points: number): void {
  if (selectedKey.value) {
    setOptionPoints(selectedKey.value, index, points)
  }
}

// ── 保存 ──

/** 把用户送到第一个出问题的位置 */
function focusFirstIssue(list: EditorIssue[]): void {
  const first = list[0]
  if (!first) {
    return
  }
  if (first.itemKey) {
    activeTab.value = 'items'
    selectedKey.value = first.itemKey
    return
  }
  activeTab.value = 'info'
}

async function onSave(): Promise<void> {
  if (saving.value) {
    return
  }

  // 删除是不可恢复的，先让用户看清这次要删多少
  const counts = planCounts.value
  if (counts.itemDelete > 0 || counts.optionDelete > 0) {
    const confirmed = await confirmDialog(
      `本次保存会删除 ${counts.itemDelete} 道题、${counts.optionDelete} 个选项，删除后无法恢复。确定继续吗？`,
    )
    if (!confirmed) {
      return
    }
  }

  const wasNew = isNew.value
  try {
    const activityNo = await save()
    toast('已保存', 'success')
    if (wasNew && activityNo) {
      // 新建成功后换成「编辑已有问卷」的地址：不换的话刷新页面会回到空白新建页，
      // 用户可能再建一份重复问卷
      uni.redirectTo({ url: editorDesignUrl(activityNo) })
    }
  }
  catch (error) {
    if (error instanceof EditorValidationError) {
      toast(describeIssues(error.issues))
      focusFirstIssue(error.issues)
      return
    }
    toast(error instanceof BxError ? error.message : '保存失败，请稍后重试')
  }
}

async function onDiscard(): Promise<void> {
  const confirmed = await confirmDialog('放弃未保存的修改吗？')
  if (confirmed) {
    discard()
    toast('已放弃修改')
  }
}
</script>

<template>
  <view class="design">
    <BxNavBar :title="navTitle" :fallback-url="editorListUrl()">
      <template #extra>
        <view class="design__nav-actions">
          <view
            v-if="dirty"
            class="design__nav-btn"
            role="button"
            tabindex="0"
            aria-label="放弃修改"
            @click="onDiscard"
            @keydown.enter.prevent="onDiscard"
          >
            <text class="design__nav-btn-text">放弃</text>
          </view>
          <view
            class="design__nav-save"
            :class="{ 'design__nav-save--off': saving }"
            role="button"
            tabindex="0"
            aria-label="保存问卷"
            @click="onSave"
            @keydown.enter.prevent="onSave"
          >
            <text class="design__nav-save-text">{{ saving ? '保存中…' : '保存' }}</text>
          </view>
        </view>
      </template>
    </BxNavBar>

    <view v-if="loadError" class="design__error">
      <text class="design__error-text">{{ loadError }}</text>
      <view
        class="design__error-btn"
        role="button"
        tabindex="0"
        aria-label="返回问卷列表"
        @click="onBackToList"
        @keydown.enter.prevent="onBackToList"
      >
        <text class="design__error-btn-text">返回列表</text>
      </view>
    </view>

    <view v-else class="design__body">
      <!-- ── 左栏：问卷信息 + 题目列表 ── -->
      <view class="design__pane design__pane--left">
        <view class="design__tabs">
          <view
            class="design__tab"
            :class="{ 'design__tab--on': activeTab === 'info' }"
            role="button"
            tabindex="0"
            aria-label="问卷信息"
            @click="activeTab = 'info'"
            @keydown.enter.prevent="activeTab = 'info'"
          >
            <text class="design__tab-text">问卷信息</text>
          </view>
          <view
            class="design__tab"
            :class="{ 'design__tab--on': activeTab === 'items' }"
            role="button"
            tabindex="0"
            aria-label="题目"
            @click="activeTab = 'items'"
            @keydown.enter.prevent="activeTab = 'items'"
          >
            <text class="design__tab-text">题目（{{ doc.items.length }}）</text>
          </view>
        </view>

        <view class="design__section" :class="{ 'design__section--hidden': activeTab !== 'info' }">
          <scroll-view class="design__scroll" scroll-y>
            <EditorActivityForm
              :activity="doc.activity"
              :issues="issues"
              @patch="onActivityPatch"
            />
            <text v-if="saveError" class="design__save-error">{{ saveError }}</text>
          </scroll-view>
        </view>

        <view class="design__section" :class="{ 'design__section--hidden': activeTab !== 'items' }">
          <view class="design__section-head">
            <text class="design__section-title">题目（{{ doc.items.length }}）</text>
            <view
              class="design__add"
              role="button"
              tabindex="0"
              aria-label="添加题目"
              @click="addingType = !addingType"
              @keydown.enter.prevent="addingType = !addingType"
            >
              <text class="design__add-text">＋ 添加题目</text>
            </view>
          </view>

          <view v-if="addingType" class="design__type-panel">
            <EditorTypePicker @select="onPickType" @close="addingType = false" />
          </view>

          <scroll-view class="design__scroll" scroll-y>
            <view class="design__item-list">
              <EditorItemRow
                v-for="(item, index) in doc.items"
                :key="item.clientKey"
                :item="item"
                :index="index"
                :total="doc.items.length"
                :selected="item.clientKey === selectedKey"
                :dragging="itemDragging && itemFromIndex === index"
                :drop-target="itemDragging && itemOverIndex === index"
                :has-issues="onItemIssues(item.clientKey).length > 0"
                @select="onSelectItem(item.clientKey)"
                @remove="onRemoveItem(item.clientKey)"
                @move-up="moveItem(index, index - 1)"
                @move-down="moveItem(index, index + 1)"
                @drag-start="event => beginItemDrag(index, event)"
              />
            </view>

            <BxEmpty
              v-if="loaded && doc.items.length === 0"
              text="还没有题目"
              tip="点上方「＋ 添加题目」开始设计"
            />
            <view v-if="loading" class="design__loading">
              <text class="design__loading-text">加载中…</text>
            </view>
          </scroll-view>
        </view>
      </view>

      <!-- ── 右栏：题目设置（窄屏时是全屏浮层） ── -->
      <view
        class="design__pane design__pane--right"
        :class="{ 'design__pane--open': !!selectedKey }"
      >
        <view class="design__panel-head">
          <view
            class="design__panel-close"
            role="button"
            tabindex="0"
            aria-label="返回题目列表"
            @click="onClosePanel"
            @keydown.enter.prevent="onClosePanel"
          >
            <text class="design__panel-close-text">← 返回</text>
          </view>
          <text class="design__panel-title">
            {{ selectedItem ? `第 ${selectedIndex + 1} 题` : '题目设置' }}
          </text>
        </view>

        <scroll-view class="design__scroll" scroll-y>
          <EditorItemPanel
            v-if="selectedItem"
            :item="selectedItem"
            :index="selectedIndex"
            :issues="onItemIssues(selectedItem.clientKey)"
            @patch="onItemPatch"
            @attr-patch="onItemAttrPatch"
            @change-type="onChangeType"
            @option-add="onOptionAdd"
            @option-remove="onOptionRemove"
            @option-move-up="onOptionMoveUp"
            @option-move-down="onOptionMoveDown"
            @option-drag-drop="onOptionDragDrop"
            @option-update-value="onOptionUpdateValue"
            @option-update-answer="onOptionUpdateAnswer"
            @option-update-points="onOptionUpdatePoints"
          />
          <BxEmpty
            v-else
            text="未选择题目"
            tip="从左侧点一道题开始编辑"
          />
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
  </view>
</template>

<style lang="scss" scoped>
.design {
  display: flex;
  flex-direction: column;
  /* 固定视口高度：两个 pane 才能各自内部滚动（scroll-view 需要确定的高度） */
  height: 100vh;
  background-color: var(--bx-bg);
}

.design__nav-actions {
  display: flex;
  align-items: center;
}

.design__nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  margin-right: 8px;
  padding: 0 10px;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.design__nav-btn-text {
  font-size: 13px;
  color: var(--bx-text-2);
}

.design__nav-save {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 12px;
  background-color: var(--bx-blue);
  border-radius: var(--bx-radius);
}

.design__nav-save--off {
  opacity: 0.6;
}

.design__nav-save-text {
  font-size: 13px;
  color: #ffffff;
}

.design__error {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.design__error-text {
  font-size: 14px;
  color: var(--bx-danger);
  text-align: center;
}

.design__error-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  margin-top: 14px;
  padding: 0 16px;
  border: 1px solid var(--bx-blue);
  border-radius: var(--bx-radius);
}

.design__error-btn-text {
  font-size: 13px;
  color: var(--bx-blue);
}

.design__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.design__pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.design__pane--left {
  flex: 1;
}

.design__section {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.design__section--hidden {
  display: none;
}

.design__scroll {
  flex: 1;
  height: 100%;
  min-height: 0;
}

.design__tabs {
  display: flex;
  padding: 8px 12px 0;
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line);
}

.design__tab {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  margin-right: 8px;
  padding: 0 14px;
  border-bottom: 2px solid transparent;
}

.design__tab--on {
  border-bottom-color: var(--bx-blue);
}

.design__tab-text {
  font-size: 14px;
  color: var(--bx-text-2);
}

.design__tab--on .design__tab-text {
  color: var(--bx-blue);
  font-weight: 500;
}

.design__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line-2);
}

.design__section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--bx-text);
}

.design__add {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--bx-blue);
  border-radius: var(--bx-radius);
}

.design__add-text {
  font-size: 13px;
  color: var(--bx-blue);
}

.design__type-panel {
  border-bottom: 1px solid var(--bx-line);
}

.design__item-list {
  background-color: var(--bx-surface);
}

.design__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.design__loading-text {
  font-size: 13px;
  color: var(--bx-text-3);
}

.design__save-error {
  display: block;
  padding: 0 16px 16px;
  font-size: 12px;
  color: var(--bx-danger);
}

/* 窄屏：右栏是全屏浮层 */
.design__pane--right {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  display: none;
  background-color: var(--bx-bg);
}

.design__pane--open {
  display: flex;
}

.design__panel-head {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line);
}

.design__panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 8px;
}

.design__panel-close-text {
  font-size: 14px;
  color: var(--bx-blue);
}

.design__panel-title {
  margin-left: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--bx-text);
}

.design__drag-layer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 60;
  background-color: rgba(0, 122, 255, 0.04);
}

/* ── 宽屏：分栏，标签页与浮层都退化为并排 ── */
@media (min-width: 900px) {
  .design__tabs {
    display: none;
  }

  /* 宽屏下两个区都要显示，覆盖窄屏的标签切换 */
  .design__section--hidden {
    display: flex;
  }

  .design__pane--left {
    flex: 0 0 420px;
    max-width: 420px;
    border-right: 1px solid var(--bx-line);
  }

  .design__pane--right {
    position: static;
    display: flex;
    flex: 1;
    z-index: auto;
  }

  .design__panel-close {
    display: none;
  }

  .design__panel-head {
    justify-content: flex-start;
  }
}
</style>
