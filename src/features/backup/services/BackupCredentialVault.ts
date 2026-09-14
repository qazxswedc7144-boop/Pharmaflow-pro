import { db } from '@/core/db';
import CryptoJS from 'crypto-js';

export interface ProtectedVaultRecord {
  version: number;
  ciphertext: string;
  salt: string;
  iv: string;
  tag: string;
  updatedAt: string;
}

/**
 * Enterprise Backup Credential Vault (Phase 6 Hardened)
 * 
 * Provides secure, offline-first storage for the Auto Backup master password.
 * - Guarantees that the master backup password is NEVER stored in plaintext in IndexedDB or localStorage.
 * - Wraps credentials using a device/origin-bound cryptographic key derivation.
 * - Maintains an in-memory runtime cache to eliminate UX friction and support background Auto Backup.
 * - Never transmits or leaks credentials to Firebase, logs, metadata, or telemetry.
 */
export class BackupCredentialVault {
  private static readonly VAULT_STORAGE_KEY = 'backup_credential_vault';
  private static readonly LEGACY_PLAINTEXT_KEY = 'backupPassword';
  private static readonly DEVICE_SALT_KEY = 'pf_sec_device_salt';
  private static iterations = 50000;
  private static inMemoryPasswordCache: string | null = null;

  static setIterations(iterations: number): void {
    this.iterations = Math.max(1000, iterations);
  }

  /**
   * Derives a deterministic device/origin-bound wrapping key for local secret storage.
   */
  private static async getDeviceWrappingKey(saltHex: string): Promise<CryptoJS.lib.WordArray> {
    // Collect local origin and environment entropy (guarantees offline availability)
    const originEntropy = typeof window !== 'undefined'
      ? (window.location?.origin || 'pharmaflow_local_client')
      : 'pharmaflow_headless_env';
    
    const userAgentEntropy = typeof navigator !== 'undefined'
      ? (navigator.userAgent || 'pharmaflow_agent')
      : 'pharmaflow_node_runtime';

    const rawEntropy = `pf_vault_kdf:${originEntropy}:${userAgentEntropy}:secure_wrapping_key_v1`;
    const salt = CryptoJS.enc.Hex.parse(saltHex);

    // PBKDF2 iterations for local key wrapping (defaults to 50,000)
    return CryptoJS.PBKDF2(rawEntropy, salt, {
      keySize: 256 / 32,
      iterations: this.iterations
    });
  }

  /**
   * Gets or initializes the device salt.
   */
  private static async getOrCreateDeviceSalt(): Promise<string> {
    try {
      const existing = await db.settings.get(this.DEVICE_SALT_KEY);
      if (existing?.value && typeof existing.value === 'string' && existing.value.length >= 16) {
        return existing.value;
      }
    } catch {
      // Fallback
    }

    const randomSalt = CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
    try {
      await db.settings.put({ key: this.DEVICE_SALT_KEY, value: randomSalt });
    } catch {
      // Ignore
    }
    return randomSalt;
  }

