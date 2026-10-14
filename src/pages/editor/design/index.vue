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
 * 业务逻辑（题目增删改排序、选项编辑、拖拽重排、保存编排、校验定位）全在
 * `useEditorDesign` 里：布局是模板的事、编排是 composable 的事，本文件只做绑定，
 * 不再同时承担两份职责。
 */

import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import EditorActivityForm from '@/components/editor/EditorActivityForm.vue'
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
