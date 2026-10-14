// 对话输入条组件：一句话需求输入（预算/热量/忌口/人数）
// 输入内容属于不可信输入，解析在云端 chat-parse 完成，本组件只做采集与长度提示
Component({
  properties: {
    placeholder: { type: String, value: '例如：2 个人，预算 80 元以内，不要辣，热量别超 1200 千卡' },
    maxLength: { type: Number, value: 200 } // 与 chat-parse 清洗上限一致
  },
  data: { value: '' },
  methods: {
    onInput(e) {
      this.setData({ value: e.detail.value })
    },
    onSend() {
      const text = (this.data.value || '').trim()
      if (!text) {
        wx.showToast({ title: '先说说你的需求吧', icon: 'none' })
        return
      }
      // 原样上抛，清洗与解析交由云端，前端不做任何拼接
      this.triggerEvent('send', { text })
      this.setData({ value: '' })
    }
  }
})
