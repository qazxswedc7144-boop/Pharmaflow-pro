import CryptoJS from 'crypto-js';

export interface EncryptedPayloadV1 {
  ciphertext: string;
  salt: string;
  iv: string;
  version?: 1;
}

export interface EncryptedPayloadV2 {
  version: 2;
  ciphertext: string;
  salt: string;
  iv: string;
  tag: string; // HMAC-SHA256 Authentication Tag (Encrypt-then-MAC)
}

export type EncryptedPayload = EncryptedPayloadV1 | EncryptedPayloadV2;

/**
 * Enterprise Cryptographic Service (Phase 6 Hardened)
 * 
 * Supports:
 * - Version 2: Authenticated Encryption using Encrypt-then-MAC (AES-256-CBC + HMAC-SHA256 with PBKDF2 100k)
 * - Version 1: Legacy AES-256-CBC with PBKDF2 100k (Full Backward Compatibility for historical .pfb archives)
 * - Constant-time HMAC comparison to prevent timing attacks.
 * - Comprehensive tamper detection across ciphertext, IV, salt, and auth tags.
 */
export class CryptoService {
  private static iterations = 100000;
  private static readonly ENC_KEY_SIZE = 256 / 32; // 256 bits = 8 words in CryptoJS
  private static readonly MAC_KEY_SIZE = 256 / 32; // 256 bits = 8 words
  private static readonly SALT_BYTE_SIZE = 16; // 128 bits
  private static readonly IV_BYTE_SIZE = 16; // 128 bits

  /**
   * Configures PBKDF2 iterations (primarily for accelerating automated test suites).
   * Defaults to 100,000 in production environments.
   */
  static setIterations(iterations: number): void {
    this.iterations = Math.max(1000, iterations);
  }

  static getIterations(): number {
    return this.iterations;
  }

