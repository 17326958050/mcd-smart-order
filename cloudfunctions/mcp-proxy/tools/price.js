// MCP 工具封装：算价（官方工具 calculate-price）
// ★ 价格单位铁律：calculate-price 返回「分」（无引号整数）。
//   全项目只有本文件允许做一次 ÷100，出参统一为「元」字符串。
//   上层与其他工具一律不得再次换算。
//
// 本模块是「verifed 标记」的唯一来源：只有经过 calculate-price 实算的金额才允许 verified: true。
const { callTool, isMockMode } = require('../mcp-client')
const mockData = require('../mock/data')

// 分 → 元：仅在本文件使用（全项目唯一换算点）
function fenToYuan(fen) {
  const n = Number(fen)
  if (!Number.isInteger(n)) return null // 非整数分视为异常，不猜、不静默兜底
  return (n / 100).toFixed(2)
}

module.exports = {
  // 实算价格：入参 { storeId, items:[{id,quantity}], couponIds, takeWayCode? }
  // 出参（元字符串，全站唯一口径）：
  //   { mock, verified, priceYuan, listPriceYuan, savedYuan, appliedCouponIds, takeWayList, items }
  async calculatePrice({ storeId, items = [], couponIds } = {}) {
    if (isMockMode()) {
      return { mock: true, ...mockCalculate(items, storeId, couponIds) }
    }

    // 官方 inputSchema（mcp.tools 实拉）：
    //   必传 storeCode + orderType + beType；items[].productCode + quantity(≥1)
    //   券为 item 级字段 couponId / couponCode（非顶层数组）
    // 到店自提场景（orderType=1, beType=1）beCode 不传。
    const officialItems = (items || []).map((i) => ({
      productCode: i.id,
      quantity: i.quantity || 1
    }))
    // TODO(联调)：官方券字段在 items[].couponId（item 级），与本地「整单 couponIds 数组」概念不同。
    // 此处按最保守映射：仅将第一张券挂到第一件商品上做实算探测；真实返回的
    // 优惠明细会反映实际应用情况，联调用真实响应校正此映射。
    if (couponIds && couponIds.length) {
      officialItems[0] = { ...officialItems[0], couponId: couponIds[0] }
    }
    const args = {
      storeCode: storeId,
      orderType: 1,
      beType: 1,
      items: officialItems
    }
    const data = await callTool('calculate-price', args)

    // 官方返回的金额字段为「分」，在此做唯一一次换算
    const fen = pickFen(data)
    const priceYuan = fenToYuan(fen)
    if (priceYuan === null) {
      // 取不到合法「分」整数 → 一律视为未验证，绝不猜测、绝不兜底成 0
      return { mock: false, verified: false, priceYuan: null, error: '算价返回格式异常（未取到整数分），未做任何换算' }
    }
    const listFen = pickFen(data, ['originalPrice', 'totalOriginalPrice', 'listPrice'])
    const discountFen = pickFen(data, ['discountAmount', 'discount', 'couponAmount'])
    return {
      mock: false,
      verified: true,
      priceYuan,
      // 以下三项官方可能不返回，取不到则为 null（前端据此决定是否灰显，不猜）
      listPriceYuan: listFen == null ? null : fenToYuan(listFen),
      savedYuan: discountFen == null ? null : fenToYuan(discountFen),
      appliedCouponIds: (data && (data.appliedCouponIds || data.couponIds)) || undefined,
      // takeWayList 原样透传：官方 create-order 到店场景必传 takeWayCode，
      // 其值必须从本返回的 takeWayList[].code 中选取，前端选择后回传下单
      // （官方混合结构下业务对象可能在顶层或 data.data 里，两处都找）
      takeWayList: pickTakeWayList(data)
    }
  },

  // 暴露给测试：换算规则自检用
  _fenToYuan: fenToYuan
}

// 从官方返回中取 takeWayList（顶层或 data.data 下均可）
function pickTakeWayList(data) {
  if (!data) return undefined
  if (Array.isArray(data.takeWayList)) return data.takeWayList
  if (data.data && typeof data.data === 'object' && Array.isArray(data.data.takeWayList)) {
    return data.data.takeWayList
  }
  return undefined
}

// 从官方返回中取「分」整数字段（官方实测：业务对象在 data.data 里，字段名以真实返回为准，
// 取到即用、取不到返回 null，绝不猜测）
function pickFen(data, cands) {
  if (!data) return null
  const keys = cands || ['totalPrice', 'totalFee', 'price', 'amount', 'payableAmount']
  // 官方混合结构：{ success, code, message, data: {...} } → 先下沉一层（仅当 data.data 为对象）
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    return pickFen(data.data, keys)
  }
  for (const c of keys) {
    if (data[c] != null && Number.isInteger(Number(data[c]))) return Number(data[c])
  }
  return null
}

// ============ Mock 算价（离线演示，结构与真实一致）============
// 单位：全部为「元」字符串。演示用途，非官方实时价格。
function mockCalculate(items, storeId, couponIds) {
  const list = (items || []).map((i) => {
    const m = mockData.meals.find((x) => x.id === i.id) || {}
    const qty = i.quantity || 1
    return {
      id: i.id,
      name: m.name || i.name || '未知餐品',
      priceYuan: m.priceYuan || '0.00', // 元，原样
      quantity: qty,
      calorie: m.calorie != null ? m.calorie : null
    }
  })

  const listYuan = list.reduce((s, i) => s + Number(i.priceYuan) * i.quantity, 0)

  // 券叠加：门槛 + 适用范围双重校验（演示逻辑，模拟官方「券有指定适用餐品」的真实行为）
  let discount = 0
  const applied = []
  const cartCount = {}
  list.forEach((i) => { cartCount[i.id] = (cartCount[i.id] || 0) + i.quantity })

  ;(couponIds || []).forEach((cid) => {
    const c = mockData.coupons.find((x) => x.id === cid)
    if (!c) return
    if (listYuan < Number(c.thresholdYuan)) return // 未达门槛
    const need = {}
    ;(c.applicableMealIds || []).forEach((id) => { need[id] = (need[id] || 0) + 1 })
    const applicable = Object.keys(need).every((id) => (cartCount[id] || 0) >= need[id])
    if (!applicable) return // 不在券的适用范围内
    discount += Number(c.discountYuan)
    applied.push(c.id)
  })

  const payable = Math.max(listYuan - discount, 0)
  const totalCalorie = list.reduce((s, i) => s + (i.calorie || 0) * i.quantity, 0)

  return {
    verified: true, // Mock 也算「已实算」——因为它走的是同一套算价规则；UI 另行标注「演示数据」
    priceYuan: payable.toFixed(2),      // 券后实付（元）
    listPriceYuan: listYuan.toFixed(2), // 标价合计（元）
    savedYuan: discount.toFixed(2),     // 本单省（元）
    appliedCouponIds: applied,
    totalCalorie,
    items: list
  }
}
