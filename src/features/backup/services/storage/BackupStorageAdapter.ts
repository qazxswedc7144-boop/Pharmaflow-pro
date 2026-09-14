/**
 * Progress callback for storage upload operations (0 to 100 percent).
 */
export type UploadProgressCallback = (progressPercent: number) => void;

/**
 * Storage adapter interface for backup storage providers (e.g. Firebase Storage, S3, Cloudflare R2, etc.).
 * Isolates backup domain and service logic from concrete cloud storage SDKs.
 */
export interface BackupStorageAdapter {
  /**
   * Uploads data payload to cloud storage at the specified path.
   * @param path - Destination storage path (e.g. 'backups/PharmaFlow_Backup_....pfb')
   * @param data - Blob, ArrayBuffer, Uint8Array, or string data to upload
   * @param onProgress - Optional callback to track upload progress percentage
   * @returns Promise resolving to the public/download URL or storage reference identifier
   */
  upload(
    path: string,
    data: Blob | ArrayBuffer | Uint8Array | string,
    onProgress?: UploadProgressCallback
  ): Promise<string>;

  /**
   * Downloads data from storage at the specified path.
   * @param path - Storage path to download from
   * @returns Promise resolving to the downloaded Blob
   */
  download?(path: string): Promise<Blob>;

  /**
   * Deletes an object from storage at the specified path.
   * @param path - Storage path to delete
   */
  delete?(path: string): Promise<void>;
}