  /**
   * Securely saves the backup password into the encrypted credential vault.
   * Also updates the in-memory cache for immediate application access.
   */
  static async saveCredential(password: string): Promise<void> {
    if (!password || !password.trim()) {
      await this.clearCredential();
      return;
    }

    const trimmedPassword = password.trim();
    this.inMemoryPasswordCache = trimmedPassword;

    const deviceSalt = await this.getOrCreateDeviceSalt();
    const wrappingKey = await this.getDeviceWrappingKey(deviceSalt);
    const iv = CryptoJS.lib.WordArray.random(16);
    const ivHex = iv.toString(CryptoJS.enc.Hex);

    const encrypted = CryptoJS.AES.encrypt(trimmedPassword, wrappingKey, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const ciphertext = encrypted.toString();
    const tag = CryptoJS.HmacSHA256(`vault:${deviceSalt}:${ivHex}:${ciphertext}`, wrappingKey).toString(CryptoJS.enc.Hex);

    const vaultRecord: ProtectedVaultRecord = {
      version: 1,
      ciphertext,
      salt: deviceSalt,
      iv: ivHex,
      tag,
      updatedAt: new Date().toISOString()
    };

    await db.settings.put({
      key: this.VAULT_STORAGE_KEY,
      value: JSON.stringify(vaultRecord)
    });
  }

  /**
   * Retrieves the backup password.
   * Priority: In-memory cache -> Decrypt from protected vault.
   */
  static async getCredential(): Promise<string | null> {
    if (this.inMemoryPasswordCache !== null) {
      return this.inMemoryPasswordCache;
    }

    try {
      const record = await db.settings.get(this.VAULT_STORAGE_KEY);
      if (!record?.value) {
        return null;
      }

      let vaultRecord: ProtectedVaultRecord;
      if (typeof record.value === 'string') {
        try {
          vaultRecord = JSON.parse(record.value);
        } catch {
          return null;
        }
      } else if (typeof record.value === 'object') {
        vaultRecord = record.value as ProtectedVaultRecord;
      } else {
        return null;
      }

      if (!vaultRecord.ciphertext || !vaultRecord.salt || !vaultRecord.iv || !vaultRecord.tag) {
        return null;
      }

      const wrappingKey = await this.getDeviceWrappingKey(vaultRecord.salt);
      const expectedTag = CryptoJS.HmacSHA256(
        `vault:${vaultRecord.salt}:${vaultRecord.iv}:${vaultRecord.ciphertext}`,
        wrappingKey
      ).toString(CryptoJS.enc.Hex);

      if (vaultRecord.tag !== expectedTag) {
        // Vault has been corrupted or tampered with
        return null;
      }

      const iv = CryptoJS.enc.Hex.parse(vaultRecord.iv);
      const decrypted = CryptoJS.AES.decrypt(vaultRecord.ciphertext, wrappingKey, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      const decryptedPassword = decrypted.toString(CryptoJS.enc.Utf8);
      if (decryptedPassword && decryptedPassword.trim()) {
        this.inMemoryPasswordCache = decryptedPassword.trim();
        return this.inMemoryPasswordCache;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Synchronously gets the in-memory cached password (for instant UI and non-blocking callers).
   */
  static getCredentialSync(): string | null {
    return this.inMemoryPasswordCache;
  }

  /**
   * Checks whether a protected credential currently exists in memory or storage.
   */
  static async hasCredential(): Promise<boolean> {
    const cred = await this.getCredential();
    return Boolean(cred && cred.trim().length > 0);
  }

  /**
   * Clears the credential from both in-memory cache and encrypted storage.
   */
  static async clearCredential(): Promise<void> {
    this.inMemoryPasswordCache = '';
    try {
      await db.settings.delete(this.VAULT_STORAGE_KEY);
      await db.settings.delete(this.LEGACY_PLAINTEXT_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Idempotent, safe migration of legacy plaintext password from Dexie settings to the secure vault.
   * 
   * Requirements:
   * - Does not lose the existing password if migration fails.
   * - Verifies that the new vault can be decrypted before deleting the plaintext record.
   * - Safely purges whitespace or empty legacy passwords.
   */
  static async migrateLegacyPlaintextCredential(): Promise<{
    migrated: boolean;
    legacyFound: boolean;
  }> {
    try {
      const legacyRecord = await db.settings.get(this.LEGACY_PLAINTEXT_KEY);
      if (!legacyRecord || legacyRecord.value === undefined || legacyRecord.value === null) {
        return { migrated: false, legacyFound: false };
      }

      const legacyVal = String(legacyRecord.value || '').trim();

      if (!legacyVal) {
        // Empty or whitespace legacy record — safely delete without creating vault
        await db.settings.delete(this.LEGACY_PLAINTEXT_KEY);
        return { migrated: true, legacyFound: true };
      }

      // Encrypt into protected vault
      await this.saveCredential(legacyVal);

      // Verify that it can be retrieved and matches perfectly
      this.inMemoryPasswordCache = null; // Clear cache to force decryption test
      const decrypted = await this.getCredential();

      if (decrypted === legacyVal) {
        // Verification succeeded: delete legacy plaintext key
        await db.settings.delete(this.LEGACY_PLAINTEXT_KEY);
        return { migrated: true, legacyFound: true };
      } else {
        // Verification mismatch: preserve legacy record for recovery safety
        console.error('[BackupCredentialVault] Migration verification failed. Legacy record preserved.');
        return { migrated: false, legacyFound: true };
      }
    } catch (err) {
      console.error('[BackupCredentialVault] Error during credential migration:', err);
      return { migrated: false, legacyFound: true };
    }
  }

  /**
   * Sets in-memory password directly (useful for tests and temporary overrides).
   */
  static setInMemoryCache(password: string | null): void {
    this.inMemoryPasswordCache = password;
  }
}
