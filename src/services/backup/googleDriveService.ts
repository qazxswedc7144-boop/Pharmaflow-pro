import { signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth } from '@/services/firebase';
import { unifiedTransport } from '@/shared/network/transport/unifiedTransport';
import { configurationService } from '@/services/config/configurationService';

export { auth };

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive');

let cachedAccessToken: string | null = null;

export const GoogleDriveService = {
  async signIn(): Promise<{ user: User; accessToken: string }> {
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Failed to retrieve access token from Google sign-in.');
      }
      cachedAccessToken = credential.accessToken;
      configurationService.set('gdrive.access_token', cachedAccessToken).catch(() => {});
      configurationService.set('gdrive.user_email', result.user.email || '').catch(() => {});
      return { user: result.user, accessToken: cachedAccessToken };
    } catch (e) {
      console.error('Sign-in failed:', e);
      throw e;
    }
  },

  getAccessToken(): string | null {
    if (!cachedAccessToken) {
      cachedAccessToken = configurationService.getSync<string>('gdrive.access_token') || null;
    }
    return cachedAccessToken;
  },

  getUserEmail(): string | null {
    return configurationService.getSync<string>('gdrive.user_email') || null;
  },

  async signOut(): Promise<void> {
    await signOut(auth);
    cachedAccessToken = null;
    configurationService.set('gdrive.access_token', '').catch(() => {});
    configurationService.set('gdrive.user_email', '').catch(() => {});
  },

  async listBackups(token: string): Promise<any[]> {
    const url = 'https://www.googleapis.com/drive/v3/files?q=name contains "PharmaFlow_" and trashed = false&fields=files(id, name, mimeType, size, createdTime)&orderBy=createdTime desc';
    const data = await unifiedTransport.get<any>(url, {
      profile: 'UPLOAD',
      headers: { Authorization: `Bearer ${token}` }
    });

    return data?.files || [];
  },

  async uploadBackup(name: string, contentBlob: Blob, token: string): Promise<any> {
    const metadata = {
      name: name,
      mimeType: 'application/octet-stream',
      description: 'PharmaFlow PRO ERP encrypted system backup'
    };

    const boundary = 'PharmaFlow_Boundary_998822';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--\r\n`;

    const metadataPart = JSON.stringify(metadata);
    const arrayBuffer = await contentBlob.arrayBuffer();
    const blobView = new Uint8Array(arrayBuffer);

    const encoder = new TextEncoder();
    const header = encoder.encode(
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}${delimiter}Content-Type: application/octet-stream\r\n\r\n`
    );
    const footer = encoder.encode(closeDelimiter);

    const body = new Uint8Array(header.length + blobView.length + footer.length);
    body.set(header, 0);
    body.set(blobView, header.length);
    body.set(footer, header.length + blobView.length);

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    return await unifiedTransport.post<any>(uploadUrl, body, {
      profile: 'UPLOAD',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': body.length.toString()
      }
    });
  },

  async downloadBackup(fileId: string, token: string): Promise<Blob> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const data = await unifiedTransport.get<any>(url, {
      profile: 'UPLOAD',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (data instanceof Blob) return data;
    return new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'application/octet-stream' });
  },

  async deleteBackup(fileId: string, token: string): Promise<void> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    await unifiedTransport.delete<void>(url, {
      profile: 'UPLOAD',
      headers: { Authorization: `Bearer ${token}` }
    });
  }
};
