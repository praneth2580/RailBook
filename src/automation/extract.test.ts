// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentBaseUrl, extract, parseHtml } from './extract'

const document = parseHtml(`
  <html>
    <head><base href="/shop/"></head>
    <body>
      <h1>  Spring
        sale </h1>
      <ul>
        <li class="item"><a href="tea">Tea</a> <span class="price">₹120</span></li>
        <li class="item"><a href="https://other.example/coffee">Coffee</a></li>
      </ul>
      <img src="//cdn.example/logo.png">
      <span class="tag">new</span><span class="tag">sale</span>
    </body>
  </html>
`)
const baseUrl = documentBaseUrl(document, 'https://example.com/index.html')

describe('documentBaseUrl', () => {
  it('follows a <base> element', () => {
    expect(baseUrl).toBe('https://example.com/shop/')
  })

  it('uses the page address without one', () => {
    expect(documentBaseUrl(parseHtml('<p>hi</p>'), 'https://example.com/a/b')).toBe('https://example.com/a/b')
  })
})

describe('extract', () => {
  it('reads text with whitespace collapsed', () => {
    expect(extract(document, { title: 'h1' }, baseUrl)).toEqual({ title: 'Spring sale' })
  })

  it('returns null for missing elements and attributes', () => {
    expect(extract(document, { missing: '.nothing', noTitle: { selector: 'h1', attr: 'title' } }, baseUrl)).toEqual({
      missing: null,
      noTitle: null,
    })
  })

  it('resolves link attributes to absolute URLs', () => {
    expect(extract(document, { logo: { selector: 'img', attr: 'src' } }, baseUrl)).toEqual({
      logo: 'https://cdn.example/logo.png',
    })
  })

  it('reads every match with all', () => {
    expect(extract(document, { tags: { selector: '.tag', all: true } }, baseUrl)).toEqual({ tags: ['new', 'sale'] })
  })

  it('reads fields inside each repeated element', () => {
    const fields = { items: { each: '.item', fields: { name: 'a', link: { selector: 'a', attr: 'href' }, price: '.price' } } }
    expect(extract(document, fields, baseUrl)).toEqual({
      items: [
        { name: 'Tea', link: 'https://example.com/shop/tea', price: '₹120' },
        { name: 'Coffee', link: 'https://other.example/coffee', price: null },
      ],
    })
  })

  it('reads the element itself when a field has no selector', () => {
    expect(extract(document, { links: { each: 'li a', fields: { name: {}, link: { attr: 'href' } } } }, baseUrl)).toEqual({
      links: [
        { name: 'Tea', link: 'https://example.com/shop/tea' },
        { name: 'Coffee', link: 'https://other.example/coffee' },
      ],
    })
  })

  it('names an invalid selector', () => {
    expect(() => extract(document, { broken: 'li[' }, baseUrl)).toThrow('Invalid CSS selector: li[')
  })
})
