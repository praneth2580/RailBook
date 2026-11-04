import { describe, expect, it } from 'vitest'
import { actionSelector, readField, type ElementSelector } from './elementSelector'
import * as selectors from './selectors'

describe('actionSelector', () => {
  it('joins the parts into one selector', () => {
    expect(actionSelector({ tag: 'button', classes: ['btn', 'primary'], text: 'Search' })).toBe(
      'button.btn.primary:has-text("Search")',
    )
    expect(actionSelector({ tag: 'input', id: 'from', attributes: { placeholder: 'From*' } })).toBe(
      'input#from[placeholder="From*"]',
    )
    expect(actionSelector({ tag: 'a', text: 'Login', exactText: true })).toBe('a:text-is("Login")')
  })

  it('finds text alone as the smallest element with it', () => {
    expect(actionSelector({ text: 'LOGIN / REGISTER' })).toBe('text=/LOGIN \\/ REGISTER/i')
    expect(actionSelector({ text: 'Login', exactText: true })).toBe('text="Login"')
  })

  it('takes a whole css or xpath, looks within another element and picks a match', () => {
    expect(actionSelector({ css: 'a, button', text: 'Go' })).toBe(':is(a, button):has-text("Go")')
    expect(actionSelector({ xpath: '/html/body/div[1]/a', nth: 1 })).toBe('xpath=/html/body/div[1]/a >> nth=1')
    expect(actionSelector({ tag: 'a', within: { tag: 'app-header' } })).toBe('app-header >> a')
  })

  it('escapes ids and classes', () => {
    expect(actionSelector({ id: '1st', classes: ['md:flex'] })).toBe('#\\31 st.md\\:flex')
  })

  it('refuses parts that do not go together', () => {
    const wrong: [ElementSelector, string][] = [
      [{}, 'Describe the element'],
      [{ css: 'a', xpath: '//a' }, 'Give css or xpath, not both.'],
      [{ css: 'a', classes: ['x'] }, "css doesn't combine with classes."],
      [{ xpath: '//a', tag: 'a' }, "xpath doesn't combine with tag."],
      [{ xpath: '//a', text: 'Go' }, "xpath doesn't combine with text."],
      [{ tag: 'a', within: {} }, 'Describe the element'],
    ]
    for (const [element, message] of wrong) expect(() => actionSelector(element)).toThrow(message)
  })
})

describe('readField', () => {
  it('reads by CSS and text, with the options given', () => {
    expect(readField({ tag: 'p', text: 'Pick a language' })).toEqual({ selector: 'p', text: 'Pick a language' })
    expect(readField({ text: 'Login' })).toEqual({ text: 'Login' })
    expect(readField({ tag: 'a', classes: ['next'] }, { attr: 'href' })).toEqual({ selector: 'a.next', attr: 'href' })
    expect(readField({ tag: 'li', within: { id: 'menu' } }, { list: true })).toEqual({ selector: '#menu li', list: true })
  })

  it('refuses what reading a page cannot do', () => {
    expect(() => readField({ xpath: '//a' })).toThrow('Reading a page needs CSS')
    expect(() => readField({ tag: 'a', nth: 2 })).toThrow('Reading a page has no nth')
    expect(() => readField({ tag: 'a', within: { text: 'Menu' } })).toThrow("can't look within an element found by")
  })
})

describe('selectors.ts', () => {
  it('describes every element in a way that can be clicked and read', () => {
    for (const [group, elements] of Object.entries(selectors)) {
      for (const [name, element] of Object.entries(elements as Record<string, ElementSelector>)) {
        expect(() => actionSelector(element), `${group}.${name}`).not.toThrow()
        expect(() => readField(element), `${group}.${name}`).not.toThrow()
      }
    }
  })
})
