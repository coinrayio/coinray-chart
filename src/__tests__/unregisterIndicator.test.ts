import { describe, it, expect } from 'vitest'
import { registerIndicator, unregisterIndicator, getIndicatorClass, getIndicatorTemplate, getSupportedIndicators } from '../extension/indicator/index'

describe('unregisterIndicator', () => {
  it('drops a registered template, so nothing keeps its closures alive', () => {
    registerIndicator({ name: 'TEST_EPHEMERAL', figures: [], calc: (d) => d.map(() => ({})) })
    expect(getIndicatorClass('TEST_EPHEMERAL')).not.toBeNull()

    unregisterIndicator('TEST_EPHEMERAL')

    expect(getIndicatorClass('TEST_EPHEMERAL')).toBeNull()
    expect(getIndicatorTemplate('TEST_EPHEMERAL')).toBeNull()
    expect(getSupportedIndicators()).not.toContain('TEST_EPHEMERAL')
  })

  it('is a no-op for a name that was never registered', () => {
    const before = getSupportedIndicators().length
    unregisterIndicator('TEST_NEVER_REGISTERED')
    expect(getSupportedIndicators().length).toBe(before)
  })
})
