/**
 * 铁锈战争地图触发器/对象类型定义。
 * 全部依据反编译源码整理：
 *  - 触发器类型枚举: gameFramework/status/e.java
 *  - 通用属性解析:   gameFramework/status/c.java (createTrigger)
 *  - 激活行为:       gameFramework/status/d.java (activateTrigger)
 *  - 条件:           gameFramework/status/a/c.java (unitDetect), a/b.java (teamTagDetect)
 *  - 特殊对象:       gameFramework/status/MissionEngine.java (initializeMission)
 *  - map_info:       MissionEngine.java + TiledMap.java
 */

export type FieldType =
  | 'string'
  | 'text'      // 多行
  | 'int'
  | 'float'
  | 'bool'
  | 'time'      // 支持 "5s" / "500ms" / 纯毫秒数字
  | 'color'
  | 'team'      // 队伍编号（-1 中立 / 0..9 / none）
  | 'enum'
  | 'unit'      // 单位名（内置或自定义）
  | 'idlist'    // 逗号分隔的触发器 id 列表
  | 'pointid'   // point 对象的名称
  | 'unitlist'  // spawnUnits 格式: name*count(key=value,...), ...

export interface FieldDef {
  key: string
  type: FieldType
  label: string
  desc?: string
  options?: string[]
  placeholder?: string
  /** 仅在 mapText 等特定类型下展示的附加条件（无则总是展示） */
  showIf?: (props: Record<string, string>) => boolean
}

export interface ObjectTypeDef {
  /** type 属性值；空字符串表示"无类型对象" */
  type: string
  label: string
  desc: string
  /** 归类: trigger=触发器逻辑, action=激活后动作, marker=标记/配置, unit=单位, misc=其他 */
  group: 'trigger' | 'action' | 'marker' | 'unit' | 'misc'
  /** 是否必须放在 Triggers 对象组（依据 maps/a.java 的校验） */
  triggersLayerOnly: boolean
  fields: FieldDef[]
  /** 创建时默认属性 */
  defaults?: Record<string, string>
  /** 默认使用点对象还是矩形 */
  shape?: 'rect' | 'point'
}

/** 通用触发器属性（c.java 中对所有 MissionEngine 触发器生效） */
export const COMMON_TRIGGER_FIELDS: FieldDef[] = [
  { key: 'id', type: 'string', label: '触发器 ID', desc: '供 activatedBy/alsoActivate 等引用；缺省时用对象名称' },
  { key: 'team', type: 'team', label: '队伍', desc: '限定触发器作用的队伍' },
  { key: 'delay', type: 'time', label: '延迟激活', desc: '开局后经过该时间自动激活，如 5s / 500ms' },
  { key: 'warmup', type: 'time', label: '预热时间', desc: '条件持续满足该时长后才激活' },
  { key: 'repeatDelay', type: 'time', label: '重复间隔', desc: '激活后每隔该时间重复激活' },
  { key: 'repeatCount', type: 'int', label: '重复次数', desc: '最大重复次数（默认无限）' },
  { key: 'resetActivationAfter', type: 'time', label: '激活重置时间', desc: '激活该时长后重置为未激活' },
  { key: 'allToActivate', type: 'bool', label: '需全部条件', desc: 'true=所有关联条件均满足才激活（AND），默认任一满足（OR）' },
  { key: 'activatedBy', type: 'idlist', label: '被这些触发器激活', desc: '逗号分隔的触发器 id（whenActivatedIds 同义）' },
  { key: 'alsoActivate', type: 'idlist', label: '同时激活这些', desc: '本触发器激活时联动激活的 id 列表（activateIds 同义）' },
  { key: 'deactivatedBy', type: 'idlist', label: '被这些触发器停用', desc: '任一激活则本触发器永久停用' },
  { key: 'globalMessage', type: 'text', label: '全局消息', desc: '激活时向所有玩家显示的消息（支持 _zh 等本地化后缀）' },
  { key: 'globalMessage_delayPerChar', type: 'string', label: '消息逐字延迟', desc: '每字符显示延迟，可填 slow 或毫秒数' },
  { key: 'globalMessage_textColor', type: 'color', label: '消息颜色' },
  { key: 'debugMessage', type: 'string', label: '调试消息', desc: '激活时输出到日志（沙盒调试可见）' },
  { key: 'showOnMap', type: 'bool', label: '在地图上提示', desc: '激活时在小地图标记该位置' },
  { key: 'comment', type: 'string', label: '注释', desc: '不影响逻辑' },
]

