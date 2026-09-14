// scripts/test-phase8.5-reporting-ui.ts
// Phase 8.5 Enterprise Reporting UI & Presentation Integration Verification Suite

import { EnterpriseReportingService } from '../src/features/reports/services/enterpriseReportingService';
import { ReportEngine } from '../src/services/reports/reportEngine';
import { ExportService } from '../src/services/data/exportService';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 PHARMAFLOW PRO — PHASE 8.5 REPORTING UI INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // Test Suite 1: EnterpriseReportingService Fallback & Contract Tests
  console.log('📋 SUITE 1: EnterpriseReportingService Architecture & Metadata Contract');
  try {
    const trialBalanceReport = await EnterpriseReportingService.fetchReport('trial-balance', {
      startDate: '2026-01-01',
      endDate: '2026-12-31'
    });
    assert(trialBalanceReport !== null, 'Report response is non-null');
    assert(trialBalanceReport.success === true, 'Report response returns success: true');
    assert(trialBalanceReport.reportType === 'trial-balance', 'ReportType preserved');
    assert(trialBalanceReport.syncMetadata !== undefined, 'Report contains syncMetadata');
    assert(typeof trialBalanceReport.syncMetadata.overallState === 'string', 'syncMetadata has valid overallState');
    assert(typeof trialBalanceReport.generatedAt === 'string', 'Report has valid generatedAt ISO string');
    assert(trialBalanceReport.data !== undefined, 'Report has data payload');
  } catch (err: any) {
    assert(false, 'fetchReport execution threw unexpected error', err.message);
  }

  // Test Suite 2: All Standard Financial Report Types Fallback Calculation
  console.log('\n📋 SUITE 2: Multi-Report Types Generation');
  const reportTypes = [
    'trial-balance',
    'profit-loss',
    'balance-sheet',
    'cash-flow',
    'inventory-valuation',
    'customer-balances',
    'supplier-balances',
    'tax-report'
  ] as const;

  for (const rType of reportTypes) {
    try {
      const res = await EnterpriseReportingService.fetchReport(rType, {
        startDate: '2026-01-01',
        endDate: '2026-12-31'
      });
      assert(res.success === true && res.data !== null, `Generate report type: ${rType}`);
    } catch (err: any) {
      assert(false, `Generate report type: ${rType} failed`, err.message);
    }
  }

  // Test Suite 3: Branch Fetching & Meta Routing
  console.log('\n📋 SUITE 3: Multi-Branch & Consolidation Discovery');
  try {
    const branches = await EnterpriseReportingService.fetchBranches();
    assert(Array.isArray(branches), 'fetchBranches returns an array');
    assert(branches.length > 0, 'fetchBranches returns at least default/consolidated branch');
    assert(branches.some(b => b.id === 'all'), 'Contains consolidated branch option');
  } catch (err: any) {
    assert(false, 'fetchBranches threw unexpected error', err.message);
  }

  // Test Suite 4: Export Service Integration Verification
  console.log('\n📋 SUITE 4: Export Formatting Integration');
  try {
    const mockData = [
      { id: '1', name: 'أصل تجريبي', debit: 500, credit: 0 },
      { id: '2', name: 'التزام تجريبي', debit: 0, credit: 500 }
    ];

    assert(typeof ExportService.exportToExcel === 'function', 'ExportService has exportToExcel method');
    assert(typeof ExportService.exportToPDF === 'function', 'ExportService has exportToPDF method');
    assert(typeof EnterpriseReportingService.exportReport === 'function', 'EnterpriseReportingService has exportReport method');
  } catch (err: any) {
    assert(false, 'Export service verification failed', err.message);
  }

  // Test Suite 5: Sync Metadata Quality & Freshness Standards
  console.log('\n📋 SUITE 5: ReportingSyncMetadata Quality Assurance');
  try {
    const reportWithMeta = await EnterpriseReportingService.fetchReport('profit-loss', {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      branchId: 'main'
    });

    const meta = reportWithMeta.syncMetadata;
    assert(['CLOUD_AUTHORITATIVE', 'SYNCED', 'LOCAL_UNSYNCED', 'PARTIALLY_SYNCED', 'CONFLICTED', 'LOCAL_OFFLINE'].includes(meta.overallState), 'OverallState is a recognized sync tag');
    assert(typeof meta.hasUnsyncedData === 'boolean', 'hasUnsyncedData is boolean');
    assert(typeof meta.hasConflictedData === 'boolean', 'hasConflictedData is boolean');
    assert(typeof meta.authoritativeRecordsCount === 'number', 'authoritativeRecordsCount is numeric');
    assert(typeof meta.asOfServerTimestamp === 'number', 'asOfServerTimestamp is numeric timestamp');
  } catch (err: any) {
    assert(false, 'Sync metadata verification threw error', err.message);
  }

  console.log('\n================================================================');
  console.log(`🏁 TEST RUN SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
