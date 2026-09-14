import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  getBlob,
  deleteObject,
  FirebaseStorage
} from 'firebase/storage';
import { app } from '@/services/firebase';
import { BackupStorageAdapter, UploadProgressCallback } from './BackupStorageAdapter';

/**
 * Concrete implementation of BackupStorageAdapter using Google Firebase Cloud Storage.
 * Fully encapsulates Firebase SDK calls and isolates BackupService from cloud infrastructure.
 */
export class FirebaseStorageAdapter implements BackupStorageAdapter {
  private storage: FirebaseStorage;

  constructor(customStorage?: FirebaseStorage) {
    this.storage = customStorage || getStorage(app);
  }

  /**
   * Uploads a backup package to Firebase Storage at the given path with resumable upload task.
   */
  async upload(
    path: string,
    data: Blob | ArrayBuffer | Uint8Array | string,
    onProgress?: UploadProgressCallback
  ): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);

      let blob: Blob;
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        blob = data;
      } else if (typeof data === 'string') {
        blob = new Blob([data], { type: 'application/octet-stream' });
      } else {
        blob = new Blob([data], { type: 'application/octet-stream' });
      }

      const uploadTask = uploadBytesResumable(storageRef, blob);

      return await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.totalBytes > 0 && onProgress) {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              onProgress(progress);
            }
          },
          (error) => {
            const userFriendlyError = this.formatStorageError(error);
            reject(userFriendlyError);
          },
          () => {
            getDownloadURL(uploadTask.snapshot.ref)
              .then((downloadURL) => resolve(downloadURL))
              .catch((err) => reject(this.formatStorageError(err)));
          }
        );
      });
    } catch (err: any) {
      throw this.formatStorageError(err);
    }
  }

  /**
   * Downloads a backup package Blob from Firebase Storage.
   */
  async download(path: string): Promise<Blob> {
    try {
      const storageRef = ref(this.storage, path);
      return await getBlob(storageRef);
    } catch (err: any) {
      throw this.formatStorageError(err);
    }
  }

  /**
   * Deletes a backup package from Firebase Storage.
   */
  async delete(path: string): Promise<void> {
    try {
      const storageRef = ref(this.storage, path);
      await deleteObject(storageRef);
    } catch (err: any) {
      throw this.formatStorageError(err);
    }
  }

  /**
   * Maps low-level Firebase Storage errors to safe, user-friendly domain errors
   * without leaking internal bucket URLs, credentials, or raw stack traces.
   */
  private formatStorageError(error: any): Error {
    const code = error?.code || '';
    switch (code) {
      case 'storage/unauthorized':
        return new Error('فشل رفع النسخة السحابية: لا تملك الصلاحيات الكافية للتخزين السحابي.');
      case 'storage/quota-exceeded':
        return new Error('فشل رفع النسخة السحابية: تم تجاوز حصة التخزين السحابي المتاحة.');
      case 'storage/retry-limit-exceeded':
      case 'storage/network-request-failed':
        return new Error('فشل رفع النسخة السحابية: تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت.');
      case 'storage/canceled':
        return new Error('تم إلغاء عملية رفع النسخة السحابية.');
      case 'storage/object-not-found':
        return new Error('الملف المطلوب غير موجود في التخزين السحابي.');
      default:
        return new Error('فشل رفع النسخة الاحتياطية إلى التخزين السحابي.');
    }
  }
}

export const firebaseStorageAdapter = new FirebaseStorageAdapter();
