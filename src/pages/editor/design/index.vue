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

import { computed } from 'vue'

import BxEmpty from '@/components/base/BxEmpty.vue'
import BxNavBar from '@/components/base/BxNavBar.vue'
import EditorActivityForm from '@/components/editor/EditorActivityForm.vue'
import EditorItemPanel from '@/components/editor/EditorItemPanel.vue'
import EditorItemRow from '@/components/editor/EditorItemRow.vue'
import EditorTypePicker from '@/components/editor/EditorTypePicker.vue'
import { useEditorDesign } from '@/composables/useEditorDesign'
import { editorListUrl, isSingleChoice, typeHasOptions } from '@/domain/editor'

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

/*
 * ── 实时预览（宽屏第三栏）──
 *
 * 预览刻意**不**复用作答侧的 BxFieldRenderer：那边吃的是 `QuestionField`（平台行经
 * mapper 归一化后的作答模型），而编辑器手里是 `EditorItem`（改动未保存的编辑模型）。
 * 为预览再造一条 EditorItem → QuestionField 的转换，等于把 mapper 抄第二遍 ——
 * 那份逻辑一旦分叉，预览就会"看起来很对、实际不对"。
 *
 * 所以这里只做**结构示意**：题干 + 必答标记 + 该题型的控件形态。它回答的是
 * 「这道题在手机上长什么样、选项够不够」，不承担像素级还原。
 */
const previewHasOptions = computed(() => {
  const item = selectedItem.value
  return !!item && typeHasOptions(item.type) && item.options.length > 0
})

/** 选项题是单选还是多选：由 `isSingleChoice()` 判定（「选项」题型的单/多选在 attr 里） */
const previewMulti = computed(() => {
  const item = selectedItem.value
  return !!item && !isSingleChoice(item.type, item.attr)
})

const previewIsText = computed(() => {
  const type = selectedItem.value?.type ?? ''
  return type === '文本' || type === '数字'
})

/** 非选项类题型的占位文案：与作答侧同一套措辞 */
const previewPlaceholder = computed(() => {
  switch (selectedItem.value?.type) {
    case '数字':
      return '请输入数字'
    case '时间日期':
      return '请选择日期'
    case '地址':
      return '请选择地区'
    case '引用':
      return '请选择'
    case '图片':
      return '上传图片'
    default:
      return '请输入'
  }
})
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
              <view class="design__add-icon" aria-hidden="true" />
              <text class="design__add-text">添加题目</text>
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
              tip="点上方「添加题目」开始设计"
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

      <!--
        ── 预览栏（宽屏第三栏）──
        320 + 编辑区 + 360 在 1280px 以下会挤到没法编辑，所以窄屏直接不渲染它。
        内容只做结构示意（题干 / 必答标记 / 该题型的控件形态），理由见 script 里
        `previewHasOptions` 上方那段说明。
      -->
      <view class="design__pane design__pane--preview">
        <view class="design__panel-head">
          <text class="design__panel-title">实时预览</text>
        </view>

        <scroll-view class="design__scroll" scroll-y>
          <view class="dv">
            <view class="dv__screen">
              <template v-if="selectedItem">
                <view class="dv__qhead">
                  <text class="dv__no">{{ selectedIndex + 1 }}</text>
                  <text class="dv__title">
                    {{ selectedItem.title || '（未填写题干）' }}
                    <text v-if="selectedItem.required" class="dv__req">*</text>
                  </text>
                </view>
                <text v-if="previewMulti" class="dv__hint">多选题 · 可选择多项</text>

                <view v-if="previewHasOptions" class="dv__opts">
                  <view
                    v-for="option in selectedItem.options"
                    :key="option.clientKey"
                    class="dv__opt"
                  >
                    <view class="dv__mark" :class="{ 'dv__mark--box': previewMulti }" />
                    <text class="dv__opt-text">{{ option.value || '（未填写选项）' }}</text>
                  </view>
                </view>

                <view v-else class="dv__control">
                  <text class="dv__placeholder">{{ previewPlaceholder }}</text>
                  <view v-if="!previewIsText" class="dv__arrow" aria-hidden="true" />
                </view>
              </template>

              <view v-else class="dv__empty">
                <text class="dv__empty-text">从左侧点一道题，这里会显示它在手机上的样子</text>
              </view>
            </view>

            <text class="dv__caption">结构示意：题干、必答标记与该题型的控件形态</text>
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
  opacity: var(--bx-disabled-opacity);
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
  height: 32px;
  padding: 0 12px;
  cursor: pointer;
  border: 1px solid var(--bx-primary);
  border-radius: var(--bx-radius-sm);
}

