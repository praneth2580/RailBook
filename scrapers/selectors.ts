// Every selector for the site goes here, so when the site changes its markup, this is the one file to fix.
//
// Strings are CSS selectors, and "a@href" reads an attribute (href and src come back absolute). Objects take
// selector, attr, list, transform, default, near (the value next to a label) and nested fields. In an object field,
// put the attribute in attr: the "@" shorthand only works in a plain string. For example:
//
// export const LIST_PAGE = {
//   items: {
//     selector: '.item',
//     list: true,
//     fields: { title: 'h2', link: 'a@href' },
//   },
//   next: 'a.next@href',
// } as const

export {}