/** unitDetect 条件字段（a/c.java） */
const UNIT_DETECT_FIELDS: FieldDef[] = [
  { key: 'minUnits', type: 'int', label: '最少单位数', desc: '区域内该队伍单位数 >= 此值时满足（默认 1；设置 maxUnits 后默认 0）' },
  { key: 'maxUnits', type: 'int', label: '最多单位数', desc: '区域内单位数 <= 此值时满足' },
  { key: 'unitType', type: 'unit', label: '单位类型', desc: '只统计该类型内置单位' },
  { key: 'onlyBuildings', type: 'bool', label: '仅建筑' },
  { key: 'onlyMainBuildings', type: 'bool', label: '仅主要建筑' },
  { key: 'onlyBuilders', type: 'bool', label: '仅工程单位' },
  { key: 'onlyIdle', type: 'bool', label: '仅空闲单位' },
  { key: 'onlyEmptyQueue', type: 'bool', label: '仅空生产队列' },
  { key: 'onlyAttack', type: 'bool', label: '仅可攻击单位' },
  { key: 'onlyAttackAir', type: 'bool', label: '仅可对空单位' },
  { key: 'onlyOnResourcePool', type: 'bool', label: '仅在资源点上' },
  { key: 'onlyTechLevel', type: 'int', label: '仅科技等级', desc: '限定 techLevel' },
  { key: 'onlyIfEmpty', type: 'bool', label: '仅空载运输', desc: '排除装载了单位的运输' },
  { key: 'onlyWithTag', type: 'string', label: '仅带标签', desc: '单位标签过滤' },
  { key: 'includeIncomplete', type: 'bool', label: '含未完成建筑' },
]

