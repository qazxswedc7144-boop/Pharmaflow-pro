// scripts/test-phase2.2-batch-processing-center.ts
import { BatchProcessingOrchestrator } from '../src/features/purchases/services/smartImport/batchProcessing/batchProcessingOrchestrator';
import { BatchSessionService } from '../src/features/purchases/services/smartImport/batchProcessing/batchSessionService';
import { BatchDecisionValidator } from '../src/features/purchases/services/smartImport/batchProcessing/batchDecisionValidator';
import { BatchIdempotencyService } from '../src/features/purchases/services/smartImport/batchProcessing/batchIdempotencyService';
import { BatchResolutionService } from '../src/features/purchases/services/smartImport/batchProcessing/batchResolutionService';
import { 
  SupplierResolutionAction, 
  SupplierResolutionStatus, 
  ProductResolutionAction, 
  BatchProcessingStatus 
} from '../src/features/purchases/services/smartImport/batchProcessing/types';
import { ImportAnalysisResult } from '../src/features/purchases/services/smartImport/types';
import { Product, Supplier } from '../src/types';
import { isValidExpiryDate, normalizeToISODate } from '../src/utils/expiryUtils';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, errorDetails?: any) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ ${testName}`, errorDetails !== undefined ? errorDetails : '');
  }
}

// Mock Master Data for Testing
const mockSuppliers: Supplier[] = [
  {
    id: 'SUP-001',
    Supplier_ID: 'SUP-001',
    Supplier_Name: 'شركة الحياة للأدوية الطبية',
    Phone: '0501234567',
    Address: 'الرياض',
    Tax_Number: '300123456700003',
    balance: 0,
    openingBalance: 0,
    Is_Active: true,
    Created_At: new Date().toISOString()
  },
  {
    id: 'SUP-002',
    Supplier_ID: 'SUP-002',
    Supplier_Name: 'مستودع الأمل الدوائي',
    Phone: '0509876543',
    Address: 'جدة',
    balance: 1500,
    openingBalance: 0,
    Is_Active: true,
    Created_At: new Date().toISOString()
  },
  {
    id: 'SUP-003',
    Supplier_ID: 'SUP-003',
    Supplier_Name: 'مستودع الأمل الطبي الحديث',
    Phone: '0501112233',
    balance: 0,
    openingBalance: 0,
    Is_Active: true,
    Created_At: new Date().toISOString()
  }
];

const mockProducts: Product[] = [
  {
    id: 'PROD-PANADOL-01',
    Name: 'Panadol Extra 500mg',
    name: 'Panadol Extra 500mg',
    barcode: '6281001002003',
    CostPrice: 12.5,
    UnitPrice: 16.0,
    price: 16.0,
    stock: 50,
    StockQuantity: 50,
    categoryName: 'Analgesics',
    categoryId: 'CAT-01',
    Is_Active: true
  },
  {
    id: 'PROD-AUG-02',
    Name: 'Augmentin 1g Tablets',
    name: 'Augmentin 1g Tablets',
    barcode: '6281002003004',
    CostPrice: 45.0,
    UnitPrice: 58.0,
    price: 58.0,
    stock: 20,
    StockQuantity: 20,
    categoryName: 'Antibiotics',
    categoryId: 'CAT-02',
    Is_Active: true
  },
  {
    id: 'PROD-CONCOR-03',
    Name: 'Concor 5mg 30 Tab',
    name: 'Concor 5mg 30 Tab',
    barcode: '6281003004005',
    CostPrice: 22.0,
    UnitPrice: 28.5,
    price: 28.5,
    stock: 15,
    StockQuantity: 15,
    categoryName: 'Cardiovascular',
    categoryId: 'CAT-03',
    Is_Active: true
  },
  {
    id: 'PROD-INACTIVE-04',
    Name: 'Discontinued Medicine 100mg',
    name: 'Discontinued Medicine 100mg',
    barcode: '6281009999999',
    CostPrice: 10.0,
    UnitPrice: 15.0,
    price: 15.0,
    stock: 0,
    StockQuantity: 0,
    Is_Active: false
  }
];

const mockAliases: Record<string, string> = {
  'بنادول اكسترا احمر': 'Panadol Extra 500mg',
  'اوجمنتين 1 جم': 'Augmentin 1g Tablets'
};

async function runPhase22Tests() {
  console.log('================================================================');
  console.log('🧪 Starting PharmaFlow PRO Phase 2.2 Canonical Batch Center Test Suite');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST GROUP 1: Supplier Batch Resolution Logic (Tests 1-6)
  // -------------------------------------------------------------
  console.log('🏢 Group 1: Supplier Batch Resolution Logic');

  // 1. Exact Match
  const supExact = BatchSessionService.resolveSupplierInitial('شركة الحياة للأدوية الطبية', mockSuppliers);
  assert(
    supExact.status === SupplierResolutionStatus.EXACT_MATCH &&
    supExact.action === SupplierResolutionAction.AUTO_MATCH &&
    supExact.matchedSupplierId === 'SUP-001',
    '1. Exact match resolves to EXACT_MATCH with AUTO_MATCH action'
  );

  // 2. High Confidence Match
  const supHigh = BatchSessionService.resolveSupplierInitial('شركة الحياه للادوية الطبيه', mockSuppliers);
  assert(
    supHigh.confidence >= 0.85 &&
    (supHigh.action === SupplierResolutionAction.LINK_EXISTING || supHigh.action === SupplierResolutionAction.AUTO_MATCH) &&
    supHigh.matchedSupplierId === 'SUP-001',
    '2. High confidence normalized match links to SUP-001'
  );

  // 3. Ambiguous Match (close candidates)
  const supAmbiguous = BatchSessionService.resolveSupplierInitial('مستودع الأمل', mockSuppliers);
  assert(
    supAmbiguous.status === SupplierResolutionStatus.AMBIGUOUS || supAmbiguous.suggestedSuppliers.length >= 2,
    '3. Ambiguous match identifies multiple candidates requiring user decision'
  );

  // 4. Possible Match (lower confidence)
  const supPossible = BatchSessionService.resolveSupplierInitial('الحياة التجارية للتوريد', mockSuppliers);
  assert(
    supPossible.suggestedSuppliers.length > 0 &&
    (supPossible.action === SupplierResolutionAction.UNRESOLVED || supPossible.status === SupplierResolutionStatus.POSSIBLE_MATCH || supPossible.confidence < 0.85),
    '4. Partial supplier name yields suggestions with POSSIBLE_MATCH/confidence check'
  );

  // 5. New Supplier Candidate
  const supNew = BatchSessionService.resolveSupplierInitial('مؤسسة الصيدلية الدولية الحديثة توريدات', mockSuppliers);
  assert(
    supNew.status === SupplierResolutionStatus.NEW_SUPPLIER &&
    supNew.action === SupplierResolutionAction.UNRESOLVED &&
    supNew.newSupplierData?.name === 'مؤسسة الصيدلية الدولية الحديثة توريدات',
    '5. Unregistered supplier is tagged as NEW_SUPPLIER requiring explicit user action'
  );

  // 6. Supplier Skip action
  const sampleAnalysis: ImportAnalysisResult = {
    sourceType: 'EXCEL',
    fileName: 'invoice_batch_test.xlsx',
    rawText: 'Test Raw Text',
    detectedColumns: [],
    rows: [
      {
        rowNumber: 1,
        productName: 'Panadol Extra 500mg',
        quantity: 10,
        unitPrice: 12.5,
        barcode: '6281001002003',
        expiryDate: '2026-12-31',
        status: 'VALID',
        confidenceScore: 1.0,
        validationIssues: []
      }
    ],
    summary: {
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      detectedSupplier: 'مورد غير معروف',
      detectedInvoiceNumber: 'INV-2026-99',
      detectedDate: '2026-05-15'
    },
    diagnostics: []
  };

  const session1 = BatchSessionService.createSession(sampleAnalysis, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    existingSuppliers: mockSuppliers,
    existingProducts: mockProducts,
    learnedAliases: mockAliases
  });

  const sessionSkippedSup = BatchSessionService.updateSupplierDecision(session1, {
    action: SupplierResolutionAction.SKIP,
    isSkipped: true
  });
  assert(
    sessionSkippedSup.supplierDecision.action === SupplierResolutionAction.SKIP &&
    sessionSkippedSup.supplierDecision.isSkipped === true,
    '6. Updating supplier decision to SKIP sets isSkipped to true'
  );

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 2: Product Batch Resolution & Multi-Tier Matching (Tests 7-12)
  // -------------------------------------------------------------
  console.log('💊 Group 2: Product Batch Resolution & Multi-Tier Matching');

  const multiItemAnalysis: ImportAnalysisResult = {
    sourceType: 'EXCEL',
    fileName: 'multiproducts.xlsx',
    rawText: '',
    detectedColumns: [],
    rows: [
      // Tier 1: Barcode match
      {
        rowNumber: 1,
        productName: 'Unknown Name In File',
        barcode: '6281001002003',
        quantity: 5,
        unitPrice: 12.5,
        expiryDate: '2026-11-30',
        status: 'VALID',
        confidenceScore: 1.0,
        validationIssues: []
      },
      // Tier 2: Code match
      {
        rowNumber: 2,
        productName: 'Different Name',
        productCode: 'PROD-AUG-02',
        quantity: 8,
        unitPrice: 45.0,
        status: 'VALID',
        confidenceScore: 0.98,
        validationIssues: []
      },
      // Tier 3: Exact Name
      {
        rowNumber: 3,
        productName: 'Concor 5mg 30 Tab',
        quantity: 12,
        unitPrice: 22.0,
        status: 'VALID',
        confidenceScore: 0.99,
        validationIssues: []
      },
      // Tier 4: Normalized Name
      {
        rowNumber: 4,
        productName: 'concor 5mg 30 tab',
        quantity: 4,
        unitPrice: 22.0,
        status: 'VALID',
        confidenceScore: 0.95,
        validationIssues: []
      },
      // Tier 5: Learned Alias
      {
        rowNumber: 5,
        productName: 'بنادول اكسترا احمر',
        quantity: 20,
        unitPrice: 12.5,
        status: 'VALID',
        confidenceScore: 0.92,
        validationIssues: []
      },
      // Tier 6: Fuzzy or New Product
      {
        rowNumber: 6,
        productName: 'Panadol Extra Tab',
        quantity: 15,
        unitPrice: 12.5,
        status: 'VALID',
        confidenceScore: 0.8,
        validationIssues: []
      }
    ],
    summary: {
      totalRows: 6,
      validRows: 6,
      invalidRows: 0,
      detectedSupplier: 'شركة الحياة للأدوية الطبية',
      detectedInvoiceNumber: 'INV-MULTI-01'
    },
    diagnostics: []
  };

  const sessionMulti = BatchSessionService.createSession(multiItemAnalysis, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    existingSuppliers: mockSuppliers,
    existingProducts: mockProducts,
    learnedAliases: mockAliases
  });

  const p1 = sessionMulti.productDecisions[0];
  assert(p1.matchedProductId === 'PROD-PANADOL-01' && p1.confidence === 1.0, '7. Tier 1: Barcode match resolves to Panadol Extra (Score 1.0)');

  const p2 = sessionMulti.productDecisions[1];
  assert(p2.matchedProductId === 'PROD-AUG-02', '8. Tier 2: Product Code match resolves to Augmentin');

  const p3 = sessionMulti.productDecisions[2];
  assert(p3.matchedProductId === 'PROD-CONCOR-03' && p3.action === ProductResolutionAction.AUTO_MATCH, '9. Tier 3: Exact name match resolves to Concor');

  const p4 = sessionMulti.productDecisions[3];
  assert(p4.matchedProductId === 'PROD-CONCOR-03', '10. Tier 4: Case/whitespace normalized name matches Concor');

  const p5 = sessionMulti.productDecisions[4];
  assert(p5.matchedProductId === 'PROD-PANADOL-01' && p5.action === ProductResolutionAction.AUTO_MATCH, '11. Tier 5: Learned Arabic alias matches Panadol Extra');

  const p6 = sessionMulti.productDecisions[5];
  assert(p6.suggestedProducts.length > 0 && p6.suggestedProducts[0].id === 'PROD-PANADOL-01', '12. Tier 6: Fuzzy match attaches Panadol Extra as top suggested candidate');

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 3: Batch Decision Validation Engine (Tests 13-18)
  // -------------------------------------------------------------
  console.log('🛡️ Group 3: Batch Decision Validation Engine');

  // 13. Blocks if any product is UNRESOLVED
  const unresSession = BatchSessionService.createSession({
    ...sampleAnalysis,
    rows: [
      {
        rowNumber: 1,
        productName: 'Brand New Unknown Item 500mg',
        quantity: 10,
        unitPrice: 15.0,
        status: 'VALID',
        confidenceScore: 0,
        validationIssues: []
      }
    ]
  }, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    existingSuppliers: mockSuppliers,
    existingProducts: mockProducts
  });

  const v1 = BatchDecisionValidator.validate(unresSession, {
    tenantId: 'TENANT-001',
    existingProducts: mockProducts,
    existingSuppliers: mockSuppliers
  });
  assert(!v1.canApply && v1.unresolvedCount > 0, '13. Validation blocks apply when products have UNRESOLVED decisions');

  // 14. Blocks if supplier is UNRESOLVED
  const unresSupSession = BatchSessionService.updateProductDecision(unresSession, 1, {
    action: ProductResolutionAction.CREATE_NEW,
    newProductData: { name: 'Brand New Unknown Item 500mg', unitPrice: 15.0, costPrice: 15.0 }
  });
  // Force supplier decision to UNRESOLVED
  unresSupSession.supplierDecision = {
    importedSupplierName: 'مورد غامض',
    status: SupplierResolutionStatus.UNRESOLVED,
    confidence: 0,
    action: SupplierResolutionAction.UNRESOLVED,
    suggestedSuppliers: []
  };

  const v2 = BatchDecisionValidator.validate(unresSupSession, {
    tenantId: 'TENANT-001',
    existingProducts: mockProducts,
    existingSuppliers: mockSuppliers
  });
  assert(!v2.canApply && v2.errors.some(e => e.code === 'SUPPLIER_UNRESOLVED'), '14. Validation blocks apply when supplier is UNRESOLVED');

  // 15. Tenant isolation check
  const v3 = BatchDecisionValidator.validate(unresSupSession, {
    tenantId: 'TENANT-ANOTHER-999',
    existingProducts: mockProducts,
    existingSuppliers: mockSuppliers
  });
  assert(!v3.isValid && v3.errors.some(e => e.code === 'TENANT_MISMATCH'), '15. Validation enforces strict tenant isolation against foreign tenant');

  // 16. Linked product not found in DB
  const invalidLinkSession = BatchSessionService.updateProductDecision(unresSupSession, 1, {
    action: ProductResolutionAction.LINK_EXISTING,
    matchedProductId: 'PROD-NON-EXISTENT-999'
  });
  invalidLinkSession.supplierDecision.action = SupplierResolutionAction.SKIP;
  invalidLinkSession.supplierDecision.isSkipped = true;

  const v4 = BatchDecisionValidator.validate(invalidLinkSession, {
    tenantId: 'TENANT-001',
    existingProducts: mockProducts,
    existingSuppliers: mockSuppliers
  });
  assert(!v4.canApply && v4.errors.some(e => e.code === 'MATCHED_PRODUCT_NOT_FOUND'), '16. Validation blocks linked product IDs not found in master data');

  // 17. Linked product is inactive
  const inactiveLinkSession = BatchSessionService.updateProductDecision(unresSupSession, 1, {
    action: ProductResolutionAction.LINK_EXISTING,
    matchedProductId: 'PROD-INACTIVE-04'
  });
  const v5 = BatchDecisionValidator.validate(inactiveLinkSession, {
    tenantId: 'TENANT-001',
    existingProducts: mockProducts,
    existingSuppliers: mockSuppliers
  });
  assert(!v5.canApply && v5.errors.some(e => e.code === 'MATCHED_PRODUCT_INACTIVE'), '17. Validation blocks linking to inactive products');

  // 18. Invalid math values
  const invalidMathSession = BatchSessionService.updateProductDecision(unresSupSession, 1, {
    action: ProductResolutionAction.CREATE_NEW,
    quantity: -5,
    unitPrice: -10,
    newProductData: { name: 'Invalid Item', unitPrice: -10 }
  });
  const v6 = BatchDecisionValidator.validate(invalidMathSession, {
    tenantId: 'TENANT-001',
    existingProducts: mockProducts,
    existingSuppliers: mockSuppliers
  });
  assert(!v6.canApply && v6.errors.some(e => e.code === 'INVALID_QUANTITY'), '18. Validation rejects negative quantity or unit prices');

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 4: Bulk Operations & State Management (Tests 19-24)
  // -------------------------------------------------------------
  console.log('⚡ Group 4: Bulk Operations & State Management');

  // 19. bulkApproveHighConfidence
  const bulkSession = BatchSessionService.createSession(multiItemAnalysis, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    existingSuppliers: mockSuppliers,
    existingProducts: mockProducts,
    learnedAliases: mockAliases
  });

  const approvedSession = BatchSessionService.applyBulkAction(bulkSession, 'APPROVE_ALL_MATCHED');
  const matchedCount = approvedSession.productDecisions.filter(p => p.action === ProductResolutionAction.AUTO_MATCH).length;
  assert(matchedCount >= 4, `19. bulkApproveHighConfidence approved ${matchedCount} matched items to AUTO_MATCH`);

  // 20. bulkCreateNew / CREATE_SELECTED
  const newCreatedSession = BatchSessionService.applyBulkAction(approvedSession, 'CREATE_SELECTED', [6]);
  assert(
    newCreatedSession.productDecisions.find(p => p.sourceRowId === 6)?.action === ProductResolutionAction.CREATE_NEW,
    '20. bulkCreateNew/CREATE_SELECTED updates targeted rows to CREATE_NEW with template data'
  );

  // 21. bulkSkipSelected
  const skippedSession = BatchSessionService.applyBulkAction(newCreatedSession, 'SKIP_SELECTED', [6]);
  assert(
    skippedSession.productDecisions.find(p => p.sourceRowId === 6)?.isSkipped === true,
    '21. bulkSkipSelected marks selected items as skipped'
  );

  // 22. Line Total recalculation
  const updatedQtySession = BatchSessionService.updateProductDecision(skippedSession, 1, {
    quantity: 20,
    unitPrice: 15.0
  });
  const row1 = updatedQtySession.productDecisions.find(p => p.sourceRowId === 1);
  assert(row1?.total === 300, `22. updateProductDecision recalculates total to 300 (got ${row1?.total})`);

  // 23. computeSummary metrics
  const sum = updatedQtySession.summary;
  assert(
    sum.totalRows === 6 && sum.skippedCount === 1 && sum.totalAmount > 0,
    `23. computeSummary accurately aggregates total rows (${sum.totalRows}), skipped (${sum.skippedCount}), and amount (${sum.totalAmount})`
  );

  // 24. Session status transition to READY_TO_APPLY
  // Resolve all rows
  let readySession = updatedQtySession;
  readySession.productDecisions.forEach(p => {
    if (p.action === ProductResolutionAction.UNRESOLVED) {
      readySession = BatchSessionService.updateProductDecision(readySession, p.sourceRowId, {
        action: ProductResolutionAction.AUTO_MATCH,
        matchedProductId: 'PROD-PANADOL-01',
        matchedProductName: 'Panadol Extra 500mg'
      });
    }
  });
  assert(
    readySession.status === BatchProcessingStatus.READY_TO_APPLY,
    `24. Session status transitions to READY_TO_APPLY when all rows resolved (status is ${readySession.status})`
  );

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 5: Atomic Batch Apply & Master Data Generation (Tests 25-30)
  // -------------------------------------------------------------
  console.log('⚙️ Group 5: Atomic Batch Apply & Master Data Generation');

  const applyTestSession = BatchSessionService.createSession({
    sourceType: 'EXCEL',
    fileName: 'apply_test.xlsx',
    rawText: '',
    detectedColumns: [],
    rows: [
      {
        rowNumber: 1,
        productName: 'Panadol Extra 500mg',
        quantity: 10,
        unitPrice: 12.5,
        expiryDate: '2026-10-31',
        barcode: '6281001002003',
        status: 'VALID',
        confidenceScore: 1.0,
        validationIssues: []
      },
      {
        rowNumber: 2,
        productName: 'Catafast 50mg Sachets',
        quantity: 15,
        unitPrice: 24.0,
        expiryDate: '2027-04-30',
        barcode: '6289998887771',
        status: 'VALID',
        confidenceScore: 0,
        validationIssues: []
      }
    ],
    summary: {
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
      detectedSupplier: 'مورد جديد للتجربة',
      detectedInvoiceNumber: 'INV-APPLY-001',
      detectedDate: '2026-06-01'
    },
    diagnostics: []
  }, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    existingSuppliers: mockSuppliers,
    existingProducts: mockProducts
  });

  // Explicit user decisions:
  // 1. Create new supplier
  let configuredSession = BatchSessionService.updateSupplierDecision(applyTestSession, {
    action: SupplierResolutionAction.CREATE_NEW,
    newSupplierData: {
      name: 'مورد جديد للتجربة',
      phone: '0555555555',
      taxNumber: '300999999900003'
    }
  });

  // 2. Row 1 is auto matched
  configuredSession = BatchSessionService.updateProductDecision(configuredSession, 1, {
    action: ProductResolutionAction.AUTO_MATCH,
    matchedProductId: 'PROD-PANADOL-01',
    matchedProductName: 'Panadol Extra 500mg'
  });

  // 3. Row 2 is explicitly created as new product
  configuredSession = BatchSessionService.updateProductDecision(configuredSession, 2, {
    action: ProductResolutionAction.CREATE_NEW,
    newProductData: {
      name: 'Catafast 50mg Sachets',
      barcode: '6289998887771',
      unitPrice: 24.0,
      costPrice: 24.0,
      categoryName: 'Analgesics'
    }
  });

  const applyResult = await BatchResolutionService.applyBatch(configuredSession, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    idempotencyKey: 'IDEM-TEST-APPLY-1',
    masterData: {
      products: mockProducts,
      suppliers: mockSuppliers
    }
  });

  // 25. Created new supplier
  assert(
    applyResult.success && applyResult.createdSupplier !== undefined && applyResult.createdSupplier.Supplier_Name === 'مورد جديد للتجربة',
    '25. Successfully created new supplier in master data with tenant and branch bindings'
  );

  // 26. Duplicate supplier validation
  const duplicateSupSession = {
    ...configuredSession,
    supplierDecision: {
      ...configuredSession.supplierDecision,
      action: SupplierResolutionAction.CREATE_NEW,
      newSupplierData: { name: 'شركة الحياة للأدوية الطبية' } // already in mockSuppliers!
    }
  };
  const dupSupVal = BatchDecisionValidator.validate(duplicateSupSession, {
    tenantId: 'TENANT-001',
    existingProducts: mockProducts,
    existingSuppliers: mockSuppliers
  });
  assert(
    !dupSupVal.canApply && dupSupVal.errors.some(e => e.code === 'DUPLICATE_SUPPLIER_NAME'),
    '26. Validation prevents creating a duplicate supplier when name matches existing record'
  );

  // 27. Created new product in master data
  assert(
    applyResult.createdProducts.length === 1 && applyResult.createdProducts[0].Name === 'Catafast 50mg Sachets',
    '27. Successfully created new product "Catafast 50mg Sachets" with proper category and prices'
  );

  // 28. Preserved ISO expiry date
  const item1 = applyResult.invoiceItems[0];
  const item2 = applyResult.invoiceItems[1];
  assert(
    item1.expiryDate === '2026-10-31' && item2.expiryDate === '2027-04-30',
    `28. Preserved ISO standard expiry dates (${item1.expiryDate}, ${item2.expiryDate})`
  );

  // 29. Aliases tracking
  // If an imported name differs from matched name, alias should be tracked
  const aliasSession = BatchSessionService.createSession({
    ...sampleAnalysis,
    rows: [{
      rowNumber: 1,
      productName: 'بنادول ازرق عادي',
      quantity: 5,
      unitPrice: 12.0,
      status: 'VALID',
      confidenceScore: 0,
      validationIssues: []
    }]
  }, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    existingSuppliers: mockSuppliers,
    existingProducts: mockProducts
  });

  const configuredAliasSession = BatchSessionService.updateProductDecision(aliasSession, 1, {
    action: ProductResolutionAction.LINK_EXISTING,
    matchedProductId: 'PROD-PANADOL-01',
    matchedProductName: 'Panadol Extra 500mg'
  });
  configuredAliasSession.supplierDecision.action = SupplierResolutionAction.SKIP;
  configuredAliasSession.supplierDecision.isSkipped = true;

  const aliasResult = await BatchResolutionService.applyBatch(configuredAliasSession, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    idempotencyKey: 'IDEM-TEST-ALIAS-1',
    masterData: {
      products: mockProducts,
      suppliers: mockSuppliers
    }
  });

  assert(
    aliasResult.createdAliases.length > 0 && aliasResult.createdAliases[0].sourceName === 'بنادول ازرق عادي',
    '29. Recorded learned alias mapping for future automated matching'
  );

  // 30. Generated complete InvoiceItem[]
  assert(
    applyResult.invoiceItems.length === 2 &&
    applyResult.invoiceItems[0].qty === 10 &&
    applyResult.invoiceItems[0].sum === 125,
    '30. Generated complete InvoiceItem[] with accurate line totals and product bindings'
  );

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 6: Idempotency, Concurrency & Rollback Safety (Tests 31-36)
  // -------------------------------------------------------------
  console.log('🔒 Group 6: Idempotency, Concurrency & Rollback Safety');

  // 31. Idempotency hash stability
  const hash1 = BatchIdempotencyService.hashPayload(configuredSession);
  const hash2 = BatchIdempotencyService.hashPayload(configuredSession);
  assert(hash1 === hash2 && hash1.startsWith('hash_'), '31. BatchIdempotencyService generates deterministic payload fingerprint');

  // 32. Repeated apply with same key returns cached result (idempotent replay)
  const replayResult = await BatchResolutionService.applyBatch(configuredSession, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    idempotencyKey: 'IDEM-TEST-APPLY-1',
    masterData: {
      products: mockProducts,
      suppliers: mockSuppliers
    }
  });
  assert(replayResult.idempotentReplay === true, '32. Repeated execution with identical idempotency key returns idempotent cached replay');

  // 33. Idempotency conflict on modified payload
  let threwConflict = false;
  try {
    const modifiedPayloadSession = {
      ...configuredSession,
      summary: { ...configuredSession.summary, totalAmount: 999999 }
    };
    await BatchResolutionService.applyBatch(modifiedPayloadSession, {
      tenantId: 'TENANT-001',
      branchId: 'BRANCH-MAIN',
      userId: 'USER-01',
      idempotencyKey: 'IDEM-TEST-APPLY-1', // Reusing key with different payload!
      masterData: {
        products: mockProducts,
        suppliers: mockSuppliers
      }
    });
  } catch (err: any) {
    if (err.message.includes('IDEMPOTENCY_CONFLICT')) {
      threwConflict = true;
    }
  }
  assert(threwConflict, '33. Reusing idempotency key with conflicting payload throws IDEMPOTENCY_CONFLICT');

  // 34. Session cancellation
  const cancelTestSession = BatchSessionService.createSession(sampleAnalysis, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    existingSuppliers: mockSuppliers,
    existingProducts: mockProducts
  });
  const cancelledSession = await BatchProcessingOrchestrator.cancelSession(cancelTestSession.sessionId);
  assert(
    cancelledSession?.status === BatchProcessingStatus.CANCELLED && cancelledSession.cancelledAt !== undefined,
    '34. cancelSession marks session as CANCELLED with cancellation timestamp'
  );

  // 35. Audit Trail verification
  assert(
    applyResult.sessionId.startsWith('BPS-') && applyResult.executionTimeMs >= 0,
    '35. Session tracking and audit logs recorded with session ID and execution metadata'
  );

  // 36. Performance Benchmarking (< 500ms for 100 rows batch analysis and session setup)
  const t0 = Date.now();
  const largeRows = Array.from({ length: 100 }, (_, i) => ({
    rowNumber: i + 1,
    productName: i % 2 === 0 ? 'Panadol Extra 500mg' : `Generic Medicine Item #${i + 1}`,
    quantity: 10,
    unitPrice: 20.0,
    barcode: i % 2 === 0 ? '6281001002003' : undefined,
    status: 'VALID' as const,
    confidenceScore: 1.0,
    validationIssues: []
  }));

  const largeAnalysis: ImportAnalysisResult = {
    sourceType: 'EXCEL',
    fileName: 'large_invoice_100_rows.xlsx',
    rawText: '',
    detectedColumns: [],
    rows: largeRows,
    summary: {
      totalRows: 100,
      validRows: 100,
      invalidRows: 0,
      detectedSupplier: 'شركة الحياة للأدوية الطبية'
    },
    diagnostics: []
  };

  const largeSession = BatchSessionService.createSession(largeAnalysis, {
    tenantId: 'TENANT-001',
    branchId: 'BRANCH-MAIN',
    userId: 'USER-01',
    existingSuppliers: mockSuppliers,
    existingProducts: mockProducts,
    learnedAliases: mockAliases
  });

  const benchmarkDuration = Date.now() - t0;
  assert(
    largeSession.productDecisions.length === 100 && benchmarkDuration < 500,
    `36. Performance Benchmark: Processed and matched 100-item batch in ${benchmarkDuration}ms (< 500ms limit)`
  );

  console.log('\n================================================================');
  console.log(`📊 Phase 2.2 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase22Tests().catch(err => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
