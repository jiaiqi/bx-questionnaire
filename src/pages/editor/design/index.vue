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
 * - 宽屏（≥900px）：左栏「问卷信息 + 题纲」、中栏「画布」、右栏「题目设置」；
 * - 窄屏：左栏用顶部标签在「问卷信息 / 题目」间切换，点题目时右栏变成**全屏浮层**。
 *
 * 这样 PC 与手机各用各的顺手形态，且两端共用同一份模板与逻辑
 * （不是两套页面，不会出现「PC 上修好了、手机上还是旧的」）。
 *
 * ## 三栏各答一个问题
 *
 * - **题纲**（左）：有哪些题 —— 题号 + 题干摘要 + 题型标签
 * - **画布**（中）：这份问卷长什么样 —— 一张连续的纸，题型用左侧色条区分
 * - **属性**（右）：当前这道题怎么改 —— 分组表单
 *
 * 业务逻辑（题目增删改排序、选项编辑、拖拽重排、保存编排、校验定位）全在
 * `useEditorDesign` 里：布局是模板的事、编排是 composable 的事，本文件只做绑定，
 * 不再同时承担两份职责。
 */

import { computed } from 'vue'

import BxButton from '@/components/base/BxButton.vue'
import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import EditorActivityForm from '@/components/editor/EditorActivityForm.vue'
import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import EditorItemPanel from '@/components/editor/EditorItemPanel.vue'
import EditorItemRow from '@/components/editor/EditorItemRow.vue'
import EditorTypePicker from '@/components/editor/EditorTypePicker.vue'
import { useEditorDesign } from '@/composables/useEditorDesign'
import { editorListUrl } from '@/domain/editor'

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
  navTitle,
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
  onSelectItem,
  onClosePanel,
  onChangeType,
  onBackToList,
  onOptionAdd,
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
    <BxNavBar :title="navTitle" :fallback-url="editorListUrl()">
      <template #extra>
        <view class="design__nav-actions">
          <BxButton
            v-if="dirty"
            type="secondary"
            size="small"
            aria-label="放弃修改"
            @click="onDiscard"
          >
            放弃
          </BxButton>
          <BxButton
            type="primary"
            size="small"
            aria-label="保存问卷"
            :loading="saving"
            @click="onSave"
          >
            保存
          </BxButton>
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
      <!-- ── 左栏：问卷信息 + 题纲 ── -->
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
            <BxButton
              type="secondary"
              size="small"
              aria-label="添加题目"
              @click="addingType = !addingType"
            >
              <view class="design__add-icon" aria-hidden="true" />
              <text>添加题目</text>
            </BxButton>
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
                :drop-position="itemDropPosition"
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
              tip="点上方「添加题目」开始设计"
            />
            <view v-if="loading" class="design__loading">
              <text class="design__loading-text">加载中…</text>
            </view>
          </scroll-view>
        </view>
      </view>

      <!--
        ── 中栏：画布 ──
        一份问卷 = 一张连续的纸。窄屏不渲染：三栏在 1280px 以下会把编辑区挤到
        没法用（设计器本来就是 PC 上为主的工作台）。
      -->
      <view class="design__pane design__pane--canvas">
        <view class="design__panel-head">
          <text class="design__panel-title">问卷纸面</text>
          <text class="design__panel-hint">点一道题即可编辑</text>
        </view>

        <scroll-view class="design__scroll" scroll-y>
          <EditorCanvas
            :items="doc.items"
            :selected-key="selectedKey"
            @select="onSelectItem"
          />
        </scroll-view>
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
  gap: 8px;
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
  border: 1px solid var(--bx-primary);
  border-radius: var(--bx-radius);
}

.design__error-btn-text {
  font-size: 13px;
  color: var(--bx-primary);
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
  border-bottom-color: var(--bx-primary);
}

.design__tab-text {
  font-size: 14px;
  color: var(--bx-text-2);
}

.design__tab--on .design__tab-text {
  color: var(--bx-primary);
  font-weight: 500;
}

/* 题纲栏的标题：分组标题 12/600 */
.design__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background-color: var(--bx-surface);
  border-bottom: 1px solid var(--bx-line-2);
}

.design__section-title {
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  color: var(--bx-text-2);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

/* 加号用两条线绘制（原为「＋ 添加题目」里的全角加号，字形随字体变化） */
.design__add-icon {
  position: relative;
  flex: none;
  width: 9px;
  height: 9px;
  margin-right: 5px;
}

/* 颜色跟着按钮文字走（currentColor），不另写一套主色 */
.design__add-icon::before,
.design__add-icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 9px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: currentcolor;
  border-radius: 1px;
}

.design__add-icon::after {
  transform: rotate(90deg);
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
  z-index: var(--bx-z-fixed);
  display: none;
  background-color: var(--bx-bg);
}

.design__pane--open {
  display: flex;
}

.design__panel-head {
  display: flex;
  flex: none;
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
  color: var(--bx-primary);
}

/* 栏标题：12/600 分组标题（规范 §7.6） */
.design__panel-title {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  color: var(--bx-text-2);
  letter-spacing: 0.02em;
}

.design__panel-hint {
  margin-left: auto;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
}

/* 拖拽时整页蒙一层极浅的墨蓝（6%），告诉用户「现在是在拖」 */
.design__drag-layer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--bx-z-overlay);
  background-color: var(--bx-glow);
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
    flex: 0 0 360px;
    max-width: 360px;
    background-color: var(--bx-surface);
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

/* ── 画布栏：1280px 以上才与其它两栏并排 ──
 * 340（题纲）+ 画布 + 360（属性）已经占掉 700px，窄于此画布就没法看了。
 */
.design__pane--canvas {
  display: none;
}

@media (min-width: 1280px) {
  .design__pane--canvas {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .design__pane--right {
    flex: 0 0 360px;
    max-width: 360px;
    background-color: var(--bx-surface);
    border-left: 1px solid var(--bx-line);
  }

  .design__panel-title {
    margin-left: 0;
  }
}
</style>
