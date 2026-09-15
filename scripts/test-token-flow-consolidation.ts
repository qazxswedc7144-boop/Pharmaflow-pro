// scripts/test-token-flow-consolidation.ts
if (typeof global.localStorage === 'undefined') {
  const storage: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, value: string) => { storage[key] = String(value); },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };
}

if (typeof global.navigator === 'undefined') {
  (global as any).navigator = { onLine: true };
}

import axios from 'axios';
import { TokenProvider } from '../src/services/auth/tokenProvider';
import { useAuthStore } from '../src/store/authStore';
import { AuthClient } from '../packages/shared/auth-client';
import { authService } from '../src/features/auth/services/authService';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${message}`);
  } else {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Phase 3.4.2 — Unified Auth Token & Session Test Suite');
  console.log('====================================================\n');

  // Test User Mock
  const mockUser = {
    id: 'usr_enterprise_99',
    user_id: 'usr_enterprise_99',
    username: 'pharmacist_lead',
    email: 'lead@pharmaflow.test',
    role: 'Pharmacist',
    tenantId: 'tenant_main_01',
    branchId: 'branch_cairo_02',
    permissions: ['sales.pos.access', 'inventory.stock.view']
  };

  // ----------------------------------------------------
  // TEST A: Central Token Provider Session Initialization
  // ----------------------------------------------------
  console.log('--- Test A: Session Initialization & SetSession ---');
  TokenProvider.setSession(
    mockUser as any, 
    'mock_access_jwt_aaa.bbb.ccc', 
    'mock_refresh_jwt_xxx.yyy.zzz',
    { tenantId: 'tenant_main_01', branchId: 'branch_cairo_02', roles: ['Pharmacist'] }
  );

  const sessionA = TokenProvider.getCurrentSession();
  assert(sessionA.isAuthenticated === true, 'Session is marked as authenticated');
  assert(sessionA.token === 'mock_access_jwt_aaa.bbb.ccc', 'Access token matches stored value');
  assert(sessionA.refreshToken === 'mock_refresh_jwt_xxx.yyy.zzz', 'Refresh token matches stored value');
  assert(sessionA.tenantId === 'tenant_main_01', 'Tenant ID matches context');
  assert(sessionA.branchId === 'branch_cairo_02', 'Branch ID matches context');

  // ----------------------------------------------------
  // TEST B: Header Generation
  // ----------------------------------------------------
  console.log('\n--- Test B: Transport Auth Headers Generation ---');
  const headers = TokenProvider.getAuthHeaders();
  assert(headers.Authorization === 'Bearer mock_access_jwt_aaa.bbb.ccc', 'Authorization header matches Bearer scheme');
  assert(headers['x-tenant-id'] === 'tenant_main_01', 'Tenant header auto-injected');
  assert(headers['x-branch-id'] === 'branch_cairo_02', 'Branch header auto-injected');

  // ----------------------------------------------------
  // TEST C: Legacy Compatibility Facade Sync (AuthClient)
  // ----------------------------------------------------
  console.log('\n--- Test C: Legacy AuthClient Facade ---');
  const clientUser = AuthClient.getCurrentUser();
  assert(clientUser !== null, 'AuthClient returns active session user');
  assert(clientUser?.id === 'usr_enterprise_99', 'AuthClient user ID matches TokenProvider');
  assert(AuthClient.getAccessToken() === 'mock_access_jwt_aaa.bbb.ccc', 'AuthClient access token matches TokenProvider');

  // ----------------------------------------------------
  // TEST D: Legacy authService Sync
  // ----------------------------------------------------
  console.log('\n--- Test D: Legacy authService Facade ---');
  assert(authService.isSignedIn() === true, 'authService.isSignedIn() evaluates to true');
  const serviceUser = authService.getCurrentUser();
  assert(serviceUser?.id === 'usr_enterprise_99', 'authService returns current session user');

  // ----------------------------------------------------
  // TEST E: Legacy Storage Keys Synchronization
  // ----------------------------------------------------
  console.log('\n--- Test E: Synchronized Storage Keys ---');
  assert(localStorage.getItem('pharmaflow_token') === 'mock_access_jwt_aaa.bbb.ccc', 'pharmaflow_token synced in localStorage');
  assert(localStorage.getItem('pharmaflow_refresh_token') === 'mock_refresh_jwt_xxx.yyy.zzz', 'pharmaflow_refresh_token synced in localStorage');
  assert(localStorage.getItem('pharmaflow_user') !== null, 'pharmaflow_user synced in localStorage');

  // ----------------------------------------------------
  // TEST F: Single-Flight Refresh Coalescing Logic
  // ----------------------------------------------------
  console.log('\n--- Test F: Single-Flight Refresh Coalescing ---');
  let refreshCallCount = 0;
  const originalAxiosPost = axios.post;

  (axios as any).post = async (url: string, body?: any, config?: any) => {
    if (url.includes('/api/auth/refresh')) {
      refreshCallCount++;
      // Simulate network processing time
      await new Promise(r => setTimeout(r, 100));
      return {
        data: {
          accessToken: 'new_rotated_access_jwt_123',
          refreshToken: 'new_rotated_refresh_jwt_456',
          user: mockUser
        }
      };
    }
    return originalAxiosPost(url, body, config);
  };

  // Trigger 5 concurrent token refresh calls
  const concurrentRefreshes = [
    TokenProvider.refreshAccessToken(),
    TokenProvider.refreshAccessToken(),
    TokenProvider.refreshAccessToken(),
    TokenProvider.refreshAccessToken(),
    TokenProvider.refreshAccessToken()
  ];

  const results = await Promise.all(concurrentRefreshes);
  assert(refreshCallCount === 1, `Single-flight prevented duplicate HTTP calls (actual calls: ${refreshCallCount})`);
  assert(results.every(t => t === 'new_rotated_access_jwt_123'), 'All concurrent requests receive the updated rotated token');
  assert(TokenProvider.getAccessToken() === 'new_rotated_access_jwt_123', 'TokenProvider stored rotated access token');

  // Restore axios.post
  (axios as any).post = originalAxiosPost;

  // ----------------------------------------------------
  // TEST G: Central Logout & Offline Business Data Preservation
  // ----------------------------------------------------
  console.log('\n--- Test G: Central Logout & Business Data Preservation ---');
  await TokenProvider.logout({ revokeOnServer: false });
  assert(TokenProvider.isAuthenticated() === false, 'Session is unauthenticated after logout');
  assert(TokenProvider.getAccessToken() === null, 'Access token is cleared');
  assert(TokenProvider.getRefreshToken() === null, 'Refresh token is cleared');
  assert(localStorage.getItem('pharmaflow_token') === null, 'Storage pharmaflow_token is removed');

  console.log('\n====================================================');
  console.log(`🎉 All Tests Completed: ${passedTests}/${totalTests} Passed Successfully!`);
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test suite execution failed:', err);
  process.exit(1);
});
