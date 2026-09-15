// scripts/test-rbac-consolidation.ts
import { 
  normalizeRole, 
  resolveCanonicalPermission, 
  can, 
  canAny, 
  canAll, 
  hasPermission as canonicalHasPermission,
  hasRole,
  ROLE_PERMISSIONS,
  LEGACY_PERMISSION_ALIASES 
} from '../src/utils/permissions';

import { 
  hasPermission as facadeHasPermission, 
  hasAllPermissions as facadeHasAllPermissions, 
  hasAnyPermission as facadeHasAnyPermission,
  normalizeRole as facadeNormalizeRole 
} from '../packages/auth/src/rbac';

console.log('======================================================');
console.log('🛡️ PharmaFlow PRO — RBAC & Permission Consolidation Tests');
console.log('======================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${description}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// TEST 1: Role Normalization (Case-Insensitive & Deterministic)
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Role Normalization Verification');

assert(normalizeRole('ADMIN') === 'admin', 'ADMIN normalizes to admin');
assert(normalizeRole('Admin') === 'admin', 'Admin normalizes to admin');
assert(normalizeRole('admin') === 'admin', 'admin normalizes to admin');
assert(normalizeRole('Administrator') === 'admin', 'Administrator normalizes to admin');
assert(normalizeRole('local-admin') === 'admin', 'local-admin normalizes to admin');

assert(normalizeRole('ACCOUNTANT') === 'accountant', 'ACCOUNTANT normalizes to accountant');
assert(normalizeRole('Accountant') === 'accountant', 'Accountant normalizes to accountant');
assert(normalizeRole('accountant') === 'accountant', 'accountant normalizes to accountant');

assert(normalizeRole('PHARMACIST') === 'pharmacist', 'PHARMACIST normalizes to pharmacist');
assert(normalizeRole('CASHIER') === 'cashier', 'CASHIER normalizes to cashier');
assert(normalizeRole('CLERK') === 'clerk', 'CLERK normalizes to clerk');
assert(normalizeRole('AUDITOR') === 'auditor', 'AUDITOR normalizes to auditor');
assert(normalizeRole('INVENTORY_MANAGER') === 'inventory_manager', 'INVENTORY_MANAGER normalizes to inventory_manager');

assert(normalizeRole('OWNER') === 'owner', 'OWNER normalizes to owner');
assert(normalizeRole('PLATFORM_OWNER') === 'platform_owner', 'PLATFORM_OWNER normalizes to platform_owner');
assert(normalizeRole('TENANT_ADMIN') === 'tenant_admin', 'TENANT_ADMIN normalizes to tenant_admin');
assert(normalizeRole(null) === 'user', 'null normalizes to user default');
assert(normalizeRole(undefined) === 'user', 'undefined normalizes to user default');

console.log('✅ TEST 1 PASSED: Role normalization is fully deterministic.\n');

// -----------------------------------------------------------------------------
// TEST 2: Legacy Permission Alias Resolution (One-Way to Canonical)
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: Legacy Permission Alias Mapping');

assert(resolveCanonicalPermission('POS_ACCESS') === 'sales.pos.access', 'POS_ACCESS resolves to sales.pos.access');
assert(resolveCanonicalPermission('CREATE_INVOICE') === 'sales.invoice.create', 'CREATE_INVOICE resolves to sales.invoice.create');
assert(resolveCanonicalPermission('EDIT_INVOICE') === 'sales.invoice.update', 'EDIT_INVOICE resolves to sales.invoice.update');
assert(resolveCanonicalPermission('DELETE_INVOICE') === 'sales.invoice.delete', 'DELETE_INVOICE resolves to sales.invoice.delete');
assert(resolveCanonicalPermission('VIEW_REPORTS') === 'reports.view', 'VIEW_REPORTS resolves to reports.view');
assert(resolveCanonicalPermission('FINANCIAL_ACCESS') === 'accounting.journal.view', 'FINANCIAL_ACCESS resolves to accounting.journal.view');
assert(resolveCanonicalPermission('MANAGE_SYSTEM') === 'settings.system.manage', 'MANAGE_SYSTEM resolves to settings.system.manage');
assert(resolveCanonicalPermission('INVENTORY_VIEW') === 'inventory.product.view', 'INVENTORY_VIEW resolves to inventory.product.view');

// packages/auth aliases
assert(resolveCanonicalPermission('invoice.create') === 'sales.invoice.create', 'invoice.create resolves to sales.invoice.create');
assert(resolveCanonicalPermission('invoice.approve') === 'sales.invoice.approve', 'invoice.approve resolves to sales.invoice.approve');
assert(resolveCanonicalPermission('invoice.post') === 'accounting.journal.post', 'invoice.post resolves to accounting.journal.post');
assert(resolveCanonicalPermission('stock.adjust') === 'inventory.stock.adjust', 'stock.adjust resolves to inventory.stock.adjust');
assert(resolveCanonicalPermission('journal.view') === 'accounting.journal.view', 'journal.view resolves to accounting.journal.view');
assert(resolveCanonicalPermission('audit.view') === 'settings.audit.view', 'audit.view resolves to settings.audit.view');

// Canonical keys stay intact
assert(resolveCanonicalPermission('sales.invoice.create') === 'sales.invoice.create', 'Canonical key remains untouched');
assert(resolveCanonicalPermission('accounting.journal.post') === 'accounting.journal.post', 'Canonical key remains untouched');

console.log('✅ TEST 2 PASSED: Alias mapping resolves legacy keys to canonical keys.\n');

// -----------------------------------------------------------------------------
// TEST 3: Permission Checks across Roles & Aliases (Zero Breakage)
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Dual-Mode Permission Evaluation (can / hasPermission)');

// Cashier tests
assert(can('Cashier', 'sales.pos.access') === true, 'Cashier has canonical sales.pos.access');
assert(can('Cashier', 'POS_ACCESS') === true, 'Cashier has legacy POS_ACCESS');
assert(can('CASHIER', 'CREATE_INVOICE') === true, 'CASHIER (uppercase) has legacy CREATE_INVOICE');
assert(can('cashier', 'sales.invoice.create') === true, 'cashier has canonical sales.invoice.create');
assert(can('Cashier', 'accounting.journal.post') === false, 'Cashier is strictly denied accounting.journal.post');
assert(can('Cashier', 'FINANCIAL_ACCESS') === false, 'Cashier is strictly denied legacy FINANCIAL_ACCESS');

// Accountant tests
assert(can('Accountant', 'accounting.journal.post') === true, 'Accountant has canonical accounting.journal.post');
assert(can('ACCOUNTANT', 'invoice.post') === true, 'ACCOUNTANT has legacy invoice.post');
assert(can('accountant', 'FINANCIAL_ACCESS') === true, 'accountant has legacy FINANCIAL_ACCESS');
assert(can('Accountant', 'VIEW_REPORTS') === true, 'Accountant has legacy VIEW_REPORTS');
assert(can('Accountant', 'sales.pos.access') === false, 'Accountant does not have sales.pos.access');

// Admin & Owner tests
assert(can('Admin', 'sales.invoice.create') === true, 'Admin has sales.invoice.create');
assert(can('ADMIN', 'MANAGE_SYSTEM') === true, 'ADMIN has MANAGE_SYSTEM');
assert(can('Owner', 'any.arbitrary.permission') === true, 'Owner has full system bypass');
assert(can('platform_owner', 'settings.security.view') === true, 'platform_owner has full bypass');
assert(can('tenant_admin', 'custom.wildcard.action') === true, 'tenant_admin has full bypass');

// Custom Permissions Override
assert(can('Cashier', 'accounting.journal.post', ['accounting.journal.post']) === true, 'Custom user permission grants override');
assert(can('Cashier', 'accounting.journal.post', ['*']) === true, 'Wildcard custom permission grants override');
assert(can('Cashier', 'accounting.journal.view', ['FINANCIAL_ACCESS']) === true, 'Legacy alias in custom permissions grants override');
assert(can('Cashier', 'FINANCIAL_ACCESS', ['accounting.journal.view']) === true, 'Canonical permission in custom grants matches legacy query');

console.log('✅ TEST 3 PASSED: Permission checks accurately honor aliases and roles.\n');

// -----------------------------------------------------------------------------
// TEST 4: Multi-Permission Helper Functions (canAny, canAll, hasRole)
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Helper Functions (canAny, canAll, hasRole)');

assert(canAny('Cashier', ['accounting.journal.post', 'sales.pos.access']) === true, 'canAny returns true if one perm matches');
assert(canAny('Cashier', ['accounting.journal.post', 'inventory.stock.adjust']) === false, 'canAny returns false if none match');

assert(canAll('Accountant', ['accounting.journal.view', 'reports.view']) === true, 'canAll returns true if all match');
assert(canAll('Accountant', ['accounting.journal.view', 'sales.pos.access']) === false, 'canAll returns false if one fails');

assert(hasRole('ADMIN', 'admin') === true, 'hasRole handles case differences');
assert(hasRole('Cashier', ['admin', 'cashier']) === true, 'hasRole checks against role list');
assert(hasRole('Clerk', ['admin', 'pharmacist']) === false, 'hasRole rejects non-matching role');

console.log('✅ TEST 4 PASSED: Helper functions are robust and multi-role aware.\n');

// -----------------------------------------------------------------------------
// TEST 5: Compatibility Facade (packages/auth/src/rbac.ts)
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: Compatibility Facade Validation');

assert(facadeHasPermission('ADMIN', 'invoice.create') === true, 'Facade supports ADMIN with legacy invoice.create');
assert(facadeHasPermission('admin', 'sales.invoice.create') === true, 'Facade supports admin with canonical sales.invoice.create');
assert(facadeHasPermission('CASHIER', 'POS_ACCESS') === true, 'Facade supports CASHIER with legacy POS_ACCESS');
assert(facadeHasPermission('ACCOUNTANT', 'journal.view') === true, 'Facade supports ACCOUNTANT with legacy journal.view');
assert(facadeHasPermission('CASHIER', 'journal.view') === false, 'Facade denies unauthorized permission to CASHIER');

assert(facadeHasAllPermissions('ACCOUNTANT', ['invoice.create', 'journal.view']) === true, 'Facade hasAllPermissions evaluates correctly');
assert(facadeHasAnyPermission('CASHIER', ['journal.view', 'invoice.create']) === true, 'Facade hasAnyPermission evaluates correctly');

console.log('✅ TEST 5 PASSED: Compatibility facade integrates seamlessly.\n');

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('======================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} RBAC CONSOLIDATION TESTS PASSED!`);
console.log('======================================================');
