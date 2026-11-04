/**
 * What to read from a page: the part of WRAITH's selector schema that can be saved as JSON, so jobs can be stored.
 * A string is a CSS selector whose text is read; "a@href" reads an attribute, and href and src come back absolute.
 */
export type Field = string | ValueField | NestedField

export interface ValueField {
  /** Leave it out to read the parent element itself. */
  selector?: string
  attr?: string
  /** Inner HTML instead of text. */
  html?: boolean
  /** Every match as a list, instead of the first. */
  list?: boolean
  /** Used when nothing matches, instead of null. */
  default?: string
  /** Matches elements by their own text rather than a selector. */
  text?: string
  /** Reads the value next to a label, such as "Price: ₹499" for "Price". */
  near?: string
}

/** Reads fields inside each match, giving an object, or a list of them. */
export interface NestedField {
  selector: string
  fields: Fields
  list?: boolean
}

export interface Fields {
  [name: string]: Field
}
