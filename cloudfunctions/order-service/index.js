// 订单服务云函数：订单落库与查询（openid 隔离）
// 隔离铁律：
// 1. openid 只从 cloud.getWXContext() 取，绝不接受前端传入的身份字段
// 2. 所有读写强制带 _openid 条件，从机制上杜绝跨人串号
// 3. 不代付、不模拟支付成功：支付与订单状态以麦当劳官方渠道返回为准
const cloud = require('wx-server-sdk')
cloud.init({ env: process.env.TCB_ENV || 'cloud1-d5gheb18zd0b42967' })
const db = cloud.database()
const COLLECTION = 'orders' // 如不存在，第 3 步创建

exports.main = async (event = {}, context) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, code: '401', error: '未获取到用户身份' }
  const action = event.action || ''

  if (action === 'orders.create') {
    // TODO(第 3 步)：写入订单（绑定 _openid），字段：orderId/storeId/amountYuan/status/items/createdAt
    return { ok: false, code: 'TODO', error: '第 3 步实现订单落库' }
  }

  if (action === 'orders.list') {
    // TODO(第 3 步)：仅查询本人订单
    const res = await db.collection(COLLECTION).where({ _openid: OPENID }).limit(20).get().catch(() => null)
    if (!res) return { ok: false, code: 'DB', error: '订单集合暂不可用（第 3 步创建）' }
    return { ok: true, orders: res.data || [] }
  }

  if (action === 'orders.get') {
    // TODO(第 3 步)：按 orderId + _openid 精确查询
    return { ok: false, code: 'TODO', error: '第 3 步实现订单查询' }
  }

  return { ok: false, code: 'UNKNOWN', error: 'unknown action', action }
}