export const OBJECT_TYPES: ObjectTypeDef[] = [
  // ---------- 标记/配置类 ----------
  {
    type: '',
    label: '普通对象 / 特殊名称',
    desc: '无类型对象。特殊名称: map_info(地图信息)、camera_start(初始镜头)、attack_point(生存模式进攻点)',
    group: 'misc',
    triggersLayerOnly: false,
    fields: [],
    shape: 'rect',
  },
  {
    type: 'map_info',
    label: '地图信息 (map_info)',
    desc: '名称必须为 map_info（type 留空）。定义地图类型、胜利条件、战争迷雾等',
    group: 'marker',
    triggersLayerOnly: true,
    fields: [
      { key: 'type', type: 'enum', label: '地图类型', options: ['skirmish', 'mission', 'survival', 'challenge'], desc: 'skirmish=遭遇战 mission=任务 survival=生存 challenge=挑战' },
      { key: 'winCondition', type: 'enum', label: '胜利条件', options: ['allUnitsAndBuildings', 'allBuildings', 'mainBuildings', 'commandCenter', 'requiredObjectives', 'none'], desc: '任务/生存图必填' },
      { key: 'fog', type: 'enum', label: '战争迷雾', options: ['', 'none', 'map', 'los'], desc: 'none=无 map=已探索 los=视线' },
      { key: 'introText', type: 'text', label: '开场简报', desc: '开局弹出的说明文字，\\n 换行；支持 introText_zh 本地化' },
      { key: 'shareFogWithAllies', type: 'bool', label: '盟友共享视野' },
      {
        key: 'survivalWaves',
        type: 'text',
        label: '生存波次',
        desc: '每行一波：+M:SS 说明 [lockSpawn] - 3 tank, 2 heavyTank（建议用顶部「生存时间轴」可视化编辑）',
      },
      { key: 'survivalWavesClassic', type: 'bool', label: '经典生存波次', desc: 'true=使用游戏内置经典波次单位表' },
      { key: 'startWithMusic', type: 'string', label: '开场音乐' },
    ],
    defaults: { type: 'skirmish' },
    shape: 'rect',
  },
  {
    type: 'team_info',
    label: '队伍配置 (team_info)',
    desc: '设置某队伍的初始资金、AI 行为、结盟分组等',
    group: 'marker',
    triggersLayerOnly: true,
    fields: [
      { key: 'team', type: 'team', label: '队伍编号', desc: '必填' },
      { key: 'credits', type: 'int', label: '初始资金' },
      { key: 'allyGroup', type: 'int', label: '结盟分组', desc: '相同分组的队伍结盟' },
      { key: 'ai', type: 'enum', label: 'AI 模式', options: ['', 'survival'], desc: 'survival=该 AI 使用生存模式行为' },
      { key: 'basicAI', type: 'bool', label: '基础 AI', desc: '使用简化 AI' },
      { key: 'disabledAI', type: 'bool', label: '禁用 AI' },
      { key: 'lockAiDifficulty', type: 'int', label: '锁定 AI 难度' },
    ],
    defaults: { team: '1' },
    shape: 'rect',
  },
  {
    type: 'point',
    label: '路径点 (point)',
    desc: '命名坐标点，供 move 触发器的 target 引用',
    group: 'marker',
    triggersLayerOnly: true,
    fields: [],
    shape: 'point',
  },
  {
    type: 'camera_pan',
    label: '镜头巡游点 (camera_pan)',
    desc: '主菜单背景演示时镜头按 index 顺序巡游',
    group: 'marker',
    triggersLayerOnly: true,
    fields: [{ key: 'index', type: 'int', label: '顺序编号', desc: '从 0 开始' }],
    defaults: { index: '0' },
    shape: 'point',
  },
  {
    type: 'info',
    label: '信息标注 (info)',
    desc: '仅作地图内注释，游戏忽略',
    group: 'misc',
    triggersLayerOnly: false,
    fields: [],
    shape: 'rect',
  },
  {
    type: 'comment',
    label: '注释对象 (comment)',
    desc: '可放任意对象层，游戏忽略',
    group: 'misc',
    triggersLayerOnly: false,
    fields: [],
    shape: 'rect',
  },

  // ---------- 开局区域效果（仅加载时生效一次） ----------
  {
    type: 'rotate',
    label: '旋转单位 (rotate)',
    desc: '地图加载时，把区域内的非建筑单位朝向设为 dir',
    group: 'marker',
    triggersLayerOnly: true,
    fields: [{ key: 'dir', type: 'float', label: '朝向角度', desc: '度数，必填' }],
    defaults: { dir: '0' },
    shape: 'rect',
  },
  {
    type: 'fall',
    label: '坠落入场 (fall)',
    desc: '地图加载时，区域内非建筑单位以坠落方式入场',
    group: 'marker',
    triggersLayerOnly: true,
    fields: [],
    shape: 'rect',
  },
  {
    type: 'set_team',
    label: '改队伍 (set_team)',
    desc: '地图加载时，把区域内单位改属到指定队伍',
    group: 'marker',
    triggersLayerOnly: true,
    fields: [{ key: 'team', type: 'team', label: '目标队伍', desc: '必填' }],
    defaults: { team: '0' },
    shape: 'rect',
  },
  {
    type: 'ai_allow_full_use',
    label: '允许 AI 完全使用 (ai_allow_full_use)',
    desc: '地图加载时，允许 AI 完全控制区域内预置单位',
    group: 'marker',
    triggersLayerOnly: true,
    fields: [],
    shape: 'rect',
  },
  {
    type: 'disable_unit_ai',
    label: '禁用单位 AI (disable_unit_ai)',
    desc: '地图加载时，禁用区域内单位的自主 AI（不还击不巡逻）',
    group: 'marker',
    triggersLayerOnly: true,
    fields: [],
    shape: 'rect',
  },

  // ---------- 条件触发器 ----------
  {
    type: 'basic',
    label: '基础触发器 (basic)',
    desc: '无内建条件；配合 delay/activatedBy/allToActivate 组合逻辑',
    group: 'trigger',
    triggersLayerOnly: true,
    fields: [],
    shape: 'rect',
  },
  {
    type: 'unitDetect',
    label: '单位检测 (unitDetect)',
    desc: '检测矩形区域内满足条件的单位数量',
    group: 'trigger',
    triggersLayerOnly: true,
    fields: UNIT_DETECT_FIELDS,
    defaults: { minUnits: '1' },
    shape: 'rect',
  },
  {
    type: 'teamTagDetect',
    label: '队伍标签检测 (teamTagDetect)',
    desc: '检测指定队伍是否带有某标签（需设置 team 与 teamTag）',
    group: 'trigger',
    triggersLayerOnly: true,
    fields: [{ key: 'teamTag', type: 'string', label: '队伍标签', desc: '必填' }],
    shape: 'rect',
  },
  {
    type: 'objective',
    label: '任务目标 (objective)',
    desc: '在任务面板显示的目标；winCondition=requiredObjectives 时全部完成即胜利',
    group: 'trigger',
    triggersLayerOnly: true,
    fields: [
      { key: 'text', type: 'text', label: '目标文本', desc: '支持 text_zh 本地化' },
    ],
    shape: 'rect',
  },

  // ---------- 动作触发器 ----------
  {
    type: 'unitAdd',
    label: '生成单位 (unitAdd)',
    desc: '激活时在对象中心生成单位（需设置 team 与 spawnUnits）',
    group: 'action',
    triggersLayerOnly: true,
    fields: [
      { key: 'spawnUnits', type: 'unitlist', label: '生成单位列表', desc: '格式: tank*3, heavyTank, mod单位名*2(gridAlign=true)', placeholder: 'tank*3, heavyTank' },
    ],
    defaults: { team: '0', spawnUnits: 'tank' },
    shape: 'rect',
  },
  {
    type: 'unitRemove',
    label: '移除单位 (unitRemove)',
    desc: '激活时移除区域内单位（可用 team 过滤，onlyIfEmpty 排除载员运输）',
    group: 'action',
    triggersLayerOnly: true,
    fields: [{ key: 'onlyIfEmpty', type: 'bool', label: '仅空载运输' }],
    shape: 'rect',
  },
  {
    type: 'move',
    label: '移动单位 (move)',
    desc: '激活时命令区域内指定队伍的单位移动到目标点',
    group: 'action',
    triggersLayerOnly: true,
    fields: [
      { key: 'target', type: 'pointid', label: '目标点', desc: 'point 对象的名称，必填' },
      { key: 'unload', type: 'bool', label: '到达后卸载', desc: '运输单位到达后卸载载员' },
      { key: 'onlyIfEmpty', type: 'bool', label: '仅空载运输' },
    ],
    defaults: { team: '0' },
    shape: 'rect',
  },
  {
    type: 'changeCredits',
    label: '改变资金 (changeCredits)',
    desc: '激活时修改指定队伍资金（需设置 team）',
    group: 'action',
    triggersLayerOnly: true,
    fields: [
      { key: 'add', type: 'int', label: '增加资金', desc: '可为负数' },
      { key: 'set', type: 'int', label: '设置资金', desc: '直接设为该值' },
    ],
    defaults: { team: '0' },
    shape: 'rect',
  },
  {
    type: 'teamTags',
    label: '队伍标签 (teamTags)',
    desc: '激活时增删指定队伍的标签（需设置 team）',
    group: 'action',
    triggersLayerOnly: true,
    fields: [
      { key: 'addTeamTags', type: 'string', label: '添加标签', desc: '逗号分隔' },
      { key: 'removeTeamTags', type: 'string', label: '移除标签', desc: '逗号分隔' },
    ],
    defaults: { team: '0' },
    shape: 'rect',
  },
  {
    type: 'mapText',
    label: '地图文字 (mapText)',
    desc: '激活期间在地图该位置显示文字',
    group: 'action',
    triggersLayerOnly: true,
    fields: [
      { key: 'text', type: 'text', label: '显示文本', desc: '支持 text_zh 本地化' },
      { key: 'textSize', type: 'int', label: '字号', placeholder: '20' },
      { key: 'textColor', type: 'color', label: '文字颜色' },
      { key: 'textOffsetX', type: 'float', label: 'X 偏移' },
      { key: 'textOffsetY', type: 'float', label: 'Y 偏移' },
      { key: 'style', type: 'enum', label: '样式', options: ['', 'arrow'], desc: 'arrow=文字下方带箭头' },
    ],
    defaults: { text: '文字' },
    shape: 'rect',
  },
  {
    type: 'moveCamera',
    label: '移动镜头 (moveCamera)',
    desc: '激活时把玩家镜头移到对象中心',
    group: 'action',
    triggersLayerOnly: true,
    fields: [],
    shape: 'rect',
  },

  // ---------- 单位对象 ----------
  {
    type: 'unit',
    label: '单位对象 (unit)',
    desc: '在对象层直接放置单位（属性 unit/customUnit + team）',
    group: 'unit',
    triggersLayerOnly: false,
    fields: [
      { key: 'unit', type: 'unit', label: '内置单位名' },
      { key: 'customUnit', type: 'string', label: '自定义单位名', desc: 'mod 单位（二选一）' },
      { key: 'type', type: 'string', label: '子类型', desc: '如树的 1.0/1.1 等' },
      { key: 'randomRotate', type: 'bool', label: '随机朝向' },
    ],
    defaults: { unit: 'tank', team: '0' },
    shape: 'rect',
  },
]