.design__add:hover,
.design__add:active {
  background-color: var(--bx-primary-soft);
}

/* 加号用两条线绘制（原为「＋ 添加题目」里的全角加号，字形随字体变化） */
.design__add-icon {
  position: relative;
  flex: none;
  width: 9px;
  height: 9px;
  margin-right: 5px;
}

.design__add-icon::before,
.design__add-icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 9px;
  height: 1.5px;
  margin-top: -0.75px;
  background-color: var(--bx-primary);
  border-radius: 1px;
}

.design__add-icon::after {
  transform: rotate(90deg);
}

.design__add-text {
  font-size: 13px;
  color: var(--bx-primary);
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
    flex: 0 0 320px;
    max-width: 320px;
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

/* ── 预览栏 ──
 * 默认不渲染：320 + 编辑区 + 360 在 1280px 以下会把编辑区挤到没法用。
 */
.design__pane--preview {
  display: none;
}

.dv {
  padding: 16px;
}

/* 只做视觉边界（像一台手机），高度随内容 */
.dv__screen {
  padding: 16px;
  background-color: var(--bx-surface);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius-card);
  box-shadow: var(--bx-elev-1);
}

.dv__qhead {
  display: flex;
  align-items: flex-start;
}

/* 序号胶囊：与作答页同一套语言，让预览看起来就是那道题 */
.dv__no {
  flex: none;
  min-width: 22px;
  height: 22px;
  margin-top: 1px;
  margin-right: 10px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
  color: var(--bx-primary);
  text-align: center;
  background-color: var(--bx-primary-soft);
  border-radius: var(--bx-radius-sm);
}

.dv__title {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--bx-text);
  word-break: break-all;
}

.dv__req {
  margin-left: 2px;
  color: var(--bx-danger);
}

.dv__hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
}

.dv__opts {
  margin-top: 16px;
}

.dv__opt {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.dv__opt + .dv__opt {
  margin-top: 8px;
}

.dv__mark {
  flex: none;
  width: 20px;
  height: 20px;
  margin-right: 12px;
  border: 1.5px solid var(--bx-text-4);
  border-radius: 50%;
}

.dv__mark--box {
  border-radius: 6px;
}

.dv__opt-text {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--bx-text-2);
  word-break: break-all;
}

.dv__control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--bx-control-height);
  margin-top: 16px;
  padding: 12px 14px;
  background-color: var(--bx-bg);
  border: 1px solid var(--bx-line);
  border-radius: var(--bx-radius);
}

.dv__placeholder {
  font-size: 15px;
  color: var(--bx-text-4);
}

.dv__arrow {
  flex: none;
  width: 8px;
  height: 8px;
  margin-left: 10px;
  border-top: 1.5px solid var(--bx-text-3);
  border-right: 1.5px solid var(--bx-text-3);
  transform: rotate(45deg);
}

.dv__empty {
  padding: 24px 0;
  text-align: center;
}

.dv__empty-text {
  font-size: 13px;
  line-height: 20px;
  color: var(--bx-text-3);
}

.dv__caption {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  line-height: 18px;
  color: var(--bx-text-3);
}

/* 1280px 以上才并排第三栏 */
@media (min-width: 1280px) {
  .design__pane--preview {
    display: flex;
    flex: 0 0 360px;
    flex-direction: column;
    max-width: 360px;
    background-color: var(--bx-surface);
    border-left: 1px solid var(--bx-line);
  }
}
</style>
