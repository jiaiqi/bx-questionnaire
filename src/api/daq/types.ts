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
  /** 题型附加属性，如 { radioType: 'single' } */
  item_type_attr?: Record<string, unknown> | null
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
export interface DaqRecordReplyRow {
  activity_no?: string
  fill_batch_no?: string
  item_no?: string
  /** 作答值 */
  svalue?: string | null
  score?: string | number | null
  state?: string | null
  start_time?: string | null
  end_time?: string | null
  user_no?: string | null
  user_name?: string | null
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
  item_seq?: number | null
  item_type?: string | null
  item_title?: string | null
  /** 作答值；单选/多选为 option_value */
  svalue?: string | null
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
