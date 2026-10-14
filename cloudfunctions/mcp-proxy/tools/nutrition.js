// MCP 工具封装：营养（对应官方工具 list-nutrition-foods）
// 用途：按热量上限筛选餐品组合（量纲：千卡）
// TODO(第 3 步)：接入 MCP 连接模块后实现真实调用

module.exports = {
  // 餐品营养列表：返回 [{ mealId, name, calorie, protein, fat, carbohydrate, sodium, calcium }]
  async listNutritionFoods({ mealIds } = {}) {
    // TODO(第 3 步)：调用 list-nutrition-foods
    throw new Error('TODO: 第 3 步实现 list-nutrition-foods')
  }
}
