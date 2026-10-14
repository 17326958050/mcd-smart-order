// 麦麦智能点单助手（非麦当劳官方产品，仅供参赛演示）
// 全局入口：初始化云开发环境
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('当前微信版本过低，无法使用云开发能力，请升级微信')
      return
    }
    wx.cloud.init({
      env: 'cloud1-d5gheb18zd0b42967', // 云开发环境 ID（2026-10-14 开通，原 mcd-smart-order-d3f57sng9f960f6 经核实不存在）
      traceUser: false // 不采集额外用户行为
    })
  },
  globalData: {
    // 仅查询模式开关：默认开启，开启时禁止真实下单（对齐 mcp-config.example.json）
    queryOnlyMode: true,
    enableMock: true
  }
})
