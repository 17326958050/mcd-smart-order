// 价格单位铁律（最高优先级）：
// 1. 全站只允许出现「元」
// 2. 唯一允许「分→元」换算的地方是云函数 mcp-proxy/tools/price.js（calculate-price 返回分）
// 3. 其余接口返回的「元」字符串原样使用，本文件不做任何单位猜测或二次换算

// 格式化展示：输入「元」（字符串或数字），输出带两位小数的展示串
// 示例：'12.5' → '12.50'；'0' → '0.00'
function formatYuan(yuan) {
  const n = Number(yuan)
  if (Number.isNaN(n)) return '--' // 非法值不猜、不换算，直接占位
  return n.toFixed(2)
}

// 计算省钱金额：标价合计（元） - 实付合计（元），输入均为「元」字符串
// 返回「元」字符串；任一非法返回 null，由调用方决定灰显
function savedAmount(listPriceYuan, finalPriceYuan) {
  const a = Number(listPriceYuan)
  const b = Number(finalPriceYuan)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  const diff = a - b
  return diff > 0 ? diff.toFixed(2) : '0.00'
}

module.exports = { formatYuan, savedAmount }
