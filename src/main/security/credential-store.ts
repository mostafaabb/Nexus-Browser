import { safeStorage } from 'electron'
import { ERROR_CODES, AppError } from '@shared/errors'
import type { NexusDatabase } from '../database'

/**
 * Stores secrets encrypted with the operating system credential store.
 *
 * Electron's `safeStorage` uses DPAPI on Windows which means the ciphertext is
 * bound to the current Windows user account. The decryption key lives in the
 * OS keychain and is *not* accessible to other processes of the same user
 * without going through the same API, but it is **not** hardware-bound and it
 * does not protect against a compromised user account.
 */
export class CredentialStore {
  private readonly memory = new Map<string, string>()

  constructor(private readonly db: NexusDatabase) {}

  /** True when the platform can encrypt secrets at rest. */
  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  /** Describes the protection level for the user interface. */
  describeBackend(): 'os-encrypted' | 'session-memory' {
    return this.isAvailable() ? 'os-encrypted' : 'session-memory'
  }

  set(key: string, secret: string): void {
    if (!this.isAvailable()) {
      this.memory.set(key, secret)
      throw new AppError(
        ERROR_CODES.CREDENTIAL_STORE_UNAVAILABLE,
        'The operating system credential store is unavailable, so the key was kept for this session only.'
      )
    }
    const encrypted = safeStorage.encryptString(secret)
    this.db.run(
      'INSERT INTO secrets (key, value, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, encrypted, Date.now()]
    )
    this.memory.set(key, secret)
  }

  get(key: string): string | null {
    const cached = this.memory.get(key)
    if (cached !== undefined) return cached

    const row = this.db.get<{ value: Uint8Array }>('SELECT value FROM secrets WHERE key = ?', [key])
    if (!row) return null
    if (!this.isAvailable()) return null
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(row.value))
      this.memory.set(key, decrypted)
      return decrypted
    } catch {
      return null
    }
  }

  /** True when a secret exists either in the OS store or in memory. */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  delete(key: string): void {
    this.memory.delete(key)
    this.db.run('DELETE FROM secrets WHERE key = ?', [key])
  }
}
