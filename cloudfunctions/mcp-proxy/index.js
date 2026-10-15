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
const mcpClient = require('./mcp-client')
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
      case 'menu.recommend':
        // 组合推荐：菜单 + 营养 + 券 → 逐个 calculate-price 实算 → 按实付排序
        return ok(await menuTools.recommendCombos(payload))
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
        // 仅查询模式拦截（双重防护的第二层，不信任前端传来的开关）
        const r = await orderTools.createOrder({ ...payload, queryOnlyMode: resolveQueryOnly() })
        return r && r.ok === false ? { ok: false, code: r.code, error: r.error } : ok(r)
      }
      case 'order.query':
        return ok(await orderTools.queryOrder(payload))
      case 'order.cancel':
        return ok(await orderTools.cancelOrder(payload))
      case 'order.list':
        return ok(await orderTools.orderList(payload))
      // 凭证自检（配好 MCP_TOKEN 后的验证入口，只读）
      // 只回报「是否配好 / 能否握手 / 官方工具数量」，绝不回传 Token 本身、长度或任何片段
      case 'mcp.status': {
        if (!mcpClient.readToken()) {
          return ok({
            mock: true,
            hasToken: false,
            handshake: 'skipped',
            toolCount: 0,
            note: '未配置 MCP_TOKEN，当前为离线演示（Mock）模式'
          })
        }
        const tools = await mcpClient.listTools() // Token 无效时抛 401，由下方 catch 统一透出
        return ok({
          mock: false,
          hasToken: true,
          handshake: 'ok',
          toolCount: tools.length,
          note: 'MCP_TOKEN 已生效，真实接口可用'
        })
      }
      // 联调辅助：拉取官方工具清单与 inputSchema（只读，用于校正入参字段，不回传凭证）
      case 'mcp.tools': {
        if (isMockMode()) {
          return ok({ mock: true, tools: [], note: '未配置 MCP_TOKEN，无法获取官方工具清单（仅查询模式，不猜测）' })
        }
        const tools = await mcpClient.listTools()
        return ok({ mock: false, tools })
      }
      // 联调辅助：透传官方查询类工具的原始返回（只读）
      // 用途：解析层字段名校正（normalize* / pickFen 系列均以真实返回为准，不做猜测）
      // 安全：① 仅白名单查询类工具，交易类一律拒绝 ② 返回体过脱敏器（剥离手机号等个人信息）
      //       ③ 与 mcp.tools 一样不回传任何凭证
      case 'mcp.raw': {
        const RAW_WHITELIST = ['query-nearby-stores', 'query-meals', 'query-meal-detail',
          'calculate-price', 'query-store-coupons', 'list-nutrition-foods', 'query-order', 'order-list']
        const toolName = String(payload.tool || '')
        if (!RAW_WHITELIST.includes(toolName)) {
          return { ok: false, code: 'RAW_FORBIDDEN', error: 'mcp.raw 仅允许查询类工具：' + RAW_WHITELIST.join(' / ') }
        }
        if (isMockMode()) {
          return ok({ mock: true, note: '未配置 MCP_TOKEN，mcp.raw 不可用' })
        }
        const data = await mcpClient.callTool(toolName, payload.args || {})
        return ok({ mock: false, tool: toolName, data: sanitizeRaw(data) })
      }
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

// mcp.raw 返回体脱敏：递归剥离疑似个人信息字段（手机号等），其余原样
const SENSITIVE_KEY_RE = /^(phone|mobile|phoneNumber|tel|telephone|contactPhone)$/i
function sanitizeRaw(value) {
  if (Array.isArray(value)) return value.map(sanitizeRaw)
  if (value && typeof value === 'object') {
    const out = {}
    Object.keys(value).forEach((k) => {
      if (SENSITIVE_KEY_RE.test(k)) { out[k] = '[已脱敏]'; return }
      out[k] = sanitizeRaw(value[k])
    })
    return out
  }
  return value
}

// 「是否只允许查询」的唯一判定处（双重防护的第二层）
//   1. 环境变量 QUERY_ONLY_MODE 显式设为 'false' → 允许真实下单（默认不允许）
//   2. 未配置 MCP_TOKEN（Mock 模式）→ 不存在真实下单可能：Mock 订单不向官方发起任何请求、
//      也不返回任何支付参数，因此为便于离线演示完整链路而放行
//   3. 其余情况（配了 Token 但没显式放行）→ 一律拦截
// 前端开关只影响交互文案，最终以下面这个判定为准。
function resolveQueryOnly() {
  const flag = String(process.env.QUERY_ONLY_MODE || '').toLowerCase()
  if (flag === 'false') return false
  return !isMockMode()
}

// 暴露给本地单测（云函数运行时无副作用）
exports._resolveQueryOnly = resolveQueryOnly
