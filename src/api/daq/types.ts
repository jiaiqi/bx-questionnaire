/**
 * daq（问卷）应用平台原始行类型
 *
 * 字段来源：真实网关响应基线，见 `test/fixtures/raw/activity-*.json`。
 * 平台可能返回未列出的列，因此均带索引签名；业务代码不应直接消费本层类型，
 * 请经 `domain/questionnaire/mapper.ts` 转成 `QuestionField`。
 */

/** 选项行（item_data[].option_data[]） */
export interface DaqOptionRow {
  id?: number
  /** 选项主键，提交时反查映射用 */
  option_no: string
  option_seq?: number | null
  /** 选项值，提交时写入 option_data */
  option_value?: string
  /** 是否为正确答案（'是' / '否' / null） */
  answer?: string | null
  option_img_explain?: string | null
  option_video_explain?: string | null
  /** 选项展示序号（A/B/C…），提交时写入 option_flag */
  option_view_no?: string
  [k: string]: unknown
}

/** 题目行（item_data[]） */
export interface DaqItemRow {
  item_no: string
  item_seq?: number | null
  item_title?: string
  /** 文本 / 单选 / 多选 / 数字 / 时间日期 / 图片 / 地址 / 引用 / 分节符 等 */
  item_type?: string
  /** '是' / '否' */
  is_require?: string
  points?: string | number | null
  /** 正确答案（客观题） */
  answer?: string | null
  answer_analysis?: string | null
  /**
   * 题型附加属性，如 `{ radioType: 'single' }`
   *
   * **同一列在不同服务下形态不同**（实测 2026-10-11）：
   * - `srvdaq_init_view_select` 返回**已解析的对象**；
   * - `srvdaq_item_cfg_select` 返回 **JSON 字符串**（`"{\"radioType\":\"single\"}"`）。
   *
   * 因此消费方**必须**经 `parseItemTypeAttr()` 归一化，不能直接下标取值 ——
   * 字符串下标会静默取到 `undefined`，表现为「配置写了但不生效」。
   */
  item_type_attr?: Record<string, unknown> | string | null
  option_data?: DaqOptionRow[] | null
  /** 显隐配置（老工程未消费，导致前端显隐从未生效） */
  show_cfg?: string | null
  /** 引用型题目的取值配置 */
  ref_type?: string | null
  srv_app?: string | null
  servicename?: string | null
  refed_col?: string | null
  key_disp_col?: string | null
  classify?: string | null
  classify_name?: string | null
  classify_path?: string | null
  [k: string]: unknown
}

/** 问卷活动配置行（srvdaq_init_view_select / srvdaq_activity_cfg_select 的 data[i]） */
export interface DaqActivityRow {
  activity_no: string
  title?: string
  /** 未开始 / 进行中 / 已结束 */
  status?: string
  /** 评估 / 自测 / 反馈 */
  info_collect_type?: string
  /** 答题次数策略，如 '1次' / '多次' */
  answer_times?: string
  act_option?: string
  /** 匿名访问 / 需登录 … */
  perm_type?: string
  item_count?: number
  passing_mark?: string | number | null
  total_points?: string | number | null
  submit_label?: string
  start_remark?: string
  rd_remark?: string
  submitted_tip?: string
  end_remark?: string
  item_disp_way?: string
  start_time?: string | null
  end_time?: string | null
  activity_image?: string | null
  classify?: string | null
  classify_name?: string | null
  /** 活动简介（真实字段，封面页优先展示） */
  summary?: string | null
  logo?: string | null
  remark?: string | null
  submit_count?: number | null
  /** 提交后是否允许修改 */
  modify_after_submit?: string | null
  /** 题目列表（仅 init_view_select 返回） */
  item_data?: DaqItemRow[]
  [k: string]: unknown
}

/** 答题记录行（srvdaq_record_reply_select） */
/**
 * 答题记录行（srvdaq_record_reply_select）
 *
 * **每次作答一行**，不是每题一行 —— 实测按 fill_batch_no 查询只返回 1 行，
 * 其中含该次作答的汇总信息（标题、得分、状态、起止时间）。
 * 逐题明细请用 `srvdaq_record_reply_merge_select`。
 *
 * 字段以实测返回为准（colNames:['*']）：原类型里的 item_no / svalue 并不存在，
 * 而实际返回的 title / nickname / user_type 之前没有声明。
 */
export interface DaqRecordReplyRow {
  activity_no?: string
  fill_batch_no?: string
  /** 活动标题 */
  title?: string | null
  /** 本次作答得分（服务端计算，老工程 seeScore 取的就是这个） */
  score?: string | number | null
  state?: string | null
  start_time?: string | null
  end_time?: string | null
  user_no?: string | null
  user_name?: string | null
  /** 以下三项由后端按渠道自动填充，前端无需写入 */
  nickname?: string | null
  user_type?: string | null
  [k: string]: unknown
}

