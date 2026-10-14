// 订单服务云函数：订单落库与查询（openid 隔离）
// 隔离铁律：
//   1. openid 只从 cloud.getWXContext() 取，绝不接受前端传入的身份字段
//   2. 所有写入显式带 _openid，所有查询强制 where({_openid})，从机制上杜绝跨人串号
//   3. 不代付、不模拟支付成功：支付与订单状态以麦当劳官方渠道返回为准，
//      本函数只做「记录」，不做任何支付动作
//   4. 金额一律为「元」（字符串），与全站单位规则一致，不做换算
const cloud = require('wx-server-sdk')
cloud.init({ env: process.env.TCB_ENV || 'cloud1-d5gheb18zd0b42967' })
const db = cloud.database()
const COLLECTION = 'orders'

// 集合不存在时自动创建（首次调用会执行一次，之后静默跳过）
let collectionReady = false
async function ensureCollection() {
  if (collectionReady) return true
  try {
    await db.createCollection(COLLECTION)
  } catch (e) {
    // -501001 / 已存在：忽略；其余错误交给调用方判断
    const msg = String((e && e.errMsg) || (e && e.message) || e)
    if (msg.indexOf('exist') < 0 && msg.indexOf('已存在') < 0 && msg.indexOf('-501001') < 0) {
      // 创建失败但可能已存在，继续尝试读写，不阻断主流程
    }
  }
  collectionReady = true
  return true
}

exports.main = async (event = {}, context) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, code: '401', error: '未获取到用户身份（openid 为空）' }
  const action = event.action || ''
  const payload = event.payload || {}

  try {
    if (action === 'orders.create') {
      return await createOrder(OPENID, payload)
    }
    if (action === 'orders.get') {
      return await getOrder(OPENID, payload)
    }
    if (action === 'orders.list') {
      return await listOrders(OPENID, payload)
    }
  } catch (e) {
    return { ok: false, code: 'DB', error: '订单数据库操作失败：' + String((e && e.message) || e) }
  }

  return { ok: false, code: 'UNKNOWN', error: 'unknown action', action }
}

// 写入订单（幂等：同一 orderId 重复提交只更新时间与状态，不产生重复记录）
async function createOrder(openid, p) {
  const orderId = String(p.orderId || '').trim()
  if (!orderId) return { ok: false, code: 'PARAM', error: '缺少订单号 orderId' }

  await ensureCollection()

  const doc = {
    orderId,
    storeId: p.storeId || null,
    storeName: p.storeName || null,
    items: Array.isArray(p.items) ? p.items.map(sanitizeItem) : [],
    listPriceYuan: yuanStr(p.listPriceYuan),   // 标价合计（元）
    finalPriceYuan: yuanStr(p.finalPriceYuan), // 券后实付（元）
    savedYuan: yuanStr(p.savedYuan) || '0.00', // 本单省（元）
    appliedCouponIds: Array.isArray(p.appliedCouponIds) ? p.appliedCouponIds.slice(0, 20) : [],
    status: String(p.status || 'UNKNOWN'),     // 状态以官方返回为准，本函数不臆造
    source: p.source === 'mcp' ? 'mcp' : 'mock',
    updatedAt: Date.now()
  }

  const existing = await db.collection(COLLECTION)
    .where({ _openid: openid, orderId })
    .limit(1)
    .get()

  if (existing.data && existing.data.length) {
    await db.collection(COLLECTION).doc(existing.data[0]._id).update({ data: doc })
    return { ok: true, saved: true, updated: true, orderId }
  }

  // _openid 必须显式写入：云函数端 add 不会自动注入 _openid
  await db.collection(COLLECTION).add({ data: { ...doc, _openid: openid, createdAt: Date.now() } })
  return { ok: true, saved: true, created: true, orderId }
}

// 按 orderId + _openid 精确查询（只能查到自己那一条）
async function getOrder(openid, p) {
  const orderId = String(p.orderId || '').trim()
  if (!orderId) return { ok: false, code: 'PARAM', error: '缺少订单号 orderId' }
  await ensureCollection()
  const res = await db.collection(COLLECTION)
    .where({ _openid: openid, orderId })
    .limit(1)
    .get()
  return { ok: true, order: (res.data && res.data[0]) || null }
}

// 本人订单列表（倒序）
async function listOrders(openid, p) {
  await ensureCollection()
  const limit = Math.min(Math.max(Number(p.limit) || 20, 1), 50)
  const res = await db.collection(COLLECTION)
    .where({ _openid: openid })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  // 出参不回带 _openid（前端不需要，也减少身份信息流转）
  const orders = (res.data || []).map((o) => {
    const { _openid, _id, ...rest } = o
    return rest
  })
  return { ok: true, orders }
}

// 只保留订单展示所需字段，防止前端塞入无关/超长内容
function sanitizeItem(i) {
  if (!i || typeof i !== 'object') return { id: '', name: '', priceYuan: '0.00', quantity: 1 }
  return {
    id: String(i.id || '').slice(0, 64),
    name: String(i.name || '').slice(0, 64),
    priceYuan: yuanStr(i.priceYuan) || '0.00', // 元字符串，原样
    quantity: Math.min(Math.max(Number(i.quantity) || 1, 1), 99)
  }
}

// 金额格式守卫：只接受「元」字符串/数字，统一保留两位小数；非法值返回 null
function yuanStr(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  if (Number.isNaN(n)) return null
  return n.toFixed(2)
}
