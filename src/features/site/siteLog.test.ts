import { describe, expect, it } from 'vitest'
import { actionSelector } from './elementSelector'
import { describeElement, formatSelector, suggestSelector, type RecordedElement } from './siteLog'

const element = (parts: Partial<RecordedElement>): RecordedElement => ({
  tag: 'a',
  classes: [],
  attributes: {},
  css: 'body > app-root > a',
  ...parts,
})

describe('suggestSelector', () => {
  it('prefers a written id, then short text, then a findable attribute, then classes, then the CSS path', () => {
    expect(suggestSelector(element({ id: 'loginLink', text: 'LOGIN' }))).toEqual({ tag: 'a', id: 'loginLink' })
    expect(suggestSelector(element({ id: 'mat-input-1234', text: 'LOGIN' }))).toEqual({ tag: 'a', text: 'LOGIN' })
    expect(suggestSelector(element({ tag: 'input', attributes: { type: 'text', placeholder: 'From*' } }))).toEqual({
      tag: 'input',
      attributes: { placeholder: 'From*' },
    })
    expect(suggestSelector(element({ classes: ['ng-star-inserted', 'fa', 'fa-bars', 'big'] }))).toEqual({
      tag: 'a',
      classes: ['fa', 'fa-bars'],
    })
    expect(suggestSelector(element({ classes: ['ng-tns-c19-3'] }))).toEqual({ css: 'body > app-root > a' })
  })

  it('suggests selectors that turn into something to click', () => {
    expect(actionSelector(suggestSelector(element({ text: 'LOGIN / REGISTER' })))).toBe(
      'a:has-text("LOGIN / REGISTER")',
    )
  })
})

describe('formatSelector', () => {
  it('writes the selector the way selectors.ts does', () => {
    expect(formatSelector({ tag: 'button', text: "Don't \\ go" })).toBe("{ tag: 'button', text: 'Don\\'t \\\\ go' }")
    expect(formatSelector({ tag: 'input', attributes: { 'aria-label': 'From', name: 'from' } })).toBe(
      "{ tag: 'input', attributes: { 'aria-label': 'From', name: 'from' } }",
    )
    expect(formatSelector({ tag: 'i', classes: ['fa', 'fa-bars'] })).toBe("{ tag: 'i', classes: ['fa', 'fa-bars'] }")
  })
})

describe('describeElement', () => {
  it('names the element by its tag, id, classes and text or a findable attribute', () => {
    expect(describeElement(element({ id: 'go', classes: ['btn', 'primary', 'x'], text: 'Search' }))).toBe(
      'a#go.btn.primary "Search"',
    )
    expect(describeElement(element({ tag: 'input', attributes: { placeholder: 'From*' } }))).toBe(
      'input[placeholder="From*"]',
    )
  })
})
