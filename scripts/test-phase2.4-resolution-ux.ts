// scripts/test-phase2.4-resolution-ux.ts
/**
 * PharmaFlow PRO ERP — Phase 2.4 Verification Suite
 * Smart Import Review & Human Resolution UX & Pharmaceutical Safety Shield
 */

import { ResolutionPolicy } from '../src/features/purchases/services/smartImport/domain/resolution.policy';
import { BatchSessionService } from '../src/features/purchases/services/smartImport/batchProcessing/batchSessionService';
import { BatchDecisionValidator } from '../src/features/purchases/services/smartImport/batchProcessing/batchDecisionValidator';
import { ProductResolutionAction, SupplierResolutionAction } from '../src/features/purchases/services/smartImport/batchProcessing/types';
import { ImportAnalysisResult } from '../src/features/purchases/services/smartImport/types';
import { Product, Supplier } from '../src/types';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passedTests++;
  } else {
    console.error(`  \x1b[31m✘ FAIL\x1b[0m: ${testName}`, details ? details : '');
    failedTests++;
  }
}

async function runPhase24Tests() {
  console.log('\n======================================================================');
  console.log('🧪 PharmaFlow PRO ERP — Phase 2.4: Smart Import Review & Human Resolution UX');
  console.log('======================================================================\n');

  // Test Suite 1: Domain Policy - Dosage Safety Shield
  console.log('🔹 Test Suite 1: ResolutionPolicy — Dosage & Form Safety Guard');
  {
    // Case 1: Exact dosage and form match
    const safeReport = ResolutionPolicy.evaluateDosageSafety(
      'Cataflam Tab 50mg',
      'Cataflam 50mg Tablets'
    );
    assert(safeReport.isConflict === false, 'Detects matching 50mg tablet as safe');

    // Case 2: Dosage conflict (500mg vs 1000mg)
    const dosageConflictReport = ResolutionPolicy.evaluateDosageSafety(
      'Augmentin 1g Tab',
      'Augmentin 500mg Tab'
    );
    assert(
      dosageConflictReport.isConflict === true && dosageConflictReport.conflictType === 'DOSAGE_MISMATCH',
      'Identifies dosage mismatch conflict (1g vs 500mg)',
      dosageConflictReport
    );

    // Case 3: Form conflict (Tablet vs Syrup)
    const formConflictReport = ResolutionPolicy.evaluateDosageSafety(
      'Brufen Syrup 100mg/5ml',
      'Brufen 400mg Tablets'
    );
    assert(
      formConflictReport.isConflict === true && (formConflictReport.conflictType === 'FORM_MISMATCH' || formConflictReport.conflictType === 'DOSAGE_MISMATCH'),
      'Identifies pharmaceutical form/dosage conflict (Syrup vs Tablet)',
      formConflictReport
    );
  }

  // Test Suite 2: Domain Policy - Auto-Resolution Eligibility
  console.log('\n🔹 Test Suite 2: ResolutionPolicy — Auto-Resolution Eligibility Rules');
  {
    // Item with dosage conflict cannot be auto-resolved
    const itemWithConflict: any = {
      id: 'row-1',
      sourceRowId: 1,
      importedName: 'Panadol 1000mg',
      candidateProducts: [{ id: 'p-1', name: 'Panadol 500mg', score: 0.95 }],
      dosageSafety: { isConflict: true, conflictType: 'DOSAGE_MISMATCH', reason: 'تعارض جرعة' },
      status: 'PENDING_REVIEW',
      confidence: 0.95
    };
    const eligible1 = ResolutionPolicy.isAutoResolutionEligible(itemWithConflict);
    assert(eligible1 === false, 'Blocks auto-resolution when item has dosage safety conflict');

    // Item with high confidence and no conflict can be auto-resolved
    const safeItem: any = {
      id: 'row-2',
      sourceRowId: 2,
      importedName: 'Panadol Extra 500mg',
      candidateProducts: [{ id: 'p-2', name: 'Panadol Extra Tab 500mg', score: 0.96 }],
      dosageSafety: { isConflict: false },
      status: 'PENDING_REVIEW',
      confidence: 0.96
    };
    const eligible2 = ResolutionPolicy.isAutoResolutionEligible(safeItem);
    assert(eligible2 === true, 'Allows auto-resolution for safe high-confidence match');

    // Low confidence item cannot be auto-resolved
    const lowConfItem: any = {
      id: 'row-3',
      sourceRowId: 3,
      importedName: 'Unknown Product XYZ',
      candidateProducts: [],
      dosageSafety: { isConflict: false },
      status: 'PENDING_REVIEW',
      confidence: 0.4
    };
    const eligible3 = ResolutionPolicy.isAutoResolutionEligible(lowConfItem);
    assert(eligible3 === false, 'Blocks auto-resolution for low-confidence item');
  }

  // Test Suite 3: Batch Processing Center Integration & Safety Guard
  console.log('\n🔹 Test Suite 3: BatchSessionService Initial Resolution with Safety Evaluation');
  {
    const mockDbProducts: Product[] = [
      { id: 'prod-aug-500', name: 'Augmentin 500mg Tab', Name: 'Augmentin 500mg Tab', barcode: '111111', UnitPrice: 50 } as any,
      { id: 'prod-panadol-extra', name: 'Panadol Extra Tab 500mg', Name: 'Panadol Extra Tab 500mg', barcode: '222222', UnitPrice: 20 } as any
    ];

    const mockDbSuppliers: Supplier[] = [
      { id: 'sup-1', Supplier_ID: 'SUP-001', Supplier_Name: 'شركة المتحدة للصيادلة' } as any
    ];

    const mockAnalysis: ImportAnalysisResult = {
      sourceType: 'EXCEL',
      fileName: 'invoice_test.xlsx',
      fileSize: 1024,
      detectedColumns: [],
      headerRowIndex: 0,
      rows: [
        {
          rowNumber: 1,
          rawCells: {},
          productName: 'Panadol Extra 500mg',
          quantity: 10,
          unitPrice: 20,
          total: 200,
          status: 'VALID',
          confidenceScore: 0.95,
          validationIssues: []
        },
        {
          rowNumber: 2,
          rawCells: {},
          productName: 'Augmentin 1000mg Tab', // Dangerous dosage difference with database (500mg)
          quantity: 5,
          unitPrice: 80,
          total: 400,
          status: 'VALID',
          confidenceScore: 0.85,
          validationIssues: []
        }
      ],
      summary: {
        totalRowsDetected: 2,
        validRowsCount: 2,
        reviewRequiredCount: 1,
        skippedRowsCount: 0,
        newProductCandidatesCount: 0,
        duplicateCandidatesCount: 0,
        totalInvoiceAmount: 600,
        detectedSupplier: 'شركة المتحدة للصيادلة',
        detectedInvoiceNumber: 'INV-2026-001',
        detectedDate: '2026-04-01'
      },
      metadata: {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        userId: 'user-1',
        analyzedAt: new Date().toISOString(),
        processingTimeMs: 40
      }
    };

    const session = BatchSessionService.createSession(mockAnalysis, {
      existingProducts: mockDbProducts,
      existingSuppliers: mockDbSuppliers,
      tenantId: 'tenant-1'
    });

    // Verify row 1: Safe match
    const row1 = session.productDecisions.find(p => p.sourceRowId === 1);
    assert(row1?.action === ProductResolutionAction.AUTO_MATCH, 'Row 1 (Safe Panadol 500mg) is AUTO_MATCHED');
    assert(row1?.dosageSafety?.isConflict === false, 'Row 1 dosageSafety indicates no conflict');

    // Verify row 2: Dangerous Dosage conflict (1000mg vs 500mg)
    const row2 = session.productDecisions.find(p => p.sourceRowId === 2);
    assert(row2?.dosageSafety?.isConflict === true, 'Row 2 (Augmentin 1000mg vs 500mg) is detected as DOSAGE_MISMATCH');
    assert(row2?.action === ProductResolutionAction.UNRESOLVED, 'Row 2 is BLOCKED from AUTO_MATCH and marked UNRESOLVED');

    // Summary checks
    assert(session.summary.criticalConflictsCount === 1, 'Batch summary reports 1 critical conflict');
    assert(session.summary.unresolvedCount === 1, 'Batch summary reports 1 unresolved item');
  }

  // Test Suite 4: Batch Decision Validator Blocking Checks
  console.log('\n🔹 Test Suite 4: BatchDecisionValidator — Enforcing Human Resolution Safety');
  {
    const mockDbProducts: Product[] = [
      { id: 'sup-prod-1', name: 'Augmentin 500mg Tab', Name: 'Augmentin 500mg Tab', barcode: '111111', UnitPrice: 50 } as any
    ];

    const mockDbSuppliers: Supplier[] = [
      { id: 'sup-1', Supplier_ID: 'SUP-001', Supplier_Name: 'شركة المتحدة' } as any
    ];

    const mockSessionWithConflict: any = {
      sessionId: 'sess-test-4',
      tenantId: 'tenant-1',
      status: 'RESOLVING',
      supplierDecision: {
        action: SupplierResolutionAction.LINK_EXISTING,
        matchedSupplierId: 'sup-1',
        matchedSupplierName: 'شركة المتحدة',
        isSkipped: false
      },
      productDecisions: [
        {
          sourceRowId: 1,
          importedProductName: 'Augmentin 1000mg Tab',
          action: ProductResolutionAction.AUTO_MATCH, // Trying to auto-match unsafe item
          dosageSafety: { isConflict: true, reason: 'تعارض جرعة: 1000mg vs 500mg' },
          matchedProductId: 'sup-prod-1',
          matchedProductName: 'Augmentin 500mg Tab',
          isSkipped: false,
          quantity: 10,
          unitPrice: 50,
          total: 500
        }
      ]
    };

    const validation = BatchDecisionValidator.validate(mockSessionWithConflict, {
      tenantId: 'tenant-1',
      existingProducts: mockDbProducts,
      existingSuppliers: mockDbSuppliers
    });

    assert(validation.canApply === false, 'Validator blocks session with unaddressed dosage safety conflict');
    assert(
      validation.errors.some(e => e.code === 'DOSAGE_SAFETY_CONFLICT'),
      'Validator issues specific DOSAGE_SAFETY_CONFLICT error code',
      validation.errors
    );

    // Now resolve by user decision (CREATE_NEW)
    mockSessionWithConflict.productDecisions[0].action = ProductResolutionAction.CREATE_NEW;
    mockSessionWithConflict.productDecisions[0].userDecision = 'CREATE_NEW';
    mockSessionWithConflict.productDecisions[0].newProductData = {
      name: 'Augmentin 1000mg Tab',
      strength: '1000mg',
      form: 'tab'
    };

    const validationAfterResolve = BatchDecisionValidator.validate(mockSessionWithConflict, {
      tenantId: 'tenant-1',
      existingProducts: mockDbProducts,
      existingSuppliers: mockDbSuppliers
    });
    assert(validationAfterResolve.canApply === true, 'Validator approves session after user resolves conflict as CREATE_NEW');
  }

  console.log('\n======================================================================');
  console.log(`🏁 Verification Finished: \x1b[32m${passedTests} Passed\x1b[0m, \x1b[31m${failedTests} Failed\x1b[0m`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase24Tests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
