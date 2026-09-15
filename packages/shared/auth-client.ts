// packages/shared/auth-client.ts
import axios from "axios";
import { Role, Permission, hasPermission } from "../auth/src/rbac";
import { TokenProvider } from "../../src/services/auth/tokenProvider";
import { useAuthStore } from "../../src/store/authStore";

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: {
    id: string;
    username: string;
    role: Role;
  } | null;
}

export class AuthClient {
  private static apiBase = "/api/v1/auth";

  static init(): void {
    // Intentionally no-op: TokenProvider and useAuthStore hydrate automatically
  }

  static async login(username: string, passwordPlain: string): Promise<{ success: boolean; user?: AuthState['user']; error?: string }> {
    try {
      let response;
      try {
        response = await axios.post(`${this.apiBase}/login`, {
          username,
          password: passwordPlain
        });
      } catch {
        response = await axios.post(`/api/auth/login`, {
          username,
          password: passwordPlain
        });
      }

      const data = response.data || {};
      if (data.accessToken || data.token) {
        const user = data.user || { id: username, username, role: 'CASHIER' };
        const accessToken = data.accessToken || data.token;
        const refreshToken = data.refreshToken || null;

        TokenProvider.setSession(user, accessToken, refreshToken);

        const sessionUser = {
          id: user.id || user.user_id || username,
          username: user.username || user.User_Name || username,
          role: (user.role || user.Role || 'CASHIER') as Role
        };

        return { success: true, user: sessionUser };
      }
      return { success: false, error: "Invalid response format from server" };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "خطأ في تسجيل الدخول للنبضة الأساسية";
      return { success: false, error: msg };
    }
  }

  static async refreshToken(): Promise<{ success: boolean; accessToken?: string; error?: string }> {
    try {
      const token = await TokenProvider.refreshAccessToken();
      return { success: true, accessToken: token };
    } catch (err: any) {
      return { success: false, error: err.message || "Auth error" };
    }
  }

  static async logout(): Promise<void> {
    await TokenProvider.logout();
  }

  static clear(): void {
    TokenProvider.clearSession();
  }

  static getCurrentUser(): AuthState['user'] {
    const user = TokenProvider.getCurrentSession().user;
    if (!user) return null;
    return {
      id: user.id || (user as any).user_id || '',
      username: user.username || (user as any).User_Name || '',
      role: (user.role || (user as any).Role || 'CASHIER') as Role
    };
  }

  static getAccessToken(): string | null {
    return TokenProvider.getAccessToken();
  }

  static can(permission: Permission): boolean {
    const session = TokenProvider.getCurrentSession();
    if (!session.user) return false;
    return useAuthStore.getState().hasPermission(permission);
  }
}

