// scripts/test-phase2.5-confidence-healing.ts
/**
 * PharmaFlow PRO ERP — Sovereign Enterprise Edition
 * Phase 2.5: 20-Point AI/OCR Confidence & Self-Healing Pipeline Test Suite
 */

import { ConfidenceEngine } from '../src/features/purchases/services/smartImport/confidence/confidenceEngine';
import { SelfHealingEngine } from '../src/features/purchases/services/smartImport/selfHealing/selfHealingEngine';
import { ExtractionCacheService } from '../src/features/purchases/services/smartImport/cache/extractionCacheService';
import { MultiStagePipeline } from '../src/features/purchases/services/smartImport/providers/multiStagePipeline';
import { LocalParserProvider } from '../src/features/purchases/services/smartImport/providers/localParserProvider';
import { LocalOcrProvider } from '../src/features/purchases/services/smartImport/providers/localOcrProvider';
import { FallbackProvider } from '../src/features/purchases/services/smartImport/providers/fallbackProvider';
import { CircuitBreaker } from '../src/features/purchases/services/smartImport/providers/circuitBreaker';
import { RateLimiter } from '../src/features/purchases/services/smartImport/providers/rateLimiter';
import { CorrectionFeedbackRepository } from '../src/features/purchases/services/smartImport/feedback/correctionFeedbackRepository';
import { SmartImportOrchestrator } from '../src/features/purchases/services/smartImport/smartImportOrchestrator';

