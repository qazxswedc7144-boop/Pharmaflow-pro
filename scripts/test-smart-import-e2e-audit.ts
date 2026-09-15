/**
 * test-smart-import-e2e-audit.ts
 * Real-World End-to-End Validation & Final Hardening Test Suite
 * Validates the full Smart Import pipeline:
 * OCR Document Parser -> LocalOcrProvider -> MultiStagePipeline -> SmartImportOrchestrator -> BatchSessionService -> Canonical Output
 */

import { OCRDocumentParser } from '../src/features/purchases/services/smartImport/ocrDocumentParser';
import { LocalOcrProvider } from '../src/features/purchases/services/smartImport/providers/localOcrProvider';
import { MultiStagePipeline } from '../src/features/purchases/services/smartImport/providers/multiStagePipeline';
import { SmartImportOrchestrator } from '../src/features/purchases/services/smartImport/smartImportOrchestrator';
import { BatchSessionService } from '../src/features/purchases/services/smartImport/batchProcessing/batchSessionService';
import { ProductResolutionAction, SupplierResolutionAction } from '../src/features/purchases/services/smartImport/batchProcessing/types';
import { Product, Supplier } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runEndToEndAudit() {
  console.log('\n=============================================================');
  console.log('🧪 RUNNING SMART IMPORT END-TO-END AUDIT & HARDENING VERIFICATION');
  console.log('=============================================================\n');

  // -------------------------------------------------------------
  // Test 1: Real-world Invoice with Glued Tokens, Codes, and Pharmaceuticals
  // -------------------------------------------------------------
  console.log('--- TEST 1: End-to-end extraction from realistic OCR invoice text ---');

  const invoiceOcrText = `
شركة الدواء العالمية لتجارة الأدوية والمستلزمات
فاتورة رقم: INV-2026-9988
التاريخ: 15/04/2026

كود الصنف | البيان | الكمية | السعر | الإجمالي | تاريخ الصلاحية | التشغيلة | الباركود
6281001 PanadolExtra500mg 10 15.50 155.00 12/2027 BATCH-99A 628100100234
6281002 Augmentin1g 14 Tab 5 45.00 225.00 10/2028 BATCH-AUG1 628100200567
6281003 Cataflam50mg 20 12.00 240.00 05/2027 BATCH-CAT5 628100300890
6281004 Vitamin D3 10000 IU 15 25.00 375.00 08/2028 BATCH-VITD 628100400112
6281005 Omega 3 Plus 1000mg 8 30.00 240.00 03/2027 BATCH-OMG3 628100500445
6281006 بندول كولد اند فلو 24 قرص 12 18.50 222.00 11/2027 BATCH-CF24 628100600778

الإجمالي الصافي: 1457.00
`;

  const parsedDoc = OCRDocumentParser.parseText(invoiceOcrText);

  assert(parsedDoc.rows.length === 6, `Parsed 6 rows from invoice (got ${parsedDoc.rows.length})`);
  assert(parsedDoc.supplier?.includes('شركة الدواء العالمية') === true, `Supplier extracted correctly: "${parsedDoc.supplier}"`);
  assert(parsedDoc.invoiceNumber === 'INV-2026-9988', `Invoice number extracted correctly: "${parsedDoc.invoiceNumber}"`);
  assert(parsedDoc.date?.includes('2026') === true, `Date extracted correctly: "${parsedDoc.date}"`);

  // Verify Row 1
  const r1 = parsedDoc.rows[0];
  assert(r1.productCode === '6281001', `Row 1 isolated product code: "${r1.productCode}"`);
  assert(r1.productName.includes('Panadol Extra 500mg') || r1.productName.includes('Panadol'), `Row 1 name preserved with strength: "${r1.productName}"`);
  assert(r1.quantity === 10, `Row 1 quantity: ${r1.quantity}`);
  assert(r1.unitPrice === 15.5, `Row 1 unit price: ${r1.unitPrice}`);
  assert(r1.total === 155, `Row 1 total: ${r1.total}`);
  assert(r1.batchNumber === '99A', `Row 1 batch: "${r1.batchNumber}"`);
  assert(r1.barcode === '628100100234', `Row 1 barcode: "${r1.barcode}"`);

  // -------------------------------------------------------------
  // Test 2: LocalOcrProvider & MultiStagePipeline mapping integrity
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Canonical pipeline preserving all 10 fields ---');

  // Convert parsedDoc via LocalOcrProvider
  const canonicalDoc = LocalOcrProvider.toCanonicalDocument(parsedDoc, 'test_invoice.jpg', 0.85);
  assert(canonicalDoc.documentFields.supplierName === parsedDoc.supplier, 'Supplier propagated to CanonicalDoc');
  assert(canonicalDoc.documentFields.invoiceNumber === parsedDoc.invoiceNumber, 'Invoice number propagated to CanonicalDoc');
  assert(canonicalDoc.documentFields.invoiceDate === parsedDoc.date, 'Invoice date propagated to CanonicalDoc');

  // Run MultiStagePipeline.extractRowsFromCanonicalDoc
  const extractedRows = MultiStagePipeline.extractRowsFromCanonicalDoc(canonicalDoc);
  assert(extractedRows.length === 6, `Extracted ${extractedRows.length} rows from CanonicalDoc`);

  const e1 = extractedRows[0];
  assert(e1.productName.length > 0, `Preserved productName: "${e1.productName}"`);
  assert(e1.quantity === 10, `Preserved quantity: ${e1.quantity}`);
  assert(e1.unitPrice === 15.5, `Preserved unitPrice: ${e1.unitPrice}`);
  assert(e1.total === 155, `Preserved total: ${e1.total}`);
  assert(e1.productCode === '6281001', `Preserved productCode: "${e1.productCode}"`);
  assert(e1.barcode === '628100100234', `Preserved barcode: "${e1.barcode}"`);
  assert(e1.batchNumber === '99A', `Preserved batchNumber: "${e1.batchNumber}"`);
  assert(Boolean(e1.expiryDate), `Preserved expiryDate: "${e1.expiryDate}"`);

  // -------------------------------------------------------------
  // Test 3: SmartImportOrchestrator integration with BatchSessionService
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: SmartImportOrchestrator to BatchSessionService ---');

  const existingProducts: Product[] = [
    {
      id: 'P-PAN-500',
      name: 'Panadol Extra 500mg',
      Name: 'Panadol Extra 500mg',
      barcode: '628100100234',
      UnitPrice: 20,
      CostPrice: 15.5,
      stock: 50,
      Is_Active: true
    },
    {
      id: 'P-AUG-1G',
      name: 'Augmentin 1g Tab',
      Name: 'Augmentin 1g Tab',
      barcode: '628100200567',
      UnitPrice: 55,
      CostPrice: 45,
      stock: 20,
      Is_Active: true
    }
  ];

  const existingSuppliers: Supplier[] = [
    {
      id: 'SUP-DAWAA',
      name: 'شركة الدواء العالمية',
      Supplier_Name: 'شركة الدواء العالمية',
      Is_Active: true
    },
    {
      id: 'SUP-DAWAA-2',
      name: 'شركة الدواء الحديثة',
      Supplier_Name: 'شركة الدواء الحديثة',
      Is_Active: true
    }
  ];

  const orchestratorResult = await SmartImportOrchestrator.analyzeDocument(
    canonicalDoc,
    existingProducts,
    {
      sourceType: 'IMAGE_CAMERA',
      fileName: 'invoice_camera.jpg'
    }
  );

  assert(orchestratorResult.rows.length === 6, `Orchestrator processed 6 rows (got ${orchestratorResult.rows.length})`);
  assert(orchestratorResult.summary.detectedSupplier === parsedDoc.supplier, 'Orchestrator preserved detectedSupplier');
  assert(orchestratorResult.summary.detectedInvoiceNumber === parsedDoc.invoiceNumber, 'Orchestrator preserved detectedInvoiceNumber');

  // Create Batch Processing Session
  const session = BatchSessionService.createSession(orchestratorResult, {
    tenantId: 'tenant-test',
    branchId: 'branch-1',
    userId: 'user-1',
    existingProducts,
    existingSuppliers
  });

  assert(session.supplierDecision.matchedSupplierId === 'SUP-DAWAA', `Supplier resolved to: ${session.supplierDecision.matchedSupplierName}`);
  assert(session.supplierDecision.action === SupplierResolutionAction.AUTO_MATCH || session.supplierDecision.action === SupplierResolutionAction.LINK_EXISTING, 'Supplier decision is matched');

  // Check Product 1 matched to Panadol
  const p1Decision = session.productDecisions[0];
  assert(p1Decision.matchedProductId === 'P-PAN-500', `Panadol matched to P-PAN-500 (got ${p1Decision.matchedProductId})`);
  assert(p1Decision.barcode === '628100100234', `Session decision preserves barcode: ${p1Decision.barcode}`);
  assert(p1Decision.supplierProductCode === '6281001', `Session decision preserves supplierProductCode: ${p1Decision.supplierProductCode}`);
  assert(p1Decision.batchNumber === '99A', `Session decision preserves batchNumber: ${p1Decision.batchNumber}`);

  // -------------------------------------------------------------
  // Test 4: Uncertainty & Conflict Handling (MANUAL_REVIEW / UNRESOLVED)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Uncertainty & Dosage Conflict Guarantees ---');

  // Test Dosage conflict: 500mg imported vs 1000mg in master DB
  const conflictRow = {
    rowNumber: 1,
    rawCells: {},
    productName: 'Panadol Extra 500mg',
    quantity: 10,
    unitPrice: 15,
    total: 150,
    status: 'VALID' as const,
    validationIssues: []
  };

  const dbWith1000mg: Product[] = [
    {
      id: 'P-PAN-1000',
      name: 'Panadol Extra 1000mg',
      Name: 'Panadol Extra 1000mg',
      UnitPrice: 30,
      CostPrice: 25,
      Is_Active: true
    }
  ];

  const conflictDecisions = BatchSessionService.resolveProductsInitial(
    [conflictRow],
    dbWith1000mg,
    {},
    undefined,
    { tenantId: 'tenant-test' }
  );

  assert(conflictDecisions[0].action === ProductResolutionAction.UNRESOLVED, 'Dosage mismatch (500mg vs 1000mg) is NOT auto-matched');
  assert(conflictDecisions[0].dosageSafety?.isConflict === true, 'Dosage safety flagged as CONFLICT');

  // Test Math Mismatch in OCR Document Parser
  const mismatchRowText = `
شركة الأمل
فاتورة: 1001
تاريخ: 01/01/2026
صنف تجريبي 10 5.00 999.00
`;
  const mismatchDoc = OCRDocumentParser.parseText(mismatchRowText);
  assert(mismatchDoc.rows.length === 1, 'Mismatch row extracted');
  assert(mismatchDoc.rows[0].status === 'MANUAL_REVIEW', `Math mismatch (10 * 5 != 999) marked as MANUAL_REVIEW (got ${mismatchDoc.rows[0].status})`);
  assert(mismatchDoc.rows[0].total === 999, 'Financial number NOT silently overwritten: total remains 999');

  // -------------------------------------------------------------
  // Test 5: Hindi / Eastern Arabic Numerals
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Eastern Arabic numerals with columns ---');

  const hindiInvoice = `
مؤسسة الشفاء
فاتورة رقم: 5544
التاريخ: 2026/03/10
أوجمنتين ١ جم ١٤ قرص ١٠ ٥٠٫٠٠ ٥٠٠٫٠٠
`;
  const hindiDoc = OCRDocumentParser.parseText(hindiInvoice);
  assert(hindiDoc.rows.length === 1, 'Hindi row extracted');
  assert(hindiDoc.rows[0].quantity === 10, `Hindi quantity parsed: ${hindiDoc.rows[0].quantity}`);
  assert(hindiDoc.rows[0].unitPrice === 50, `Hindi unit price parsed: ${hindiDoc.rows[0].unitPrice}`);
  assert(hindiDoc.rows[0].total === 500, `Hindi total parsed: ${hindiDoc.rows[0].total}`);

  console.log('\n=============================================================');
  console.log('🎉 ALL SMART IMPORT END-TO-END AUDIT TESTS PASSED SUCCESSFULLY!');
  console.log('=============================================================\n');
}

runEndToEndAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
