# TMX Web Edit

铁锈战争（Rusted Warfare）**网页版 TMX 地图编辑器**。基于 Vue 3 + TypeScript + Canvas，纯前端运行，
打开/编辑/保存游戏可直接读取的 `.tmx` 地图，无需安装 Tiled。

编辑器的格式与规则全部对照游戏反编译源码实现
（`TiledMap.java` / `TileSet.java` / `Layer.java` / `MissionEngine.java` 等），保证与游戏行为一致。

## 功能

### 地形编辑
- 打开 / 新建 / 保存 `.tmx`（图层数据输出 base64 + zlib，游戏原生支持）
- 笔刷、橡皮、矩形填充、油漆桶、取色器；地块面板拖选多格作为图章
- 图层管理：新建/删除/排序/重命名/显隐（Ground、Items、GroundDetails、units 等）
- 地图尺寸调整、地图级自定义属性编辑
- 撤销 / 重做（Ctrl+Z / Ctrl+Y）
- 大地图性能优化：低缩放使用平均色纹理，高缩放仅绘制可见区域

### 地块集（关键规则）
- **游戏内置地块**（草地、沙漠、水、桥、units.tsx 等 152 张官方图）：
  保存时只写文件名引用（`<image source="xxx.png">` 或 `<tileset source="xxx.tsx">`），**不内嵌图片数据** ——
  游戏会自动从自身 `assets/tilesets/bitmaps/` 加载；
- **玩家导入的自定义地块**（非官方 PNG）：
  保存时自动以 `embedded_png` 属性（base64 PNG）**内嵌进 TMX**，对应游戏 `TileSet.java` 的 `[EMBED]` 机制；
- 打开的地图若引用了缺失图片的地块集，可一键补充 PNG 自动转为内嵌。

### 触发器系统（对照 MissionEngine 源码完整支持）
- 触发条件：`unitDetect`（单位检测，全部过滤属性）、`teamTagDetect`、`basic`、`objective`
- 动作：`unitAdd`（spawnUnits 语法）、`unitRemove`、`move`（point 目标 + unload）、
  `changeCredits`、`teamTags`、`mapText`、`moveCamera`
- 通用属性：`id`、`delay`、`warmup`、`repeatDelay`、`repeatCount`、`resetActivationAfter`、
  `allToActivate`、`activatedBy`、`alsoActivate`、`deactivatedBy`、`globalMessage`（含本地化后缀）等
- 标记/配置对象：`map_info`（地图类型/胜利条件/迷雾/简报/生存波次）、`team_info`（资金/AI/结盟）、
  `point`、`camera_start`、`camera_pan`、`attack_point`、`rotate`、`fall`、`set_team`、
  `ai_allow_full_use`、`disable_unit_ai`
- 表单化编辑 + 任意自定义属性增删；对象在画布可视化叠加、拖拽移动/缩放
- 内置单位名自动补全（52 个官方单位）；`spawnUnits` / 生存波次支持可视化点选单位

### 生存模式（对照 MissionEngine / g.java）
- 顶部「生存时间轴」(快捷键 T)：可视化编辑 `survivalWaves` 波次公告与 `unitAdd` 定时刷兵
- 波次格式：`+M:SS 说明 [lockSpawn] - 3 tank, 2 heavyTank`；单位可从内置列表点选
- 刷兵：`warmup` / `delay` / `repeatDelay` 落在时间轴上；`spawnUnits` 点选单位（`tank*3` 语法）
- 新建 survival 图自动带 `winCondition`、`survivalWaves` 样例、`attack_point`、`team_info ai=survival`
- 校验：坏波次行 / 缺进攻点 / 缺 survival AI 队伍

### 校验
状态栏与「校验」面板实时提示游戏硬性要求：Ground / Items 图层必须存在、Ground 不能有空格、
Triggers 组与 map_info 建议存在、unitAdd 缺 team/spawnUnits 等；点击问题可跳转到对应位置。

### 进阶编辑
- **小地图**（M）：左下角缩略图，点击/拖拽跳转视口
- **单位摆放**（U）：从内置单位列表选取，画布点击放置到 UnitObjects/Triggers
- **复制粘贴**：Ctrl+C / Ctrl+V 复制对象或当前图章；Ctrl+D 快速复制选中对象
- **本地草稿**：脏数据每 30 秒自动写入 localStorage，下次打开可恢复

## 开发

```bash
npm install
npm run dev          # 开发服务器（无防逆向，便于调试）
npm run build        # 类型检查 + 生产构建 + JS 混淆
npm run build:plain  # 仅 Vite 构建（不二次混淆，便于排查）
npm test             # TMX 解析/序列化往返测试
npm run sync-assets  # 从游戏资源目录重新生成内置地块清单（可选）
```

### 生产防逆向（提高门槛，非绝对安全）

`npm run build` 默认启用多层防护：

1. **构建层**：关闭 sourcemap、terser 压缩/mangle、剥离 `console`/`debugger`、哈希化资源文件名  
2. **混淆层**：`scripts/obfuscate-dist.mjs` 对 `dist/assets/*.js` 做 stringArray / 控制流 / selfDefending 等混淆  
3. **运行时**：生产环境屏蔽右键与常见开发者工具快捷键，并做 DevTools 尺寸启发式打断  

前端代码最终仍会下发到浏览器，无法做到“不可逆向”；部署时请勿把开发用 `.map` 或源码仓库一并公开。

`public/tilesets/bitmaps/` 与 `src/game/builtin-tilesets.json` 由 `scripts/sync-game-assets.mjs`
从游戏官方资源生成（默认读取 `../../tilesets`，也可传入自定义路径）。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| B / E / R / F / I / O / U | 笔刷 / 橡皮 / 矩形 / 油漆桶 / 取色 / 对象 / 单位 |
| 空格拖拽 / 中键 | 平移视图 |
| 滚轮 | 缩放 |
| G / H / M | 网格 / 对象显隐 / 小地图 |
| Ctrl+Z / Ctrl+Y | 撤销 / 重做 |
| Ctrl+C / Ctrl+V / Ctrl+D | 复制 / 粘贴 / 复制并粘贴对象 |
| Ctrl+O / Ctrl+S | 打开 / 保存 |
| T | 开关生存时间轴 |
| Delete | 删除选中对象 |
| 右键绘制 | 擦除 |
