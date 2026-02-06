# 覆盖物
本文档介绍了图表内置的覆盖物和如何自定义一个覆盖物。

## 内置覆盖物类型

### 基础线条
`horizontalRayLine`, `horizontalSegment`, `horizontalStraightLine`, `verticalRayLine`, `verticalSegment`, `verticalStraightLine`, `rayLine`, `segment`, `straightLine`, `priceLine`, `priceChannelLine`, `parallelStraightLine`

### 斐波那契工具
`fibonacciLine`, `fibonacciCircle`, `fibonacciSegment`, `fibonacciSpiral`, `fibonacciSpeedResistanceFan`, `fibonacciExtension`

### 基础形状
`arrow`, `circle`, `rect`, `triangle`, `parallelogram`, `brush`

### 波浪形态
`threeWaves`, `fiveWaves`, `eightWaves`, `anyWaves`

### 谐波形态
`abcd`, `xabcd`

### 江恩工具
`gannBox`

### 注释工具
`simpleAnnotation`, `simpleTag`, `freePath`

### 交易工具
`orderLine`

## 使用 `figureStyles` 样式化覆盖物

`figureStyles` 属性允许使用键对单个图形进行精细样式控制。这使您可以样式化覆盖物中的各个元素，例如特定的斐波那契水平、波浪标签或单独的线条。

### 工作原理

1. **图形键**: 覆盖物中的每个图形都可以在其 `attrs` 对象中有一个 `key` 属性
2. **按键样式**: 使用 `overlay.figureStyles[key]` 来样式化特定元素
3. **样式优先级**: 样式按以下顺序合并：默认值 → 实例类型样式 → 键控样式 → 图形样式

### 示例：样式化斐波那契水平

`fibonacciLine` 覆盖物为每个水平分配唯一的键（例如 `fib_1`, `fib_0.618`, `fib_0.5`）。您可以单独样式化每个水平：

```javascript
// 创建斐波那契覆盖物
const overlay = chart.createOverlay({
  name: 'fibonacciLine',
  points: [
    { timestamp: 1234567890, value: 100 },
    { timestamp: 1234568000, value: 150 }
  ],
  // 样式化特定的斐波那契水平
  figureStyles: {
    'fib_1': { color: '#ff0000' },        // 100% 水平为红色
    'fib_0.786': { color: '#ff6600' },    // 78.6% 水平为橙色
    'fib_0.618': { color: '#ffcc00' },    // 61.8% 水平（黄金比例）为金色
    'fib_0.5': { color: '#00ff00' },      // 50% 水平为绿色
    'fib_0.382': { color: '#0066ff' },    // 38.2% 水平为蓝色
    'fib_0.236': { color: '#9900ff' },    // 23.6% 水平为紫色
    'fib_0': { color: '#666666' },        // 0% 水平为灰色
    // 单独样式化文本标签
    'fib_0.618_text': {
      color: '#ffcc00',
      backgroundColor: 'rgba(0, 0, 0, 0.7)'
    }
  }
})
```

### 可用的覆盖物

任何为其图形分配键的覆盖物都支持 `figureStyles`。这包括：
- **斐波那契覆盖物**: 每个水平都有一个键，如 `fib_0.618`
- **波浪形态**: 自定义实现可以为各个波浪段或标签分配键
- **自定义覆盖物**: 创建自定义覆盖物时，分配键以启用按元素样式控制

### 使用键创建自定义覆盖物

创建自定义覆盖物时，为各个 attrs 添加键以实现精细样式控制：

```javascript
const customOverlay = {
  name: 'myCustomOverlay',
  totalStep: 3,
  createPointFigures: ({ coordinates, overlay }) => {
    return [{
      type: 'line',
      attrs: [
        {
          key: 'line_1',  // 分配唯一键
          coordinates: [coordinates[0], coordinates[1]]
        },
        {
          key: 'line_2',  // 另一个唯一键
          coordinates: [coordinates[1], coordinates[2]]
        }
      ]
    }]
  }
}

// 然后单独样式化每条线
chart.createOverlay({
  name: 'myCustomOverlay',
  points: [...],
  figureStyles: {
    'line_1': { color: 'red', size: 2 },
    'line_2': { color: 'blue', size: 3 }
  }
})
```

### 要点总结

- 使用 `figureStyles` 来样式化覆盖物中的各个元素
- 可以在图形的 attrs 数组中为各个 attrs 分配键
- 这使得高级覆盖物能够实现 TradingView 风格的按水平样式化
- Attr 级别的键优先于图形级别的键
- 样式优先级：默认值 < 实例样式 < 键控样式 < 图形样式

## 自定义覆盖物
自定义一个覆盖物，然后通过 [registerOverlay](/api/chart/registerOverlay) 全局添加，添加到图表即可和内置覆盖物一样去使用。更多示例可参考 [https://github.com/klinecharts/KLineChart/tree/main/src/extension/overlay](https://github.com/klinecharts/KLineChart/tree/main/src/extension/overlay) 下的文件。
