/** Joins class names, ignoring falsy values. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(' ')
}