export const OBJECT_TYPE_MAP = new Map(OBJECT_TYPES.map((t) => [t.type, t]))

/** 这些 type 是 MissionEngine 触发器（会应用通用属性 c.java） */
export const MISSION_TRIGGER_TYPES = new Set([
  'objective', 'move', 'changeCredits', 'teamTags', 'unitAdd', 'unitRemove',
  'mapText', 'moveCamera', 'unitDetect', 'teamTagDetect', 'basic',
])

/** 特殊对象名称（无 type 或任意 type 时按名称识别） */
export const SPECIAL_NAMES = ['map_info', 'camera_start', 'attack_point'] as const

export function getObjectTypeDef(type: string, name?: string): ObjectTypeDef | undefined {
  const def = OBJECT_TYPE_MAP.get(type)
  if (def && def.type !== '') return def
  if (name === 'map_info') return OBJECT_TYPE_MAP.get('map_info')
  return def
}

/** 对象在画布上的显示颜色 */
export function objectColor(type: string, name: string): string {
  if (name === 'map_info') return '#f0c040'
  if (name === 'camera_start') return '#40c0f0'
  if (name === 'attack_point') return '#f04040'
  switch (type) {
    case 'unitDetect':
    case 'teamTagDetect':
    case 'basic':
      return '#40e0a0'
    case 'unitAdd':
      return '#f08040'
    case 'unitRemove':
      return '#e05050'
    case 'move':
      return '#50a0f0'
    case 'changeCredits':
    case 'teamTags':
      return '#d0d040'
    case 'mapText':
      return '#e080e0'
    case 'moveCamera':
      return '#60d0d0'
    case 'objective':
      return '#ffd700'
    case 'team_info':
      return '#a0a0ff'
    case 'point':
      return '#ffffff'
    case 'camera_pan':
      return '#80c0ff'
    case 'unit':
      return '#c0f060'
    case 'rotate':
    case 'fall':
    case 'set_team':
    case 'ai_allow_full_use':
    case 'disable_unit_ai':
      return '#b080f0'
    default:
      return '#9aa4b0'
  }
}