/**
 * 评估维度汇总行（srvdaq_record_reply_merge_select）
 *
 * 实测字段：该服务**没有 item_no / activity_no**（传 activity_no 会报
 * CONDITION_COLUMS_NOT_EXISTS），题目维度用 item_seq 与 item_title 标识，
 * 作答值在 svalue（单选/多选存 option_value）。
 */
export interface DaqRecordMergeRow {
  fill_batch_no?: string
  /**
   * 题目标识
   *
   * 老工程用 `item_no`（index/result.vue 的 `resultListMap[item.item_no]`），
   * parkDev 实测返回的是 `item_seq` 且没有 `item_no` —— 两个字段都声明并兼容处理。
   */
  item_no?: string | null
  item_seq?: number | null
  item_type?: string | null
  item_title?: string | null
  /** 作答值；单选/多选为 option_value */
  svalue?: string | null
  /** 以下字段来自服务列更完整的环境（老工程依赖它们判断对错），parkDev 未返回 */
  option_data?: Array<{ option_value?: string, answer?: string, option_view_no?: string | number | null }> | null
  points?: string | number | null
  result?: string | null
  score?: string | number | null
  [k: string]: unknown
}

/** 评估建议行（srvdaq_activity_sug_select） */
/**
 * 评估建议行（srvdaq_activity_sug_select）
 *
 * 老工程两处渲染都用 `sug_desc`（assessmentResult.vue 与 index/result.vue），
 * 且没有使用 min_score / max_score —— 后端已按 activity_no + fill_batch_no 筛好适用区间，
 * 前端直接渲染返回行即可。
 */
export interface DaqActivitySugRow {
  activity_no?: string
  fill_batch_no?: string
  /** 建议正文 */
  sug_desc?: string | null
  [k: string]: unknown
}

/**
 * 分值结果说明行（`srvdaq_activity_score_sug_select`）
 *
 * 平台按活动配置若干**分数区间**，命中哪段就展示哪段文案（如「您的患冠心病风险低…」）。
 * 214 上有 58 条存量，本工程此前完全没用 —— 结果页的结论一直是前端按及格线拼的。
 *
 * 服务是**登录访问**：匿名调用返回 `0011 …无权限访问`（parkDev 实测），
 * 所以只能在登录态消费。
 */
export interface DaqActivityScoreSugRow {
  activity_no?: string
  start_score?: number | string | null
  end_score?: number | string | null
  /** 命中该区间时展示的说明 */
  remark?: string | null
  [k: string]: unknown
}

/**
 * 选项配置行（`srvdaq_option_cfg_select`）
 *
 * 选项**不在题目表里**，是独立的一张表 `bxdaq_option_cfg`，按 `item_no` 关联。
 * 实测列（2026-10-11）：`option_value, del_flag, create_time, modify_user_disp,
 * modify_user, modify_time, create_user_disp, biz_path, item_no, points, option_seq,
 * option_no, answer, option_view_no, id, create_user, option_img_explain,
 * option_video_explain`。
 */
export interface DaqOptionCfgRow {
  /** 选项主键，更新/删除的定位键 */
  option_no: string
  /** 所属题目编号 */
  item_no?: string
  /** 选项文案 */
  option_value?: string | null
  /** 展示标识 A..Z，提交时写入 option_flag */
  option_view_no?: string | null
  option_seq?: number | null
  /** 是否为正确答案：'是' / '否' */
  answer?: string | null
  points?: string | number | null
  [k: string]: unknown
}

/**
 * 分类树行（`srvdaq_classify_select`）
 *
 * 实测（2026-10-11）本环境 13 行，是**树**：`parent_no` 指向父节点、
 * `path_name` 是「自测/考试」这样的层级路径、`is_leaf` 标记叶子。
 *
 * 两点必须注意：
 * 1. **不能只取叶子** —— 演示问卷用的 `DAQ202409230006`（自测）`is_leaf=否` 却实际在用；
 * 2. `info_type` 是活动 `info_collect_type` 的**派生源**（服务端按它自动填），
 *    所以它不等于节点名称（`DAQ202409230002` 名叫「竞答」而 `info_type` 是「自测」）。
 */
export interface DaqClassifyRow {
  classify_no: string
  classify_name?: string | null
  parent_no?: string | null
  /** 层级路径，如 `自测/考试/身体健康问卷` */
  path_name?: string | null
  path?: string | null
  is_leaf?: string | null
  /** 派生活动 info_collect_type 用 */
  info_type?: string | null
  seq?: number | null
  perm_type?: string | null
  [k: string]: unknown
}
