// 餐品卡片组件：展示单个餐品 + 价格标签
// verified 标记规则：未经 calculate-price 实算的一律灰显并注明「未经实算验证，仅为标价参考」
Component({
  properties: {
    // 餐品对象：{ id, name, priceYuan（元字符串）, calorie, verified, imageUrl? }
    meal: { type: Object, value: {} }
  },
  data: {},
  methods: {
    onTap() {
      // 上抛点击事件，由页面决定是否加入组合
      this.triggerEvent('select', { meal: this.data.meal })
    }
  }
})