async function runTests() {
  console.log('🧪 Starting Phase 2.5: AI/OCR Confidence & Self-Healing Pipeline 20-Point Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`, detail !== undefined ? detail : '');
      failed++;
    }
  }

  // --- 1. Confidence Engine Tests ---
  console.log('\n--- 1. Confidence Engine Tests ---');
  
  // Test 1: Supplier confidence scoring
  const supplierConf = ConfidenceEngine.calculateSupplierConfidence('مجموعة المتحدة للصيادلة', true);
  assert(supplierConf.score >= 0.9, 'Test 1: Supplier confidence >= 0.9 for exact known match', supplierConf);

  // Test 2: Invoice date scoring
  const dateConfValid = ConfidenceEngine.calculateInvoiceDateConfidence('2026-05-15');
  assert(dateConfValid.score === 1.0, 'Test 2: Valid ISO date yields 1.0 confidence', dateConfValid);

  // Test 3: Math validation matching (Qty * Price == Total)
  const mathConfValid = ConfidenceEngine.calculateRowConfidence({
    productName: 'Panadol Extra 500mg',
    quantity: 10,
    unitPrice: 25.5,
    total: 255.0,
    barcode: '6223001234567',
    expiryDate: '2027-12-01'
  });
  assert(mathConfValid.scores.total >= 0.95 && mathConfValid.overallScore >= 0.9, 'Test 3: Perfect math yields total confidence >= 0.95 and overall >= 0.9', mathConfValid);

  // Test 4: Math validation mismatch (Qty * Price != Total)
  const mathConfInvalid = ConfidenceEngine.calculateRowConfidence({
    productName: 'Panadol Extra 500mg',
    quantity: 10,
    unitPrice: 25.5,
    total: 500.0 // Mismatch!
  });
  assert(mathConfInvalid.scores.total <= 0.6 && mathConfInvalid.reasons.some(r => r.includes('تعارض') || r.includes('حسابي')), 'Test 4: Math mismatch lowers total confidence and records reason', mathConfInvalid);

  // Test 5: Explainable reasons generation
  const explainable = ConfidenceEngine.calculateRowConfidence({
    productName: 'Am', // Very short
    quantity: -5,      // Invalid
    unitPrice: 0,
    total: 0
  });
  assert(explainable.reasons.length >= 2, 'Test 5: Explainable confidence reasons generated for deficient row', explainable.reasons);


  // --- 2. Self-Healing Engine Tests ---
  console.log('\n--- 2. Self-Healing Engine Tests ---');

  // Test 6: Calculation healing (missing total reconstructed)
  const healedTotalResult = SelfHealingEngine.healRow({
    productName: 'Cataflam 50mg',
    quantity: 5,
    unitPrice: 40,
    total: 0
  } as any);
  assert(healedTotalResult.healedRow.total === 200 && healedTotalResult.healingResult.isModified, 'Test 6: Missing total reconstructed from qty * price', healedTotalResult);

  // Test 7: Unit price reconstruction from total and quantity
  const healedPriceResult = SelfHealingEngine.healRow({
    productName: 'Augmentin 1g',
    quantity: 4,
    unitPrice: 0,
    total: 360
  } as any);
  assert(healedPriceResult.healedRow.unitPrice === 90 && healedPriceResult.healingResult.isModified, 'Test 7: Missing unit price reconstructed from total / qty', healedPriceResult);

  // Test 8: Eastern Arabic numeral normalization
  const normalizedNum = SelfHealingEngine.normalizeNumericString('١٢٥٫٥٠');
  assert(normalizedNum === 125.5, 'Test 8: Eastern Arabic numerals "١٢٥٫٥٠" normalized to 125.5', normalizedNum);

  // Test 9: Date normalization (DD/MM/YYYY -> YYYY-MM-DD)
  const normalizedDate = SelfHealingEngine.normalizeDate('25/12/2026');
  assert(normalizedDate === '2026-12-25', 'Test 9: DD/MM/YYYY date normalized to ISO YYYY-MM-DD', normalizedDate);

  // Test 10: Expiry date normalization ('12/28' -> '2028-12')
  const normalizedExp = SelfHealingEngine.normalizeExpiry('12/28');
  assert(normalizedExp === '2028-12', 'Test 10: Short expiry "12/28" normalized to "2028-12"', normalizedExp);

  // Test 11: Barcode sanitation
  const cleanBarcode = SelfHealingEngine.sanitizeBarcode('  [BAR: 6223001234567]  ');
  assert(cleanBarcode === '6223001234567', 'Test 11: Barcode text sanitized and cleaned of wrappers', cleanBarcode);


  // --- 3. Caching & Provider Resilience ---
  console.log('\n--- 3. Caching & Provider Resilience ---');

  // Test 12: Caching returns cached result with tenant isolation
  const sampleData = {
    supplier: 'شركة ابن سينا فارما',
    invoiceNumber: 'INV-999',
    rows: [{ productName: 'Aspirin Protect 100mg', quantity: 20, unitPrice: 15, total: 300 }]
  };
  await ExtractionCacheService.set('TENANT-A', 'HASH-12345', sampleData, 0.95);
  const cached = await ExtractionCacheService.get('TENANT-A', 'HASH-12345');
  assert(cached !== null && cached.confidence === 0.95, 'Test 12: Cache hit returns cached document and confidence', cached);

  // Test 13: Cache isolation between tenants
  const tenantBCache = await ExtractionCacheService.get('TENANT-B', 'HASH-12345');
  assert(tenantBCache === null, 'Test 13: Cache misses for different tenant (tenant isolation verified)', tenantBCache);

  // Test 14: Circuit Breaker trips after consecutive failures
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5000 });
  assert(cb.canExecute(), 'Test 14a: Circuit Breaker is initially CLOSED');
  cb.recordFailure();
  cb.recordFailure();
  assert(!cb.canExecute(), 'Test 14b: Circuit Breaker opens after 2 failures');

  // Test 15: Circuit Breaker reset after success
  cb.reset();
  assert(cb.canExecute(), 'Test 15: Circuit Breaker resets to closed after reset()');

  // Test 16: Rate Limiter throttling and retry execution
  const rl = new RateLimiter({ minIntervalMs: 50, maxRetries: 2, initialBackoffMs: 20 });
  let attempts = 0;
  const result = await rl.executeWithRetry(async (attempt) => {
    attempts++;
    if (attempt === 0) throw new Error('Temporary Network Error');
    return 'SUCCESS';
  });
  assert(result === 'SUCCESS' && attempts === 2, 'Test 16: RateLimiter executes with retry on transient error', { result, attempts });


  // --- 4. Safety Guard & Feedback Repository ---
  console.log('\n--- 4. Safety Guard & Feedback Repository ---');

  // Test 17: Low confidence document flagged as LOW
  const lowSummary = ConfidenceEngine.calculateDocumentSummary([
    {
      scores: { productName: 0.3, quantity: 0.4, unitPrice: 0.4, total: 0.3, barcode: 0, expiryDate: 0 },
      overallScore: 0.35,
      reasons: ['Unclear OCR text']
    }
  ]);
  assert(lowSummary.confidenceLevel === 'LOW' && lowSummary.requiresHumanReview === true, 'Test 17: Low confidence (<0.70) document flagged as LOW and requires human review', lowSummary);

  // Test 18: Dosage Conflict blocks auto approval
  const blockedSummary = ConfidenceEngine.calculateDocumentSummary(
    [{ scores: { productName: 0.9, quantity: 1, unitPrice: 1, total: 1, barcode: 1, expiryDate: 1 }, overallScore: 0.95, reasons: [] }],
    true // hasDosageConflict = true
  );
  assert(blockedSummary.confidenceLevel === 'BLOCKED', 'Test 18: Dosage conflict forces confidenceLevel to BLOCKED', blockedSummary);

  // Test 19: Human correction feedback repository records correction without mutating aliases
  await CorrectionFeedbackRepository.recordCorrection({
    tenantId: 'TENANT-A',
    branchId: 'WH-MAIN',
    sourceType: 'IMAGE',
    field: 'productName',
    originalExtractedValue: 'Pndol Extr',
    correctedValue: 'Panadol Extra 500mg',
    provider: 'HumanReview',
    confidenceBefore: 0.45,
    correctionReason: 'Typo in OCR'
  });
  const feedbackList = await CorrectionFeedbackRepository.getFeedback('TENANT-A');
  assert(feedbackList.length > 0 && feedbackList[0].correctedValue === 'Panadol Extra 500mg', 'Test 19: Human correction feedback recorded in repository safely', feedbackList[0]);


  // --- 5. End-to-End SmartImportOrchestrator Pipeline ---
  console.log('\n--- 5. End-to-End Orchestrator Pipeline ---');

  // Test 20: Orchestrator analyzes mock invoice with multi-stage pipeline and healing
  const mockCsvContent = 'Product,Qty,Price,Total\nAmoxil 500mg,10,35,\nFlagyl 500mg,5,20,100';
  const csvFile = new File([mockCsvContent], 'test_invoice.csv', { type: 'text/csv' });
  
  const analysisResult = await SmartImportOrchestrator.analyzeFile(csvFile, {
    tenantId: 'TENANT-A',
    branchId: 'WH-MAIN'
  });

  const firstRowHealed = analysisResult.rows[0];
  assert(
    analysisResult.rows.length === 2 &&
    firstRowHealed.total === 350 &&
    (analysisResult.summary.confidenceScore || 0) >= 0.70 &&
    analysisResult.metadata.providerName === 'LocalDeterministicParser',
    'Test 20: End-to-End analysis parses CSV, heals missing total (350), applies confidence, and metadata',
    { rowCount: analysisResult.rows.length, total: firstRowHealed.total, confidence: analysisResult.summary.confidenceScore, provider: analysisResult.metadata.providerName }
  );

  console.log(`\n========================================`);
  console.log(`📊 TEST SUITE SUMMARY: ${passed}/20 PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
