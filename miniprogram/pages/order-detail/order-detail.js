// 订单详情页：双源核对
//   ① mcp-proxy / order.query  官方订单状态（真实下单才有意义）
//   ② order-service / orders.get 本项目落库记录（openid 强制隔离，只能查到自己那一条）
// 隔离：openid 由云端从上下文取，前端不传身份；本地记录查询强制带 _openid
const { callFunction, toastError } = require('../../utils/request.js')

// 状态文案映射
// ★ 演示模式的状态绝不用 PAID / SUCCESS 之类字样，避免被误读成「已支付成功」
const STATUS_TEXT = {
  MOCK_CREATED: '演示订单（未真实下单）',
  MOCK_QUERY_ONLY: '仅查询（未下单）'
}
function statusText(s) {
  if (!s) return '未知'
  return STATUS_TEXT[s] || s
}

const app = getApp()

Page({
  data: {
    orderId: '',
    order: null,         // 官方订单（含 statusText / hasAmount）
    local: null,         // 本项目落库记录
    orders: [],          // 订单列表（未指定订单号时展示）
    loading: false,
    note: ''
  },

  onLoad(options) {
    const orderId = options && options.orderId ? decodeURIComponent(options.orderId) : ''
    this.setData({ orderId })
    if (orderId) this.onQuery()
    else this.loadList()
  },

  onInputId(e) {
    this.setData({ orderId: e.detail.value })
  },

  // 查询订单：先查官方，再查本地记录
  async onQuery() {
    const orderId = (this.data.orderId || '').trim()
    if (!orderId) return wx.showToast({ title: '请先填写订单号', icon: 'none' })
    this.setData({ loading: true, note: '' })

    const remote = await callFunction('mcp-proxy', { action: 'order.query', payload: { orderId } })
    const local = await callFunction('order-service', { action: 'orders.get', payload: { orderId } })

    this.setData({ loading: false })

    const localOrder = local.ok ? local.data.order : null

    if (!remote.ok) {
      // 官方查询失败（401/429/网络）时，不编造状态，如实提示并仅展示本地记录
      this.setData({
        order: null,
        local: localOrder,
        note: '官方订单查询失败：' + (remote.message || '未知原因') + (localOrder ? '（以下为本地记录）' : '')
      })
      if (remote.code === '401') toastError(remote)
      return
    }

    const r = (remote.data && remote.data.order) || null
    const normalized = r
      ? {
          orderId: r.orderId || orderId,
          status: r.status || '未知',
          statusText: r.statusText || statusText(r.status),
          // 金额缺失时保持 null，由 price-tag 显示占位符 '--'，绝不显示成 ¥0.00
          amountYuan: r.amountYuan == null || String(r.amountYuan).trim() === '' ? null : String(r.amountYuan),
          hasAmount: r.amountYuan != null && String(r.amountYuan).trim() !== ''
        }
      : null

    this.setData({
      order: normalized,
      local: localOrder,
      note: localOrder ? '' : '本地没有这笔订单的记录'
    })
  },

  // 订单列表（仅本人）
  async loadList() {
    this.setData({ loading: true })
    const res = await callFunction('order-service', { action: 'orders.list', payload: { limit: 20 } })
    this.setData({ loading: false })
    if (!res.ok) {
      this.setData({ note: '订单列表读取失败：' + (res.message || '') + '（首次使用时集合会自动创建）' })
      return
    }
    const orders = ((res.data && res.data.orders) || []).map((o) => ({
      ...o,
      statusText: statusText(o.status)
    }))
    this.setData({ orders })
  },

  onSelectOrder(e) {
    const orderId = e.currentTarget.dataset.id
    this.setData({ orderId }, () => this.onQuery())
  },

  // 分享：本地记录有省钱金额时透出（官方实算落库值），保留非官方声明
  onShareAppMessage() {
    const local = this.data.local
    let title = '麦麦智能点单助手：一句话点单，官方实算不踩坑'
    if (local && Number(local.savedYuan) > 0) {
      title = `这单麦麦帮我省了¥${local.savedYuan}，实付¥${local.finalPriceYuan}`
    }
    return { title: title + '（非官方作品）', path: '/pages/index/index' }
  }
})
