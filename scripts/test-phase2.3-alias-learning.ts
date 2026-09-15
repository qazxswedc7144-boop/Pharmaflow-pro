// scripts/test-phase2.3-alias-learning.ts
/**
 * PharmaFlow PRO ERP — Phase 2.3 Verification Suite
 * Supplier & Product Alias Learning System & Multi-Tier Intelligence
 */

import {
  AliasConfidencePolicy,
  AliasNormalization,
  SupplierAliasRepository,
  ProductAliasRepository,
  AliasMatchingEngine,
  AliasAuditService
} from '../src/features/purchases/services/smartImport/aliasLearning';
import { BatchSessionService } from '../src/features/purchases/services/smartImport/batchProcessing/batchSessionService';
import { BatchResolutionService } from '../src/features/purchases/services/smartImport/batchProcessing/batchResolutionService';
import { ProductResolutionAction, SupplierResolutionAction, BatchProcessingStatus } from '../src/features/purchases/services/smartImport/batchProcessing/types';
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

async function runPhase23Tests() {
  console.log('\n======================================================================');
  console.log('🧪 PharmaFlow PRO ERP — Phase 2.3: Supplier & Product Alias Learning Suite');
  console.log('======================================================================\n');

  // Test 1: Alias Normalization & Strength/Form Extraction
  console.log('🔹 Test Suite 1: Arabic/Latin Normalization & Dosage Safety Extraction');
  {
    const rawArabic = '  شـــــركة  الـفـارابـــي  للأدوية   المحدودة  ';
    const normArabic = AliasNormalization.normalizeSupplier(rawArabic);
    assert(normArabic === 'الفارابي', 'Normalizes supplier name removing prefixes/suffixes and tatweel', { normArabic });

    const rawDrug1 = 'PANADOL EXTRA TAB 500MG';
    const rawDrug2 = 'Panadol Extra Tab 1000mg';
    const rawDrug3 = 'Panadol Extra Syrup 500mg';

    const info1 = AliasNormalization.extractStrengthAndForm(rawDrug1);
    const info2 = AliasNormalization.extractStrengthAndForm(rawDrug2);
    const info3 = AliasNormalization.extractStrengthAndForm(rawDrug3);

    assert(info1.dosage?.value === 500 && info1.form === 'tab', 'Extracts strength 500mg and tablet form');
    assert(info2.dosage?.value === 1000 && info2.form === 'tab', 'Extracts strength 1000mg and tablet form');
    assert(info3.dosage?.value === 500 && info3.form === 'syrup', 'Extracts strength 500mg and syrup form');

    const safetyConflict = AliasNormalization.checkDosageAndFormSafety(rawDrug1, rawDrug2);
    assert(safetyConflict.isSafe === false && safetyConflict.reason?.includes('تعارض في الجرعة'), 'Prevents matching 500mg with 1000mg (Anti-Pollution Safety Guard)');

    const formConflict = AliasNormalization.checkDosageAndFormSafety(rawDrug1, rawDrug3);
    assert(formConflict.isSafe === false && formConflict.reason?.includes('تعارض في الشكل الدوائي'), 'Prevents matching Tablet with Syrup');

    const safeMatch = AliasNormalization.checkDosageAndFormSafety('Augmentin 625mg Tab', 'AUGMENTIN TAB 625 MG');
    assert(safeMatch.isSafe === true, 'Allows matching same strength and form');
  }

  // Test 2: Explainable Confidence Scoring Policy
  console.log('\n🔹 Test Suite 2: Explainable Confidence Scoring & Rejection Policy');
  {
    const score1 = AliasConfidencePolicy.calculateScore({
      usageCount: 1,
      confirmationCount: 1,
      rejectionCount: 0,
      lastUsedAt: new Date().toISOString()
    });
    assert(score1 >= 0.90 && score1 <= 0.96, 'Initial confirmed alias score is in valid confident range (~0.92-0.95)', { score1 });

    const scoreFrequent = AliasConfidencePolicy.calculateScore({
      usageCount: 10,
      confirmationCount: 4,
      rejectionCount: 0,
      lastUsedAt: new Date().toISOString()
    });
    assert(scoreFrequent >= score1 && scoreFrequent >= 0.98, 'Frequent usage boosts score up to ~0.98+', { scoreFrequent });

    const scorePenalized = AliasConfidencePolicy.calculateScore({
      usageCount: 5,
      confirmationCount: 2,
      rejectionCount: 3,
      lastUsedAt: new Date().toISOString()
    });
    assert(scorePenalized < 0.70, 'Rejection penalty significantly drops confidence below auto-match threshold', { scorePenalized });
  }

  // Test 3: Multi-Tenant Isolation in Repositories
  console.log('\n🔹 Test Suite 3: Multi-Tenant Data Isolation');
  {
    const tenantA = 'tenant-cairo-001';
    const tenantB = 'tenant-alex-002';

    // Save alias in Tenant A
    await ProductAliasRepository.upsertProductAlias({
      tenantId: tenantA,
      supplierId: 'SUP-01',
      productId: 'PROD-A1',
      rawAlias: 'Congestal Cold Tab 20s',
      isGlobal: false,
      confidenceScore: 0.92,
      confirmationCount: 1,
      usageCount: 1
    });

    // Check retrieval in Tenant A
    const retrievedA = await ProductAliasRepository.findProductAlias(tenantA, 'SUP-01', 'Congestal Cold Tab 20s');
    assert(retrievedA !== null && retrievedA.productId === 'PROD-A1', 'Tenant A successfully finds its learned product alias');

    // Check Tenant B cannot see Tenant A's alias
    const retrievedB = await ProductAliasRepository.findProductAlias(tenantB, 'SUP-01', 'Congestal Cold Tab 20s');
    assert(retrievedB === null, 'Tenant B strictly isolated: Cannot see Tenant A alias');
  }

  // Test 4: 8-Tier Matching Hierarchy
  console.log('\n🔹 Test Suite 4: 8-Tier Hierarchical Matching Engine');
  {
    const tenantId = 'tenant-test-hierarchy';
    const supplierId = 'SUPP-UNITED';

    const testProducts: Product[] = [
      {
        id: 'P-101',
        name: 'Panadol Extra 500mg Tab',
        Name: 'Panadol Extra 500mg Tab',
        barcode: '6221234567890',
        CostPrice: 20,
        UnitPrice: 25,
        StockQuantity: 100,
        Is_Active: true
      },
      {
        id: 'P-102',
        name: 'Cataflam 50mg Tablets',
        Name: 'Cataflam 50mg Tablets',
        barcode: '6229876543210',
        CostPrice: 35,
        UnitPrice: 42,
        StockQuantity: 50,
        Is_Active: true
      },
      {
        id: 'P-103',
        name: 'Brufen 400mg Syrup',
        Name: 'Brufen 400mg Syrup',
        barcode: '6225555555555',
        CostPrice: 15,
        UnitPrice: 20,
        StockQuantity: 30,
        Is_Active: true
      }
    ];

    // Seed Supplier Catalog Reference: Supplier code 'CAT-99' -> 'P-102'
    await ProductAliasRepository.upsertSupplierProductRef({
      tenantId,
      supplierId,
      supplierProductCode: 'CAT-99',
      productId: 'P-102'
    });

    // Seed Supplier-Specific Alias: 'PNDL XTRA' -> 'P-101'
    await ProductAliasRepository.upsertProductAlias({
      tenantId,
      supplierId,
      productId: 'P-101',
      rawAlias: 'PNDL XTRA',
      isGlobal: false,
      confidenceScore: 0.95,
      confirmationCount: 2,
      usageCount: 2
    });

    // Preload context for matching
    const preloaded = await AliasMatchingEngine.preloadBatchContext(
      tenantId,
      supplierId,
      [
        { productName: 'PNDL XTRA' },
        { productName: 'Random Text Name', productCode: 'CAT-99' },
        { productName: 'Unrecognized Dist Name', barcode: '6225555555555' },
        { productName: 'Cataflam 50mg Tablets' }
      ]
    );

    // 1. Tier 1 Test: Supplier-Specific Alias
    const matchTier1 = AliasMatchingEngine.matchRow(
      { productName: 'PNDL XTRA' },
      testProducts,
      { tenantId, supplierId, preloaded }
    );
    assert(
      matchTier1 !== null && matchTier1.matchType === 'SUPPLIER_ALIAS' && matchTier1.productId === 'P-101',
      'Tier 1: Accurately matches supplier-specific learned alias'
    );

    // 2. Tier 3 Test: Catalog Reference by Supplier Code
    const matchTier3 = AliasMatchingEngine.matchRow(
      { productName: 'Random Text Name', productCode: 'CAT-99' },
      testProducts,
      { tenantId, supplierId, preloaded }
    );
    assert(
      matchTier3 !== null && matchTier3.matchType === 'SUPPLIER_CATALOG_REF' && matchTier3.productId === 'P-102',
      'Tier 3: Accurately matches supplier catalog item code'
    );

    // 3. Tier 4 Test: Barcode Match
    const matchTier4 = AliasMatchingEngine.matchRow(
      { productName: 'Unrecognized Dist Name', barcode: '6225555555555' },
      testProducts,
      { tenantId, supplierId, preloaded }
    );
    assert(
      matchTier4 !== null && matchTier4.matchType === 'BARCODE' && matchTier4.productId === 'P-103',
      'Tier 4: Accurately matches by Barcode regardless of name difference'
    );

    // 4. Tier 5 Test: Exact Name Match
    const matchTier5 = AliasMatchingEngine.matchRow(
      { productName: 'Cataflam 50mg Tablets' },
      testProducts,
      { tenantId, supplierId, preloaded }
    );
    assert(
      matchTier5 !== null && matchTier5.matchType === 'EXACT' && matchTier5.productId === 'P-102',
      'Tier 5: Accurately matches Exact Name'
    );
  }

  // Test 5: Rejection Recording & Audit Logging
  console.log('\n🔹 Test Suite 5: Negative Feedback & Audit Log Flow');
  {
    const tenantId = 'tenant-audit-test';
    const supplierId = 'SUPP-DELTA';

    // Record Rejection
    await ProductAliasRepository.recordRejection({
      tenantId,
      supplierId,
      rawName: 'Amoclan 1g Tab',
      rejectedProductId: 'P-WRONG-500MG',
      reason: 'User manually unlinked incorrect strength suggestion'
    });

    const isRejected = await ProductAliasRepository.isAliasRejected(
      tenantId,
      supplierId,
      'Amoclan 1g Tab',
      'P-WRONG-500MG'
    );
    assert(isRejected === true, 'Rejection recorded and verified in repository');

    // Check Audit Log entry
    await AliasAuditService.log({
      tenantId,
      userId: 'USR-ADMIN',
      action: 'PRODUCT_ALIAS_REJECTED',
      aliasType: 'PRODUCT',
      rawImportedValue: 'Amoclan 1g Tab',
      normalizedValue: AliasNormalization.normalize('Amoclan 1g Tab'),
      decision: 'REJECT_INCORRECT_MATCH',
      supplierId,
      productId: 'P-WRONG-500MG',
      confidence: 0.40,
      details: 'User manually unlinked incorrect strength suggestion'
    });

    const logs = await AliasAuditService.getTenantLogs(tenantId, 10);
    assert(logs.length > 0 && logs[0].action === 'PRODUCT_ALIAS_REJECTED', 'Audit Log successfully records learning events with full provenance');
  }

  // Test 6: End-to-End Batch Learning Workflow
  console.log('\n🔹 Test Suite 6: End-to-End Batch Import Learning Simulation');
  {
    const tenantId = 'tenant-e2e-simulation';
    const branchId = 'BRANCH-1';
    const userId = 'USR-OPERATOR';

    const testSuppliers: Supplier[] = [
      {
        id: 'SUPP-EGYPT-PHARMA',
        Supplier_Name: 'الشركة المصرية لتجارة الأدوية',
        name: 'الشركة المصرية لتجارة الأدوية',
        Phone: '0100000000',
        Is_Active: true
      }
    ];

    const testProducts: Product[] = [
      {
        id: 'PROD-AUG-625',
        name: 'Augmentin 625mg 14 Tab',
        Name: 'Augmentin 625mg 14 Tab',
        barcode: '5000123456789',
        CostPrice: 80,
        UnitPrice: 95,
        StockQuantity: 200,
        Is_Active: true
      }
    ];

    // Session 1: Imported invoice with unfamiliar abbreviated supplier name & product name
    const initialSession = BatchSessionService.createSession({
      sourceType: 'PDF_INVOICE' as any,
      rows: [
        {
          sourceRowId: 1,
          productName: 'AUGM 625MG TAB 14S',
          quantity: 10,
          unitPrice: 80,
          totalPrice: 800,
          productCode: 'EGY-AUG-625',
          validationIssues: []
        }
      ],
      summary: {
        totalRows: 1,
        validRows: 1,
        errorRows: 0,
        totalAmount: 800,
        detectedSupplier: 'المصرية لتجارة الادوية (فرع القاهرة)',
        detectedInvoiceNumber: 'INV-2026-9901',
        detectedDate: '2026-08-23'
      },
      diagnostics: []
    }, {
      tenantId,
      branchId,
      userId,
      existingSuppliers: testSuppliers,
      existingProducts: testProducts
    });

    // User explicitly reviews and links supplier & product in UI
    initialSession.supplierDecision.action = SupplierResolutionAction.LINK_EXISTING;
    initialSession.supplierDecision.matchedSupplierId = 'SUPP-EGYPT-PHARMA';
    initialSession.supplierDecision.matchedSupplierName = 'الشركة المصرية لتجارة الأدوية';

    initialSession.productDecisions[0].action = ProductResolutionAction.LINK_EXISTING;
    initialSession.productDecisions[0].matchedProductId = 'PROD-AUG-625';
    initialSession.productDecisions[0].matchedProductName = 'Augmentin 625mg 14 Tab';

    // Apply batch with Alias Learning
    const applyResult = await BatchResolutionService.applyBatch(initialSession, {
      tenantId,
      branchId,
      userId,
      idempotencyKey: `IDEM-TEST-E2E-${Date.now()}`,
      masterData: {
        products: testProducts,
        suppliers: testSuppliers
      }
    });

    assert(applyResult.success === true, 'Batch applied successfully');
    assert(
      applyResult.aliasLearningSummary !== undefined &&
      applyResult.aliasLearningSummary.productAliasesLearned >= 1 &&
      applyResult.aliasLearningSummary.supplierAliasesLearned >= 1,
      'Alias Learning Engine successfully learned supplier and product aliases during batch application',
      applyResult.aliasLearningSummary
    );

    // Session 2: NEXT TIME same invoice / items arrive!
    // Preload alias context
    const preloadedContext = await AliasMatchingEngine.preloadBatchContext(
      tenantId,
      'SUPP-EGYPT-PHARMA',
      [{ productName: 'AUGM 625MG TAB 14S', productCode: 'EGY-AUG-625' }]
    );

    const secondSession = BatchSessionService.createSession({
      sourceType: 'PDF_INVOICE' as any,
      rows: [
        {
          sourceRowId: 1,
          productName: 'AUGM 625MG TAB 14S',
          quantity: 20,
          unitPrice: 80,
          totalPrice: 1600,
          productCode: 'EGY-AUG-625',
          validationIssues: []
        }
      ],
      summary: {
        totalRows: 1,
        validRows: 1,
        errorRows: 0,
        totalAmount: 1600,
        detectedSupplier: 'المصرية لتجارة الادوية (فرع القاهرة)',
        detectedInvoiceNumber: 'INV-2026-9902',
        detectedDate: '2026-08-23'
      },
      diagnostics: []
    }, {
      tenantId,
      branchId,
      userId,
      existingSuppliers: testSuppliers,
      existingProducts: testProducts,
      preloadedAliasContext: preloadedContext
    });

    assert(
      secondSession.supplierDecision.action === SupplierResolutionAction.AUTO_MATCH &&
      secondSession.supplierDecision.matchedSupplierId === 'SUPP-EGYPT-PHARMA',
      'Second Import: Supplier is instantly AUTO_MATCHED with 100% confidence via learned alias'
    );

    assert(
      secondSession.productDecisions[0].action === ProductResolutionAction.AUTO_MATCH &&
      secondSession.productDecisions[0].matchedProductId === 'PROD-AUG-625',
      'Second Import: Product is instantly AUTO_MATCHED with High Confidence via learned alias & catalog ref'
    );

    assert(
      secondSession.status === BatchProcessingStatus.READY_TO_APPLY,
      'Second Import: Entire batch achieves READY_TO_APPLY automatically without manual operator intervention'
    );
  }

  console.log('\n======================================================================');
  console.log(`📊 Phase 2.3 Verification Results: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase23Tests().catch(err => {
  console.error('💥 Test suite crashed:', err);
  process.exit(1);
});
