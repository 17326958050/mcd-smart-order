// 价格标签组件：全站价格展示的唯一出口之一，输入一律为「元」字符串
// 单位处理只调用 utils/money.js，本组件不做任何换算
const { formatYuan } = require('../../utils/money.js')

Component({
  properties: {
    value: { type: String, value: '' },     // 「元」字符串，原样来自接口
    verified: { type: Boolean, value: false }
  },
  observers: {
    value(v) { this.setData({ display: formatYuan(v) }) }
  },
  data: { display: '--' }
})
