// 订单详情页：查询本人订单状态
// 隔离：openid 由云端从上下文取，前端不传身份；只能查到自己的订单
const { callFunction, toastError } = require('../../utils/request.js')

Page({
  data: {
    orderId: '',
    order: null,
    loading: false
  },

  onLoad(options) {
    this.setData({ orderId: options.orderId || '' })
    // TODO(第 3 步)：调用 mcp-proxy/order.queryOrder 拉取订单状态
  },

  async onQuery() {
    this.setData({ loading: true })
    const res = await callFunction('mcp-proxy', { action: 'order.query', orderId: this.data.orderId })
    this.setData({ loading: false })
    if (!res.ok) return toastError(res)
    this.setData({ order: res.data.order || null })
  },

  onShareAppMessage() {
    return {
      title: '麦麦智能点单助手（非麦当劳官方产品）',
      path: '/pages/index/index'
    }
  }
})
