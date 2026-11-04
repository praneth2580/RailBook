import { describe, expect, it } from 'vitest'
import { globToRegExp, parseRenderOptions } from './render'

describe('globToRegExp', () => {
  it('matches whole addresses with * as a wildcard', () => {
    const pattern = globToRegExp('https://shop.example/api/*?page=*')
    expect(pattern.test('https://shop.example/api/products?page=2')).toBe(true)
    expect(pattern.test('https://shop.example/products?page=2')).toBe(false)
    expect(globToRegExp('*/api/*').test('https://x.example/api/v1')).toBe(true)
  })
})

describe('parseRenderOptions', () => {
  it('keeps valid actions and drops empty options', () => {
    expect(
      parseRenderOptions({
        waitFor: ' .results ',
        capture: '',
        actions: [
          { type: 'type', selector: 'input[name=q]', text: 'rail' },
          { type: 'press', key: 'Enter' },
          { type: 'click', selector: 'button.more', times: 3 },
          { type: 'click', selector: '#accept', times: 1 },
          { type: 'scroll', times: 5 },
        ],
      }),
    ).toEqual({
      waitFor: '.results',
      actions: [
        { type: 'type', selector: 'input[name=q]', text: 'rail' },
        { type: 'press', key: 'Enter' },
        { type: 'click', selector: 'button.more', times: 3 },
        { type: 'click', selector: '#accept' },
        { type: 'scroll', times: 5 },
      ],
    })
  })

  it('treats true as rendering with no options', () => {
    expect(parseRenderOptions(true)).toEqual({})
  })

  it('says what is wrong', () => {
    expect(() => parseRenderOptions({ actions: [{ type: 'press', key: 'F5' }] })).toThrow(
      "Action 1 presses a key RailBook doesn't know.",
    )
    expect(() => parseRenderOptions({ actions: [{ type: 'scroll', times: 500 }] })).toThrow(
      "Action 1's scroll count must be a whole number from 1 to 50.",
    )
    expect(() => parseRenderOptions({ actions: Array(21).fill({ type: 'wait', ms: 1 }) })).toThrow('at most 20 actions')
  })
})
