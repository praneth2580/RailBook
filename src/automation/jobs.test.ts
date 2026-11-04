import { describe, expect, it } from 'vitest'
import { extractJson, getPath, validateJob } from './jobs'

describe('getPath and extractJson', () => {
  const body = {
    data: {
      items: [
        { name: 'Tea', price: { amount: 120 } },
        { name: 'Coffee', price: { amount: 150 } },
      ],
    },
  }

  it('reads dot paths, array indexes included', () => {
    expect(getPath(body, 'data.items.1.price.amount')).toBe(150)
    expect(getPath(body, 'data.missing.x')).toBeUndefined()
  })

  it('maps each item to fields, or keeps items whole', () => {
    expect(
      extractJson([body], { each: 'data.items', fields: { name: 'name', price: 'price.amount', sku: 'sku' } }),
    ).toEqual([
      { name: 'Tea', price: 120, sku: null },
      { name: 'Coffee', price: 150, sku: null },
    ])
    expect(extractJson([[1, 2]], {})).toEqual([{ value: 1 }, { value: 2 }])
  })
})

describe('validateJob', () => {
  const valid = {
    name: '  Deals ',
    urls: ['https://shop.example/deals', ''],
    steps: [{ type: 'paginate', next: 'a.next', maxPages: 3 }],
    extract: {
      each: 'article',
      fields: {
        title: 'h2',
        link: { selector: 'a', attr: 'href', extra: 1 },
        tags: { selector: '.tag', list: true },
        price: { near: 'Price' },
        seller: { selector: '.seller', fields: { name: '.name', url: 'a@href' } },
      },
    },
    key: 'link',
    everyMinutes: 60,
    unknown: 'dropped',
  }

  it('keeps only what it understands', () => {
    const { job, errors } = validateJob(valid)
    expect(errors).toEqual([])
    expect(job).toMatchObject({
      name: 'Deals',
      urls: ['https://shop.example/deals'],
      extract: {
        each: 'article',
        fields: {
          title: 'h2',
          link: { selector: 'a', attr: 'href' },
          tags: { selector: '.tag', list: true },
          price: { near: 'Price' },
          seller: { selector: '.seller', fields: { name: '.name', url: 'a@href' } },
        },
      },
      key: 'link',
      everyMinutes: 60,
    })
    expect(job && 'unknown' in job).toBe(false)
    expect(job?.extract.fields && 'extra' in (job.extract.fields.link as object)).toBe(false)
    expect(job?.id).toMatch(/[0-9a-f-]{36}/)
  })

  it('lists every problem at once', () => {
    const { errors } = validateJob({
      name: '',
      urls: ['ftp://x.example/'],
      steps: [{ type: 'teleport' }],
      extract: { fields: {} },
      key: 'missing',
      everyMinutes: 1,
    })
    expect(errors).toEqual([
      'The name needs a value.',
      'Start page 1 must start with http or https.',
      'Step 1 has an unknown type.',
      'Add at least one field to extract.',
      'The schedule must be a whole number from 5 to 10080.',
    ])
  })

  it('checks render actions', () => {
    expect(validateJob({ ...valid, render: { actions: [{ type: 'click' }] } }).errors).toEqual([
      "Action 1's selector needs a value.",
    ])
  })

  it('needs every field to look for something', () => {
    expect(validateJob({ ...valid, extract: { fields: { title: { list: true } } }, key: undefined }).errors).toEqual([
      'The field title needs a selector, text or label to look for.',
    ])
  })

  it('needs the key to be one of the fields', () => {
    expect(validateJob({ ...valid, key: 'cost' }).errors).toEqual(['The record key must be one of the fields.'])
  })

  it('accepts a sitemap in place of start pages', () => {
    const { job } = validateJob({
      ...valid,
      urls: [],
      sitemap: { url: 'https://shop.example/sitemap.xml', match: '*/deals/*', max: 20 },
    })
    expect(job?.sitemap).toEqual({ url: 'https://shop.example/sitemap.xml', match: '*/deals/*', max: 20 })
  })
})
