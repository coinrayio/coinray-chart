# Overlay
This document introduces the built-in overlays in the chart and how to customize a overlay.

## Built-in overlay types

### Basic Lines
`horizontalRayLine`, `horizontalSegment`, `horizontalStraightLine`, `verticalRayLine`, `verticalSegment`, `verticalStraightLine`, `rayLine`, `segment`, `straightLine`, `priceLine`, `priceChannelLine`, `parallelStraightLine`

### Fibonacci Overlays
`fibonacciLine`, `fibonacciCircle`, `fibonacciSegment`, `fibonacciSpiral`, `fibonacciSpeedResistanceFan`, `fibonacciExtension`

### Basic Shapes
`arrow`, `circle`, `rect`, `triangle`, `parallelogram`, `brush`

### Wave Patterns
`threeWaves`, `fiveWaves`, `eightWaves`, `anyWaves`

### Harmonic Patterns
`abcd`, `xabcd`

### Gann Tools
`gannBox`

### Annotations
`simpleAnnotation`, `simpleTag`, `freePath`

### Trading Tools
`orderLine`

## Styling overlays with `figureStyles`

The `figureStyles` property enables granular per-figure styling using keys. This allows you to style individual elements within an overlay, such as specific Fibonacci levels, wave labels, or individual lines.

### How it works

1. **Figure keys**: Each figure in an overlay can have a `key` property in its `attrs` object
2. **Per-key styling**: Use `overlay.figureStyles[key]` to style specific elements
3. **Style priority**: Styles merge in this order: defaults → instance type styles → keyed styles → figure styles

### Example: Styling Fibonacci levels

The `fibonacciLine` overlay assigns unique keys to each level (e.g., `fib_1`, `fib_0.618`, `fib_0.5`). You can style each level individually:

```javascript
// Create a Fibonacci overlay
const overlay = chart.createOverlay({
  name: 'fibonacciLine',
  points: [
    { timestamp: 1234567890, value: 100 },
    { timestamp: 1234568000, value: 150 }
  ],
  // Style specific Fibonacci levels
  figureStyles: {
    'fib_1': { color: '#ff0000' },        // 100% level in red
    'fib_0.786': { color: '#ff6600' },    // 78.6% level in orange
    'fib_0.618': { color: '#ffcc00' },    // 61.8% level (golden ratio) in gold
    'fib_0.5': { color: '#00ff00' },      // 50% level in green
    'fib_0.382': { color: '#0066ff' },    // 38.2% level in blue
    'fib_0.236': { color: '#9900ff' },    // 23.6% level in purple
    'fib_0': { color: '#666666' },        // 0% level in gray
    // Style the text labels separately
    'fib_0.618_text': {
      color: '#ffcc00',
      backgroundColor: 'rgba(0, 0, 0, 0.7)'
    }
  }
})
```

### Available in overlays

Any overlay that assigns keys to its figures supports `figureStyles`. This includes:
- **Fibonacci overlays**: Each level has a key like `fib_0.618`
- **Wave patterns**: Custom implementations can assign keys to individual wave segments or labels
- **Custom overlays**: When creating custom overlays, assign keys to enable per-element styling

### Creating custom overlays with keys

When creating custom overlays, add keys to individual attrs for fine-grained styling control:

```javascript
const customOverlay = {
  name: 'myCustomOverlay',
  totalStep: 3,
  createPointFigures: ({ coordinates, overlay }) => {
    return [{
      type: 'line',
      attrs: [
        {
          key: 'line_1',  // Assign a unique key
          coordinates: [coordinates[0], coordinates[1]]
        },
        {
          key: 'line_2',  // Another unique key
          coordinates: [coordinates[1], coordinates[2]]
        }
      ]
    }]
  }
}

// Then style each line individually
chart.createOverlay({
  name: 'myCustomOverlay',
  points: [...],
  figureStyles: {
    'line_1': { color: 'red', size: 2 },
    'line_2': { color: 'blue', size: 3 }
  }
})
```

### Key takeaways

- Use `figureStyles` to style individual elements within overlays
- Keys can be assigned to individual attrs within a figure's attrs array
- This enables TradingView-style per-level styling for advanced overlays
- Attr-level keys take precedence over figure-level keys
- Style priority: defaults < instance styles < keyed styles < figure styles

## Custom overlays
To create custom an overlay, then add it globally via [registerOverlay](/api/chart/registerOverlay) and add it to the chart to use it just like a built-in overlay. For more examples, refer to the files under [https://github.com/klinecharts/KLineChart/tree/main/src/extension/overlay](https://github.com/klinecharts/KLineChart/tree/main/src/extension/overlay) .