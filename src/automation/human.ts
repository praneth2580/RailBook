/**
 * How human the browser's input looks when RailBook clicks, types and scrolls: WRAITH's mouse paths, pauses and typing
 * pace. Settings › Scraping picks one. There's deliberately no "off".
 */
export const HUMAN_LEVELS = ['fast', 'natural', 'careful'] as const
export type HumanLevel = (typeof HUMAN_LEVELS)[number]

export const DEFAULT_HUMAN_LEVEL: HumanLevel = 'natural'

export function isHumanLevel(value: unknown): value is HumanLevel {
  return HUMAN_LEVELS.includes(value as HumanLevel)
}

/** A saved level, or the default for anything else, "off" included. */
export function parseHumanLevel(value: unknown): HumanLevel {
  return isHumanLevel(value) ? value : DEFAULT_HUMAN_LEVEL
}
