/**
 * 铁锈战争内置单位清单。
 * 来源：反编译源码 com/corrodinggames/rts/game/units/ar.java 枚举
 * （其中 editorOrBuilder / dummyNonUnitWithTeam 为内部占位，不建议地图使用）
 */
export interface BuiltinUnit {
  name: string
  label: string
  category: '建筑' | '陆军' | '海军' | '空军' | '实验' | '其他'
}

export const BUILTIN_UNITS: BuiltinUnit[] = [
  { name: 'commandCenter', label: '指挥中心', category: '建筑' },
  { name: 'landFactory', label: '陆军工厂', category: '建筑' },
  { name: 'airFactory', label: '空军工厂', category: '建筑' },
  { name: 'seaFactory', label: '海军工厂', category: '建筑' },
  { name: 'extractor', label: '资源采集器', category: '建筑' },
  { name: 'turret', label: '炮塔', category: '建筑' },
  { name: 'turretT2', label: '炮塔 T2', category: '建筑' },
  { name: 'turretT3', label: '炮塔 T3', category: '建筑' },
  { name: 'antiAirTurret', label: '防空炮塔', category: '建筑' },
  { name: 'antiAirTurretT2', label: '防空炮塔 T2', category: '建筑' },
  { name: 'turret_artillery', label: '重炮炮塔', category: '建筑' },
  { name: 'turret_flamethrower', label: '喷火炮塔', category: '建筑' },
  { name: 'laserDefence', label: '激光防御', category: '建筑' },
  { name: 'repairbay', label: '维修站', category: '建筑' },
  { name: 'supplyDepot', label: '补给站', category: '建筑' },
  { name: 'fabricator', label: '制造机', category: '建筑' },
  { name: 'experimentalLandFactory', label: '实验工厂', category: '建筑' },
  { name: 'NukeLaucher', label: '核弹发射井', category: '建筑' },
  { name: 'AntiNukeLaucher', label: '反核导弹井', category: '建筑' },
  { name: 'wall_v', label: '围墙', category: '建筑' },
  { name: 'builder', label: '工程车', category: '陆军' },
  { name: 'tank', label: '坦克', category: '陆军' },
  { name: 'heavyTank', label: '重型坦克', category: '陆军' },
  { name: 'megaTank', label: '巨型坦克', category: '陆军' },
  { name: 'laserTank', label: '激光坦克', category: '陆军' },
  { name: 'tankDestroyer', label: '坦克歼击车', category: '陆军' },
  { name: 'artillery', label: '火炮', category: '陆军' },
  { name: 'mammothTank', label: '猛犸坦克', category: '陆军' },
  { name: 'ladybug', label: '瓢虫', category: '陆军' },
  { name: 'hoverTank', label: '悬浮坦克', category: '陆军' },
  { name: 'heavyHoverTank', label: '重型悬浮坦克', category: '陆军' },
  { name: 'hovercraft', label: '气垫船', category: '海军' },
  { name: 'gunBoat', label: '炮艇', category: '海军' },
  { name: 'missileShip', label: '导弹舰', category: '海军' },
  { name: 'battleShip', label: '战列舰', category: '海军' },
  { name: 'attackSubmarine', label: '攻击潜艇', category: '海军' },
  { name: 'builderShip', label: '工程船', category: '海军' },
  { name: 'scoutShip', label: '侦察船', category: '海军' },
  { name: 'helicopter', label: '直升机', category: '空军' },
  { name: 'airShip', label: '飞艇', category: '空军' },
  { name: 'gunShip', label: '武装飞艇', category: '空军' },
  { name: 'dropship', label: '运输机', category: '空军' },
  { name: 'amphibiousJet', label: '两栖战机', category: '空军' },
  { name: 'missileAirship', label: '导弹飞艇', category: '空军' },
  { name: 'experimentalTank', label: '实验坦克', category: '实验' },
  { name: 'experimentalHoverTank', label: '实验悬浮坦克', category: '实验' },
  { name: 'experimentalSpider', label: '实验蜘蛛', category: '实验' },
  { name: 'tree', label: '树（中立装饰）', category: '其他' },
  { name: 'crystalResource', label: '水晶资源', category: '其他' },
  { name: 'fogRevealer', label: '视野揭示器', category: '其他' },
  { name: 'spreadingFire', label: '蔓延火焰', category: '其他' },
  { name: 'damagingBorder', label: '伤害边界', category: '其他' },
  { name: 'zoneMarker', label: '区域标记', category: '其他' },
]

export const UNIT_NAME_SET = new Set(BUILTIN_UNITS.map((u) => u.name))
