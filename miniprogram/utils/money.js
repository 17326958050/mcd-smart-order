// 价格单位铁律（最高优先级）：
// 1. 全站只允许出现「元」
// 2. 唯一允许「分→元」换算的地方是云函数 mcp-proxy/tools/price.js（calculate-price 返回分）
// 3. 其余接口返回的「元」字符串原样使用，本文件不做任何单位猜测或二次换算

// 格式化展示：输入「元」（字符串或数字），输出带两位小数的展示串
// 示例：'12.5' → '12.50'；'0' → '0.00'
// 空值（null / undefined / '' / 纯空白）一律返回占位符 '--'：
// 绝不让「没有金额」被显示成 ¥0.00 —— 那会被误解为「不用花钱」
function formatYuan(yuan) {
  if (yuan == null) return '--'
  const s = String(yuan).trim()
  if (s === '') return '--'
  const n = Number(s)
  if (Number.isNaN(n)) return '--' // 非法值不猜、不换算，直接占位
  return n.toFixed(2)
}

// 计算省钱金额：标价合计（元） - 实付合计（元），输入均为「元」字符串
// 返回「元」字符串；任一参数缺失/非法则返回 null（由调用方决定灰显），
// 绝不用 0 代替「算不出来」——那样会被读成「没省钱」
function savedAmount(listPriceYuan, finalPriceYuan) {
  const a = toNumberOrNull(listPriceYuan)
  const b = toNumberOrNull(finalPriceYuan)
  if (a === null || b === null) return null
  const diff = a - b
  return diff > 0 ? diff.toFixed(2) : '0.00'
}

// 严格数值转换：空值/非法值 → null（不做隐式 0 转换）
function toNumberOrNull(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

module.exports = { formatYuan, savedAmount, toNumberOrNull }
