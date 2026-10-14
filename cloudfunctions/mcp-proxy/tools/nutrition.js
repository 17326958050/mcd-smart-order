// MCP 工具封装：营养（官方工具 list-nutrition-foods）
// 用途：按热量上限（千卡）筛选餐品组合
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')

module.exports = {
  // 返回：{ mock, foods: [{ mealId, name, calorie, protein, fat, carbohydrate, sodium, calcium }] }
  async listNutritionFoods({ mealIds } = {}) {
    if (isMockMode()) {
      let list = mockData.nutrition
      if (mealIds && mealIds.length) list = list.filter((f) => mealIds.indexOf(f.mealId) >= 0)
      return { mock: true, foods: list.map((f) => ({ ...f })) }
    }
    const data = await callTool('list-nutrition-foods', mealIds && mealIds.length ? { mealIds } : {})
    const raw = (data && (data.foods || data.list || data.data)) || []
    const foods = Array.isArray(raw)
      ? raw.map((f) => ({
          mealId: f.mealId || f.id || f.productCode,
          name: f.mealName || f.name || f.productName,
          calorie: numOrNull(f.calorie != null ? f.calorie : f.energy), // 量纲：千卡
          protein: numOrNull(f.protein),
          fat: numOrNull(f.fat),
          carbohydrate: numOrNull(f.carbohydrate),
          sodium: numOrNull(f.sodium),
          calcium: numOrNull(f.calcium)
        }))
      : []
    return { mock: false, foods }
  }
}

// 量纲保护：只接受可解析为数字的值，否则返回 null（不猜单位、不擅自换算）
function numOrNull(v) {
  if (v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}
