import { randomUUID } from 'node:crypto'

/** Generates a stable, unique identifier for application entities. */
export function createId(prefix?: string): string {
  const id = randomUUID()
  return prefix ? `${prefix}_${id}` : id
}
