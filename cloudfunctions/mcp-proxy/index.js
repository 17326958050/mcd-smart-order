// 云函数 mcp-proxy：小程序与麦当劳 MCP 之间的唯一通道
// 安全铁律：
// 1. MCP Token 只存在于本云函数的环境变量 MCP_TOKEN，前端不接触、不落文件
// 2. 前端禁止 wx.request 直连 https://mcp.mcd.cn，一切经本函数中转
// 3. 401 不重试，直接报错提示重新配置凭证
const cloud = require('wx-server-sdk')
cloud.init({ env: process.env.TCB_ENV || 'cloud1-d5gheb18zd0b42967' })
const db = cloud.database()

const storeTools = require('./tools/store')
const menuTools = require('./tools/menu')
const priceTools = require('./tools/price')
const orderTools = require('./tools/order')
const couponTools = require('./tools/coupon')
const nutritionTools = require('./tools/nutrition')
const { isMockMode } = require('./mcp-client')

exports.main = async (event = {}, context) => {
  const action = (event && event.action) || ''
  const wxContext = cloud.getWXContext()
  const openid = String(wxContext.OPENID || '')
  const appid = String(wxContext.APPID || '')

  // ===== 连通性自检（行为保持不变，第 0 步验证依赖它）=====
  if (action === 'ping') {
    return {
      ok: true,
      env: process.env.MY_ENV_ID || 'env-not-set',
      openid,
      appid,
      timestamp: Date.now()
    }
  }

  // ===== 运行参数（前端可读取当前模式，不涉及任何凭证）=====
  if (action === 'config.flags') {
    return { ok: true, mock: isMockMode(), hasToken: !!process.env.MCP_TOKEN }
  }

  // ===== 业务路由 =====
  try {
    const payload = event.payload || {}

    switch (action) {
      case 'store.queryNearby':
        return ok(await storeTools.queryNearbyStores(payload))
      case 'store.queryDelivery':
        return ok(await storeTools.queryDeliveryStores(payload))
      case 'menu.queryMeals':
        return ok(await menuTools.queryMeals(payload))
      case 'menu.queryDetail':
        return ok(await menuTools.queryMealDetail(payload))
      case 'nutrition.list':
        return ok(await nutritionTools.listNutritionFoods(payload))
      case 'price.calculate':
        return ok(await priceTools.calculatePrice(payload))
      case 'coupon.store':
        return ok(await couponTools.queryStoreCoupons(payload))
      case 'coupon.available':
        return ok(await couponTools.availableCoupons(payload))
      case 'coupon.bind':
        return ok(await couponTools.autoBindCoupons(payload))
      case 'coupon.mine':
        return ok(await couponTools.queryMyCoupons())
      case 'order.create': {
        // 仅查询模式拦截：以后端环境变量为准，不信任前端传来的开关
        const queryOnly = process.env.QUERY_ONLY_MODE !== 'false'
        const r = await orderTools.createOrder({ ...payload, queryOnlyMode: queryOnly })
        return r && r.ok === false ? { ok: false, code: r.code, error: r.error } : ok(r)
      }
      case 'order.query':
        return ok(await orderTools.queryOrder(payload))
      case 'order.cancel':
        return ok(await orderTools.cancelOrder(payload))
      case 'order.list':
        return ok(await orderTools.orderList(payload))
      default:
        return { ok: false, error: 'unknown action', action }
    }
  } catch (e) {
    // 统一错误映射：401 / 429 / TIMEOUT 等原样透出，交由前端提示文案处理
    const code = e && e.code ? e.code : 'UNKNOWN'
    const message = e && e.message ? e.message : '服务异常'
    return { ok: false, code, error: message }
  }
}

// 包装成功返回
function ok(data) {
  return { ok: true, ...(data || {}) }
}
