// MCP 工具封装：营养（官方工具 list-nutrition-foods）
// 用途：按热量上限（千卡）筛选餐品组合
// 官方实测返回：data.data 为 CSV 风格文本，形如
//   "[160]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:
//     猪柳麦满分,null,1288,308,16,16,24,781,213\n ..."
// → 解析为 foods 数组；与菜单的匹配口径是「名称」（productName），非餐品编码
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')

module.exports = {
  // 返回：{ mock, foods: [{ name, calorie, protein, fat, carbohydrate, sodium, calcium }] }
  // 官方 inputSchema（mcp.tools 实拉）：list-nutrition-foods 无入参 ——
  // 真实模式不传任何字段（mealIds 仅做本地过滤，不上送官方）
  async listNutritionFoods({ mealIds } = {}) {
    if (isMockMode()) {
      let list = mockData.nutrition
      if (mealIds && mealIds.length) list = list.filter((f) => mealIds.indexOf(f.mealId) >= 0)
      return { mock: true, foods: list.map((f) => ({ ...f })) }
    }
    const data = await callTool('list-nutrition-foods', {})
    let foods = parseNutritionCsv(data)
    if (mealIds && mealIds.length) foods = foods.filter((f) => mealIds.indexOf(f.name) >= 0)
    return { mock: false, foods }
  }
}

// 解析官方 CSV 文本：首行 [N]{表头}: 之后每行一条「名称,null,千焦,千卡,蛋白,脂肪,碳水,钠,钙」
function parseNutritionCsv(data) {
  const text = data && typeof data.data === 'string' ? data.data : ''
  if (!text) return []
  const headerMatch = text.match(/\{([^}]+)\}/)
  const columns = headerMatch ? headerMatch[1].split(',').map((s) => s.trim()) : []
  const idx = (name) => columns.indexOf(name)
  const iName = idx('productName')
  const iKcal = idx('energyKcal')
  const iProtein = idx('protein')
  const iFat = idx('fat')
  const iCarb = idx('carbohydrate')
  const iSodium = idx('sodium')
  const iCalcium = idx('calcium')
  if (iName < 0) return []
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('[') && !l.includes('{'))
  const foods = []
  rows.forEach((line) => {
    const cells = line.split(',').map((s) => s.trim())
    if (cells.length < columns.length - 1) return // 列数不足视为脏行，跳过
    const name = cells[iName]
    if (!name || name === 'null') return
    foods.push({
      name,
      calorie: numOrNull(cells[iKcal]),        // 量纲：千卡（energyKcal 列）
      protein: numOrNull(cells[iProtein]),
      fat: numOrNull(cells[iFat]),
      carbohydrate: numOrNull(cells[iCarb]),
      sodium: numOrNull(cells[iSodium]),
      calcium: numOrNull(cells[iCalcium])
    })
  })
  return foods
}

// 量纲保护：只接受可解析为数字的值，否则返回 null（不猜单位、不擅自换算）
function numOrNull(v) {
  if (v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}
