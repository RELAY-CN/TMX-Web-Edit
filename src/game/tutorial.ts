export interface TutorialStep {
  id: string
  title: string
  goal: string
  action: string
  checkpoint: string
  details: string[]
  tip?: string
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'start',
    title: '建立可进游戏的地图骨架',
    goal: '先得到游戏能加载的基本 TMX 结构。',
    action: '点「新建」创建地图，或「打开」载入已有 .tmx。',
    checkpoint: '右侧图层里能看到 Ground、Items、Triggers 和 UnitObjects。',
    details: [
      '游戏硬性要求：Ground 与 Items 图块层必须存在。',
      'Ground 每一格都要有地块，不能留空。',
      '新建地图会自动带上 map_info，旧图可以在「校验」里补查。',
    ],
  },
  {
    id: 'terrain',
    title: '绘制 Ground 与 Items',
    goal: '把地形和装饰放到游戏期望的图层。',
    action: '在左侧选地块，用笔刷、矩形或油漆桶绘制 Ground；树木、矿石等放 Items。',
    checkpoint: '状态栏不再提示 Ground 空格；取色器点到地块后左侧会同步到对应地块集。',
    details: [
      '官方地块保存时只写引用名，不把图片塞进 TMX。',
      '自定义 PNG 保存时会写入 embedded_png，游戏可直接读取。',
      '保存时未使用的自定义图块会自动裁剪，减少 TMX 体积。',
    ],
    tip: '查找地块时可以在左侧搜索框输入名称、属性、#局部id 或 gid:全局id。',
  },
  {
    id: 'units',
    title: '摆放单位到 UnitObjects',
    goal: '让游戏加载地图时生成初始单位。',
    action: '按 U 或打开「单位摆放」，选择单位和队伍后在画布点击。',
    checkpoint: '对象组 UnitObjects 中出现带 team 与 unit/customUnit 属性的对象。',
    details: [
      '游戏会扫描对象组中的 unit/customUnit + team 来生成单位。',
      '本编辑器默认写 UnitObjects；旧图里的 Units 仍可兼容读取。',
      '不要把单位当普通图块画在 Ground 或 Items 上。',
    ],
  },
  {
    id: 'triggers',
    title: '配置 Triggers 与 map_info',
    goal: '让任务、镜头、提示和刷兵逻辑有明确入口。',
    action: '按 O 切到对象工具，在「对象」页添加 map_info、unitDetect、unitAdd、objective 等。',
    checkpoint: '触发器对象位于 Triggers 对象组，unitAdd 至少有 team 和 spawnUnits。',
    details: [
      '触发器放到其他对象组时，游戏源码会告警并可能忽略。',
      'map_info 决定地图类型和胜利条件。',
      '任务图通常还需要 objective 或其他激活链路。',
    ],
  },
  {
    id: 'check-save',
    title: '校验并保存',
    goal: '在导出前发现游戏会拒绝或误读的问题。',
    action: '点「校验」逐项处理错误和警告，再点「保存 TMX」。',
    checkpoint: '校验面板没有错误；导出状态提示自定义地块已内嵌并完成优化。',
    details: [
      '校验项可点击跳转到图层、对象或格子。',
      '本地草稿只用于恢复编辑，不替代正式保存。',
      '小地图 M 可快速定位大图区域。',
    ],
  },
]
