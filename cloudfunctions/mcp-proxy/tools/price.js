// MCP 工具封装：算价（对应官方工具 calculate-price）
// ★ 价格单位铁律（全站唯一的换算点）：
//   calculate-price 返回「分」（无引号整数），必须且只能在本文件做一次 ÷100，
//   出参统一为「元」字符串后交给上层；上层与其他工具一律不得再换算。
// TODO(第 2 步)：接入 MCP 连接模块后实现真实调用

// 分 → 元：仅允许在本文件使用
function fenToYuan(fen) {
  const n = Number(fen)
  if (!Number.isInteger(n)) return null // 非整数分视为异常，不猜
  return (n / 100).toFixed(2)
}

module.exports = {
  // 实算价格：入参为门店 + 餐品组合，出参 priceYuan 为「元」字符串且 verified=true
  async calculatePrice({ storeId, items } = {}) {
    // TODO(第 2 步)：调用 calculate-price，拿到分后经 fenToYuan 转元
    throw new Error('TODO: 第 2 步实现 calculate-price')
  },

  // 暴露给测试：验证换算规则（内部使用，不对外调用 MCP）
  _fenToYuan: fenToYuan
}
