import { init } from 'klinecharts'

const chart = init('createOverlay-freePath-chart')

chart.setSymbol({ ticker: 'TestSymbol' })
chart.setPeriod({ span: 1, type: 'day' })
chart.setDataLoader({
  getBars: ({
    callback
  }) => {
    fetch('https://klinecharts.com/datas/kline.json')
      .then(res => res.json())
      .then(dataList => {
        callback(dataList)
      })
  }
})

function createFreePathOverlay() {
  chart.createOverlay({
    name: 'freePath',
    onDrawEnd: () => {
      // Automatically create a new freePath overlay after drawing is complete
      createFreePathOverlay()
    }
  })
}

// Initialize the first freePath overlay
createFreePathOverlay()
