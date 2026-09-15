/**
 * PharmaFlow PRO ERP — Smart Import Integrity & Provenance Verification Suite
 * Tests A - F:
 * - Test A: OCR Failure Integrity (Empty rows, null invoiceNumber, zero mock data)
 * - Test B: Document-Specific Item Isolation (Zero cross-document leakage)
 * - Test C: Cache Key Fingerprinting & Cache Hit
 * - Test D: Cache Invalidation & Cache Miss
 * - Test E: Human Decision Provenance & Field Integrity
 * - Test F: Pharmaceutical Safety Shield & Dosage Conflict
 */

import { ExtractionCacheService } from '../src/features/purchases/services/smartImport/cache/extractionCacheService';
import { BatchSessionService } from '../src/features/purchases/services/smartImport/batchProcessing/batchSessionService';
import { ProductResolutionAction, ProductDecision, SupplierResolutionStatus } from '../src/features/purchases/services/smartImport/batchProcessing/types';
import { parseInvoiceLocally } from '../src/features/ai/services/localBackupOcrEngine';
import { ResolutionPolicy } from '../src/features/purchases/services/smartImport/domain/resolution.policy';
import { Product } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runIntegrityTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 PharmaFlow PRO — Smart Import Data Integrity Test Suite');
  console.log('======================================================\n');

  // --------------------------------------------------------------------------
  // TEST A: OCR Failure Data Integrity
  // --------------------------------------------------------------------------
  console.log('▶ TEST A: OCR Failure Data Integrity (Zero Mock Data Guarantee)');
  
  // When local OCR engine processes an unreadable / blank image:
  const ocrResult = await parseInvoiceLocally('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  
  assert(Array.isArray(ocrResult.items), 'OCR items must be an array');
  assert(ocrResult.items.length === 0, 'OCR failure must return exactly 0 items (never mock items like Panadol Extra or Amoxil)');
  assert(!ocrResult.invoiceNumber || ocrResult.invoiceNumber === '', 'OCR failure must not invent a static invoice number like 15766');
  assert((ocrResult.warning || ocrResult.notes || '').includes('تعذر'), 'OCR failure must produce honest human review notice');

  const defaultOptions = {
    tenantId: 'TENANT-TEST-A',
    branchId: 'WH-01',
    userId: 'USER-1',
    existingSuppliers: [],
    existingProducts: []
  };

  // Verify that BatchSession creation with empty analysis yields 0 products and UNKNOWN/null invoiceNumber
  const emptySession = BatchSessionService.createSession({
    sourceType: 'CAMERA',
    fileName: 'unreadable_invoice.jpg',
    fileSize: 1024,
    detectedColumns: [],
    headerRowIndex: 0,
    rows: [],
    summary: {
      totalRowsCount: 0,
      validRowsCount: 0,
      invalidRowsCount: 0,
      totalInvoiceAmount: 0,
      detectedSupplier: undefined,
      detectedInvoiceNumber: undefined,
      detectedDate: undefined,
      confidenceScore: 0,
      confidenceLevel: 'LOW',
      isWorkerUsed: false
    },
    confidenceReport: {
      overallScore: 0,
      overallLevel: 'LOW',
      breakdown: { columnConfidence: 0, dataConsistency: 0, priceCalculationAccuracy: 0, barcodeValidity: 0, dateValidity: 0 },
      recommendations: []
    },
    metadata: {
      tenantId: 'TENANT-TEST-A',
      branchId: 'WH-01',
      userId: 'USER-1',
      analyzedAt: new Date().toISOString(),
      processingTimeMs: 10,
      providerType: 'MOCK',
      providerName: 'LocalFallback',
      isCached: false,
      isFallbackUsed: true,
      parserVersion: '2.6.0'
    }
  }, defaultOptions);

  assert(emptySession.productDecisions.length === 0, 'Empty import analysis must produce exactly 0 ProductDecisions');
  assert(emptySession.summary.detectedInvoiceNumber === undefined || emptySession.summary.detectedInvoiceNumber === '', 'Invoice number must be undefined/empty when not detected');
  assert(emptySession.summary.totalRows === 0, 'Total summary rows must be 0');
  console.log('✅ TEST A PASSED: No mock products or static invoice numbers injected on failure.\n');

  // --------------------------------------------------------------------------
  // TEST B: Document-Specific Item Isolation
  // --------------------------------------------------------------------------
  console.log('▶ TEST B: Document-Specific Item Isolation (No Cross-Document Leakage)');

  const doc1Rows = [
    { rowNumber: 1, rawCells: {}, productName: 'Cetafen 500mg Tablets', quantity: 10, unitPrice: 25, total: 250, status: 'VALID' as const, confidenceScore: 0.95, validationIssues: [] }
  ];
  const session1 = BatchSessionService.createSession({
    sourceType: 'CAMERA',
    fileName: 'invoice_doc_1.jpg',
    fileSize: 2048,
    detectedColumns: [],
    headerRowIndex: 0,
    rows: doc1Rows,
    summary: {
      totalRowsCount: 1,
      validRowsCount: 1,
      invalidRowsCount: 0,
      totalInvoiceAmount: 250,
      detectedSupplier: 'United Pharma Co',
      detectedInvoiceNumber: 'INV-DOC-001',
      confidenceScore: 0.95,
      confidenceLevel: 'HIGH',
      isWorkerUsed: false
    },
    confidenceReport: { overallScore: 0.95, overallLevel: 'HIGH', breakdown: { columnConfidence: 1, dataConsistency: 1, priceCalculationAccuracy: 1, barcodeValidity: 1, dateValidity: 1 }, recommendations: [] },
    metadata: { tenantId: 'TENANT-1', branchId: 'WH-01', userId: 'U1', analyzedAt: new Date().toISOString(), processingTimeMs: 20, providerType: 'OCR', providerName: 'CloudVision', isCached: false, isFallbackUsed: false, parserVersion: '2.6.0' }
  }, defaultOptions);

  const doc2Rows = [
    { rowNumber: 1, rawCells: {}, productName: 'Augmentin 1g 14 Tab', quantity: 5, unitPrice: 90, total: 450, status: 'VALID' as const, confidenceScore: 0.92, validationIssues: [] }
  ];
  const session2 = BatchSessionService.createSession({
    sourceType: 'CAMERA',
    fileName: 'invoice_doc_2.jpg',
    fileSize: 3072,
    detectedColumns: [],
    headerRowIndex: 0,
    rows: doc2Rows,
    summary: {
      totalRowsCount: 1,
      validRowsCount: 1,
      invalidRowsCount: 0,
      totalInvoiceAmount: 450,
      detectedSupplier: 'Ibn Sina Medical',
      detectedInvoiceNumber: 'INV-DOC-002',
      confidenceScore: 0.92,
      confidenceLevel: 'HIGH',
      isWorkerUsed: false
    },
    confidenceReport: { overallScore: 0.92, overallLevel: 'HIGH', breakdown: { columnConfidence: 1, dataConsistency: 1, priceCalculationAccuracy: 1, barcodeValidity: 1, dateValidity: 1 }, recommendations: [] },
    metadata: { tenantId: 'TENANT-1', branchId: 'WH-01', userId: 'U1', analyzedAt: new Date().toISOString(), processingTimeMs: 20, providerType: 'OCR', providerName: 'CloudVision', isCached: false, isFallbackUsed: false, parserVersion: '2.6.0' }
  }, defaultOptions);

  assert(session1.sessionId !== session2.sessionId, 'Session IDs must be distinct');
  assert(session1.productDecisions.length === 1 && session1.productDecisions[0]?.importedProductName === 'Cetafen 500mg Tablets', 'Session 1 must contain only Cetafen');
  assert(session2.productDecisions.length === 1 && session2.productDecisions[0]?.importedProductName === 'Augmentin 1g 14 Tab', 'Session 2 must contain only Augmentin');
  assert(session1.summary.detectedInvoiceNumber === 'INV-DOC-001', 'Session 1 invoice number matches Doc 1');
  assert(session2.summary.detectedInvoiceNumber === 'INV-DOC-002', 'Session 2 invoice number matches Doc 2');
  console.log('✅ TEST B PASSED: Sessions are fully isolated and do not cross-contaminate.\n');

  // --------------------------------------------------------------------------
  // TEST C & D: Cache Key Fingerprinting, Hit & Miss Verification
  // --------------------------------------------------------------------------
  console.log('▶ TEST C & D: Document Cache Key Fingerprinting, Hit & Miss');

  const rawDocA = 'BASE64_PAYLOAD_DOCUMENT_A_CONTENTS_1234567890';
  const rawDocB = 'BASE64_PAYLOAD_DOCUMENT_B_CONTENTS_DIFFERENT_HASH';

  const cacheKeyA = await ExtractionCacheService.createCacheKey(
    rawDocA,
    'TENANT-ALPHA',
    'MAIN-BRANCH'
  );

  const cacheKeyA_Duplicate = await ExtractionCacheService.createCacheKey(
    rawDocA,
    'TENANT-ALPHA',
    'MAIN-BRANCH'
  );

  const cacheKeyB = await ExtractionCacheService.createCacheKey(
    rawDocB,
    'TENANT-ALPHA',
    'MAIN-BRANCH'
  );

  const cacheKeyDifferentTenant = await ExtractionCacheService.createCacheKey(
    rawDocA,
    'TENANT-BETA',
    'MAIN-BRANCH'
  );

  assert(cacheKeyA === cacheKeyA_Duplicate, 'Deterministic cache hit for identical document fingerprint');
  assert(cacheKeyA !== cacheKeyB, 'Distinct document payload produces distinct cache key (cache miss for Doc B)');
  assert(cacheKeyA !== cacheKeyDifferentTenant, 'Tenant isolation guarantees distinct cache key across tenants');

  console.log('✅ TEST C & D PASSED: Cache fingerprinting enforces cryptographic and tenant isolation.\n');

  // --------------------------------------------------------------------------
  // TEST E: Human Decision Provenance & Field Integrity
  // --------------------------------------------------------------------------
  console.log('▶ TEST E: Human Decision Provenance & Field Integrity');

  const initialDecision = session1.productDecisions[0];
  assert(initialDecision?.sourceProvenance === 'OCR' || initialDecision?.sourceProvenance === 'DATABASE_MATCH', 'Initial product decision must record valid source provenance');

  // User manually links product
  const updatedDecision = BatchSessionService.updateProductDecision(session1, 1, {
    action: ProductResolutionAction.LINK_EXISTING,
    matchedProductId: 'PROD-999',
    matchedProductName: 'Cetafen (Custom Link)',
    unitPrice: 30,
    total: 300,
    userDecision: 'LINK_EXISTING'
  });

  const modifiedItem = updatedDecision.productDecisions.find(p => p.sourceRowId === 1);
  assert(modifiedItem?.sourceProvenance === 'USER', 'Human edit must tag sourceProvenance as USER');
  assert(modifiedItem?.unitPrice === 30, 'User edited unit price must update accurately');
  assert(modifiedItem?.total === 300, 'User edited total amount must update accurately');
  assert(updatedDecision.summary.totalAmount === 300, 'Session summary total amount must recompute accurately');

  console.log('✅ TEST E PASSED: Human provenance tracking and decision mutation are solid.\n');

  // --------------------------------------------------------------------------
  // TEST F: Pharmaceutical Safety Shield & Dosage Conflict
  // --------------------------------------------------------------------------
  console.log('▶ TEST F: Pharmaceutical Safety Shield & Dosage Conflict');

  const mockDbProduct: Product = {
    id: 'P-PAN-500',
    name: 'Panadol Extra 500mg Tablets',
    Name: 'Panadol Extra 500mg Tablets',
    categoryName: 'Analgesics',
    costPrice: 20,
    UnitPrice: 25,
    unitPrice: 25,
    Current_Stock: 100,
    Item_Type: 'Medicine'
  };

  // Case 1: Matching strength (500mg vs 500mg) -> Safe
  const safeCheck = ResolutionPolicy.evaluateDosageSafety(
    'Panadol Extra 500mg',
    'Panadol Extra 500mg Tablets'
  );
  assert(!safeCheck.isConflict, 'Exact dosage match (500mg vs 500mg) must NOT trigger conflict');

  // Case 2: Conflicting strength (1000mg vs 500mg) -> Safety Conflict Triggered!
  const conflictCheck = ResolutionPolicy.evaluateDosageSafety(
    'Panadol Extra 1000mg 20 Tab',
    'Panadol Extra 500mg Tablets'
  );
  assert(conflictCheck.isConflict === true, 'Strength mismatch (1000mg vs 500mg) MUST trigger pharmaceutical safety conflict');
  assert(conflictCheck.reason?.includes('1000') || conflictCheck.reason?.includes('500') || conflictCheck.reason?.includes('تركيز') || conflictCheck.reason?.includes('تعارض'), 'Conflict reason must explain dosage divergence');

  console.log('✅ TEST F PASSED: Safety Shield successfully blocked dangerous strength mismatch.\n');

  console.log('======================================================');
  console.log('🎉 ALL INTEGRITY TESTS (A - F) PASSED WITH 100% SUCCESS!');
  console.log('======================================================\n');
}

runIntegrityTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
