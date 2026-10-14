// MCP 工具封装：菜单（对应官方工具 query-meals / query-meal-detail）
// 单位约定：本模块返回的价格一律为「元」（字符串），原样透传，禁止换算
// TODO(第 2 步)：接入 MCP 连接模块后实现真实调用

module.exports = {
  // 查询门店菜单
  async queryMeals({ storeId, keyword } = {}) {
    // TODO(第 2 步)：调用 query-meals；返回 [{ id, name, priceYuan, calorie? }]
    throw new Error('TODO: 第 2 步实现 query-meals')
  },

  // 查询单个餐品详情
  async queryMealDetail({ mealId } = {}) {
    // TODO(第 2 步)：调用 query-meal-detail
    throw new Error('TODO: 第 2 步实现 query-meal-detail')
  }
}