  /**
   * Encrypts plaintext data using Version 2 Authenticated Encryption (AES-256-CBC + HMAC-SHA256).
   *
   * @param data - Plaintext string to encrypt
   * @param password - User-provided master password
   * @returns EncryptedPayloadV2 with version, ciphertext, salt, iv, and HMAC tag
   */
  static encrypt(data: string, password: string): EncryptedPayloadV2 {
    if (!data) {
      throw new Error('Data to encrypt cannot be empty');
    }
    if (!password || !password.trim()) {
      throw new Error('Password for encryption cannot be empty');
    }

    // Generate random 128-bit salt and IV
    const salt = CryptoJS.lib.WordArray.random(this.SALT_BYTE_SIZE);
    const iv = CryptoJS.lib.WordArray.random(this.IV_BYTE_SIZE);

    // Derive 512 bits total from PBKDF2: 256 bits for Encryption Key + 256 bits for MAC Key
    const derivedWords = CryptoJS.PBKDF2(password, salt, {
      keySize: this.ENC_KEY_SIZE + this.MAC_KEY_SIZE,
      iterations: this.iterations,
    });

    const encKey = CryptoJS.lib.WordArray.create(derivedWords.words.slice(0, 8), 32);
    const macKey = CryptoJS.lib.WordArray.create(derivedWords.words.slice(8, 16), 32);

    // Encrypt data using AES-CBC with PKCS7 padding
    const encrypted = CryptoJS.AES.encrypt(data, encKey, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const ciphertext = encrypted.toString();
    const saltHex = salt.toString(CryptoJS.enc.Hex);
    const ivHex = iv.toString(CryptoJS.enc.Hex);

    // Compute HMAC-SHA256 over version + salt + iv + ciphertext (Encrypt-then-MAC)
    const macData = `v2:${saltHex}:${ivHex}:${ciphertext}`;
    const tag = CryptoJS.HmacSHA256(macData, macKey).toString(CryptoJS.enc.Hex);

    return {
      version: 2,
      ciphertext,
      salt: saltHex,
      iv: ivHex,
      tag
    };
  }

  /**
   * Decrypts an EncryptedPayload (V1 or V2).
   * Automatically detects payload version and validates cryptographic integrity.
   *
   * @param payload - EncryptedPayload (V1 or V2)
   * @param password - User-provided master password
   * @returns Decrypted plaintext string
   */
  static decrypt(payload: EncryptedPayload, password: string): string {
    if (!payload || typeof payload !== 'object') {
      throw new Error('حزمة التشفير غير صالحة');
    }
    if (!payload.ciphertext || !payload.salt || !payload.iv) {
      throw new Error('حزمة التشفير غير مكتملة أو مفقودة الحقول الأساسية');
    }
    if (!password || !password.trim()) {
      throw new Error('كلمة المرور غير صحيحة أو النسخة الاحتياطية غير صالحة');
    }

    // Version 2 Authenticated Payload (Encrypt-then-MAC)
    if ('version' in payload && payload.version === 2 && 'tag' in payload) {
      return this.decryptV2(payload as EncryptedPayloadV2, password);
    }

    // Version 1 Legacy Payload (Backward Compatibility)
    return this.decryptV1(payload, password);
  }

  /**
   * Decrypts Version 2 Authenticated Payload with constant-time HMAC verification.
   */
  private static decryptV2(payload: EncryptedPayloadV2, password: string): string {
    if (!payload.tag || typeof payload.tag !== 'string') {
      throw new Error('رمز التحقق الأمني (HMAC Tag) مفقود في حزمة التشفير');
    }

    try {
      const salt = CryptoJS.enc.Hex.parse(payload.salt);
      const iv = CryptoJS.enc.Hex.parse(payload.iv);

      // Derive 512 bits: 256 for encKey, 256 for macKey
      const derivedWords = CryptoJS.PBKDF2(password, salt, {
        keySize: this.ENC_KEY_SIZE + this.MAC_KEY_SIZE,
        iterations: this.iterations,
      });

      const encKey = CryptoJS.lib.WordArray.create(derivedWords.words.slice(0, 8), 32);
      const macKey = CryptoJS.lib.WordArray.create(derivedWords.words.slice(8, 16), 32);

      // Verify HMAC Tag
      const macData = `v2:${payload.salt}:${payload.iv}:${payload.ciphertext}`;
      const expectedTag = CryptoJS.HmacSHA256(macData, macKey).toString(CryptoJS.enc.Hex);

      if (!this.constantTimeCompare(payload.tag, expectedTag)) {
        throw new Error('كلمة المرور غير صحيحة أو تم العبث بحزمة النسخة الاحتياطية');
      }

      // Decrypt AES-CBC
      const decrypted = CryptoJS.AES.decrypt(payload.ciphertext, encKey, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
      if (!decryptedStr) {
        throw new Error('كلمة المرور غير صحيحة أو النسخة الاحتياطية غير صالحة');
      }

      return decryptedStr;
    } catch (err: any) {
      if (err.message && err.message.includes('غير صحيحة')) {
        throw err;
      }
      throw new Error('كلمة المرور غير صحيحة أو النسخة الاحتياطية غير صالحة');
    }
  }

  /**
   * Decrypts Version 1 Legacy Payload (AES-256-CBC + PBKDF2).
   */
  private static decryptV1(payload: EncryptedPayload, password: string): string {
    try {
      const salt = CryptoJS.enc.Hex.parse(payload.salt);
      const iv = CryptoJS.enc.Hex.parse(payload.iv);

      const derivedKey = CryptoJS.PBKDF2(password, salt, {
        keySize: this.ENC_KEY_SIZE,
        iterations: this.iterations,
      });

      const decrypted = CryptoJS.AES.decrypt(payload.ciphertext, derivedKey, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
      if (!decryptedStr) {
        throw new Error('كلمة المرور غير صحيحة أو النسخة الاحتياطية غير صالحة');
      }

      return decryptedStr;
    } catch {
      throw new Error('كلمة المرور غير صحيحة أو النسخة الاحتياطية غير صالحة');
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  private static constantTimeCompare(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
