// MCP 工具封装：菜单（官方工具 query-meals / query-meal-detail）
// ★ 单位约定：官方返回的价格为「元」（字符串）→ 原样透传，禁止任何换算
// 行为：有 Token 走真实接口；无 Token 且 Mock 开启时返回离线演示数据
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')

module.exports = {
  // 查询门店菜单
  // 返回：{ mock, meals: [{ id, name, priceYuan, calorie? }] }
  async queryMeals({ storeId, keyword } = {}) {
    if (isMockMode()) {
      let list = mockData.meals
      if (keyword) list = list.filter((m) => m.name.indexOf(keyword) >= 0)
      return { mock: true, meals: list.map((m) => ({ ...m })) }
    }
    const data = await callTool('query-meals', { storeId, ...(keyword ? { keyword } : {}) })
    return { mock: false, meals: normalizeMeals(data) }
  },

  // 查询单个餐品详情
  async queryMealDetail({ mealId, storeId } = {}) {
    if (isMockMode()) {
      const m = mockData.meals.find((x) => x.id === mealId)
      return { mock: true, meal: m ? { ...m } : null }
    }
    const data = await callTool('query-meal-detail', { mealId, storeId })
    return { mock: false, meal: normalizeMeal(data && (data.meal || data)) }
  }
}

// 归一化餐品：价格字段一律取「元」字符串原样，不做 ÷100 或任何换算
function normalizeMeal(m) {
  if (!m) return null
  return {
    id: m.mealId || m.id || m.productCode,
    name: m.mealName || m.name || m.productName,
    priceYuan: m.price != null ? String(m.price) : (m.priceYuan != null ? String(m.priceYuan) : undefined),
    calorie: m.calorie != null ? m.calorie : undefined
  }
}

function normalizeMeals(data) {
  const raw = (data && (data.meals || data.list || data.data)) || []
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeMeal).filter(Boolean)
}
