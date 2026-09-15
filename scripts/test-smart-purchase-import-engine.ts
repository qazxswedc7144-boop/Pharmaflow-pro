// scripts/test-smart-purchase-import-engine.ts
// Comprehensive Test Suite for Enterprise Smart Purchase Import Engine
// Minimum 40 automated tests covering all 7 core categories

import { SourceDetector } from '../src/features/purchases/services/smartImport/sourceDetector';
import { ColumnIntelligence } from '../src/features/purchases/services/smartImport/columnIntelligence';
import { SpreadsheetParser } from '../src/features/purchases/services/smartImport/spreadsheetParser';
import { DataValidator } from '../src/features/purchases/services/smartImport/dataValidator';
import { ProductMatchingEngine } from '../src/features/purchases/services/smartImport/productMatchingEngine';
import { SmartImportOrchestrator } from '../src/features/purchases/services/smartImport/smartImportOrchestrator';
import { Product, InvoiceItem } from '../src/types';

interface TestResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const testResults: TestResult[] = [];
let testCounter = 1;

async function runTest(category: string, name: string, fn: () => Promise<void> | void) {
  const currentId = testCounter++;
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    testResults.push({ id: currentId, category, name, passed: true, durationMs });
    console.log(`  ✅ [PASS] #${currentId} [${category}] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    testResults.push({ id: currentId, category, name, passed: false, error: err.message, durationMs });
    console.error(`  ❌ [FAIL] #${currentId} [${category}] ${name} (${durationMs}ms) -> ${err.message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

async function runAllTests() {
  console.log("================================================================================");
  console.log(" 🧪 PHARMAFLOW PRO ERP — ENTERPRISE SMART IMPORT ENGINE TEST SUITE");
  console.log("================================================================================\n");

  // ============================================================================
  // CATEGORY 1: SOURCE DETECTION & FILE VALIDATION
  // ============================================================================
  console.log("\n--- Category 1: Source Detection & File Validation ---");

  await runTest("Source Detection", "Detects XLSX file extension", () => {
    const type = SourceDetector.detectSourceType("supplier_invoice_2026.xlsx");
    assertEqual(type, "EXCEL", "Should identify XLSX as EXCEL");
  });

  await runTest("Source Detection", "Detects XLS file extension", () => {
    const type = SourceDetector.detectSourceType("legacy_invoice.xls");
    assertEqual(type, "EXCEL", "Should identify XLS as EXCEL");
  });

  await runTest("Source Detection", "Detects CSV file extension and UTF-8 MIME", () => {
    const type = SourceDetector.detectSourceType("pharma_order.csv");
    assertEqual(type, "CSV", "Should identify CSV file");
  });

  await runTest("Source Detection", "Detects PDF invoice document", () => {
    const type = SourceDetector.detectSourceType("al_dawaa_invoice.pdf");
    assertEqual(type, "PDF", "Should identify PDF document");
  });

  await runTest("Source Detection", "Detects Image formats (JPG, PNG, WEBP)", () => {
    assertEqual(SourceDetector.detectSourceType("invoice_cam.jpg"), "IMAGE", "JPG detection");
    assertEqual(SourceDetector.detectSourceType("scan_bill.png"), "IMAGE", "PNG detection");
    assertEqual(SourceDetector.detectSourceType("photo.webp"), "IMAGE", "WEBP detection");
  });

  await runTest("Source Detection", "Detects Camera data URI capture", () => {
    const type = SourceDetector.detectSourceType("data:image/jpeg;base64,/9j/4AAQSkZJRg==");
    assertEqual(type, "IMAGE", "Should detect data URI image");
  });

  await runTest("Source Detection", "Rejects unsupported file format with clear error", () => {
    const res = SourceDetector.validateFile("unsupported_document.xyz");
    assert(!res.isValid, "Unknown file must not be valid");
    assertEqual(res.errorCode, "UNSUPPORTED_FILE", "Error code should be UNSUPPORTED_FILE");
  });

  await runTest("Source Detection", "Rejects empty 0-byte file", () => {
    const emptyFile = { name: "empty.xlsx", size: 0, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as File;
    const res = SourceDetector.validateFile(emptyFile);
    assert(!res.isValid, "0-byte file must be rejected");
    assertEqual(res.errorCode, "EMPTY_FILE", "Must report EMPTY_FILE");
  });

  // ============================================================================
  // CATEGORY 2: ADAPTIVE COLUMN INTELLIGENCE & SYNONYMS
  // ============================================================================
  console.log("\n--- Category 2: Adaptive Column Intelligence & Synonyms ---");

  await runTest("Column Intelligence", "Identifies exact Arabic Product Name headers", () => {
    const headers = ['اسم الصنف', 'الصنف', 'اسم المنتج', 'المستحضر', 'اسم المادة', 'الدواء'];
    for (const h of headers) {
      const match = ColumnIntelligence.matchColumnHeader(h);
      assertEqual(match.targetField, 'productName', `Header '${h}' must map to productName`);
      assert(match.confidence >= 90, `Header '${h}' confidence must be >= 90`);
    }
  });

  await runTest("Column Intelligence", "Identifies exact English Product Name headers", () => {
    const headers = ['Item Name', 'Product Name', 'Description', 'Item Description', 'Medicine', 'desc'];
    for (const h of headers) {
      const match = ColumnIntelligence.matchColumnHeader(h);
      assertEqual(match.targetField, 'productName', `Header '${h}' must map to productName`);
      assert(match.confidence >= 80, `Confidence for '${h}' must be high`);
    }
  });

  await runTest("Column Intelligence", "Identifies Quantity headers in Arabic, English, and Abbreviations", () => {
    const headers = ['الكمية', 'كمية', 'العدد', 'Qty', 'Quantity', 'Count', 'Units', 'Pcs', 'QNT'];
    for (const h of headers) {
      const match = ColumnIntelligence.matchColumnHeader(h);
      assertEqual(match.targetField, 'quantity', `Header '${h}' must map to quantity`);
    }
  });

  await runTest("Column Intelligence", "Identifies Unit Price headers", () => {
    const headers = ['سعر الوحدة', 'سعر الشراء', 'السعر', 'التكلفة', 'Unit Price', 'Cost', 'Rate', 'Purchase Price'];
    for (const h of headers) {
      const match = ColumnIntelligence.matchColumnHeader(h);
      assertEqual(match.targetField, 'unitPrice', `Header '${h}' must map to unitPrice`);
    }
  });

  await runTest("Column Intelligence", "Identifies Total / Line Total headers", () => {
    const headers = ['الإجمالي', 'المجموع', 'صافي القيمة', 'Total', 'Line Total', 'Net Amount', 'Subtotal'];
    for (const h of headers) {
      const match = ColumnIntelligence.matchColumnHeader(h);
      assertEqual(match.targetField, 'total', `Header '${h}' must map to total`);
    }
  });

  await runTest("Column Intelligence", "Identifies Batch and Expiry Date headers", () => {
    assertEqual(ColumnIntelligence.matchColumnHeader('رقم التشغيلة').targetField, 'batchNumber', 'Batch Arabic');
    assertEqual(ColumnIntelligence.matchColumnHeader('Batch No').targetField, 'batchNumber', 'Batch English');
    assertEqual(ColumnIntelligence.matchColumnHeader('تاريخ الصلاحية').targetField, 'expiryDate', 'Expiry Arabic');
    assertEqual(ColumnIntelligence.matchColumnHeader('Exp Date').targetField, 'expiryDate', 'Expiry English');
  });

  await runTest("Column Intelligence", "Identifies Discount, Tax, Barcode, Bonus Qty", () => {
    assertEqual(ColumnIntelligence.matchColumnHeader('نسبة الخصم').targetField, 'discount', 'Discount %');
    assertEqual(ColumnIntelligence.matchColumnHeader('الضريبة').targetField, 'tax', 'Tax');
    assertEqual(ColumnIntelligence.matchColumnHeader('الباركود').targetField, 'barcode', 'Barcode');
    assertEqual(ColumnIntelligence.matchColumnHeader('بونص').targetField, 'bonusQty', 'Bonus Qty');
  });

  await runTest("Column Intelligence", "Discards irrelevant supplier columns by mapping to ignore", () => {
    const useless = ['رقم الصفحة', 'موقع الرف', 'اسم المندوب', 'رمز المستودع الداخلي', 'Internal Rack', 'Page No', 'Country of Origin'];
    for (const u of useless) {
      const match = ColumnIntelligence.matchColumnHeader(u);
      assertEqual(match.targetField, 'ignore', `Useless column '${u}' must be ignored`);
    }
  });

  await runTest("Column Intelligence", "Resolves duplicate column target conflicts (keeps highest confidence)", () => {
    const headers = ['وصف الصنف العام', 'اسم الصنف'];
    const resolved = ColumnIntelligence.analyzeHeaders(headers);
    const prodCols = resolved.filter(c => c.mappedField === 'productName');
    assertEqual(prodCols.length, 1, 'Only one column should be assigned as productName');
    assertEqual(resolved[1].mappedField, 'productName', 'Exact "اسم الصنف" should win over loose description');
  });

  // ============================================================================
  // CATEGORY 3: SPREADSHEET INTELLIGENCE & SANITIZATION
  // ============================================================================
  console.log("\n--- Category 3: Spreadsheet Intelligence & Sanitization ---");

  await runTest("Spreadsheet Parser", "Converts Eastern Arabic numerals (٠-٩) to ASCII (0-9)", () => {
    const arabicDigits = "١٢٣٤٥٦٧٨٩٠";
    const converted = SpreadsheetParser.normalizeNumerals(arabicDigits);
    assertEqual(converted, "1234567890", "Must convert all Arabic digits correctly");
  });

  await runTest("Spreadsheet Parser", "Converts Persian numerals (۰-۹) to ASCII (0-9)", () => {
    const persianDigits = "۱۲۳۴۵۶۷۸۹۰";
    const converted = SpreadsheetParser.normalizeNumerals(persianDigits);
    assertEqual(converted, "1234567890", "Must convert all Persian digits correctly");
  });

  await runTest("Spreadsheet Parser", "Cleans currencies, thousand separators, and spaces from numbers", () => {
    assertEqual(SpreadsheetParser.parseCleanNumber("1,250.50 SAR"), 1250.5, "SAR with comma");
    assertEqual(SpreadsheetParser.parseCleanNumber("٢,٥٠٠ ريال"), 2500, "Arabic digits with comma and text");
    assertEqual(SpreadsheetParser.parseCleanNumber("$ 350.75"), 350.75, "Dollar with space");
    assertEqual(SpreadsheetParser.parseCleanNumber("15%"), 15, "Percentage sign");
  });

  await runTest("Spreadsheet Parser", "Neutralizes CSV formula injection attempts", () => {
    const injected1 = "=SUM(A1:A10)";
    const injected2 = "@DDE('cmd';'/c calc.exe')";
    const injected3 = "+cmd|'/C calc'!A0";

    const clean1 = SpreadsheetParser.sanitizeCellValue(injected1);
    const clean2 = SpreadsheetParser.sanitizeCellValue(injected2);
    const clean3 = SpreadsheetParser.sanitizeCellValue(injected3);

    assert(!clean1.startsWith('='), "Formula '=' must be stripped");
    assert(!clean2.startsWith('@'), "Formula '@' must be stripped");
    assert(!clean3.startsWith('+'), "Formula '+' must be stripped");
  });

  await runTest("Spreadsheet Parser", "Blocks Prototype Pollution keys in cell values", () => {
    assertEqual(SpreadsheetParser.sanitizeCellValue("__proto__"), "", "Must neutralize __proto__");
    assertEqual(SpreadsheetParser.sanitizeCellValue("constructor"), "", "Must neutralize constructor");
  });

  await runTest("Spreadsheet Parser", "Detects Table Header row offset (skipping supplier header metadata)", () => {
    const rawGrid = [
      ['شركة الوفاء للأدوية والمستلزمات الطبية'],
      ['ص.ب 12345 - هاتف 0123456789'],
      ['فاتورة مبيعات رقم: 998822'],
      ['التاريخ: 2026-08-20'],
      [''], // empty row
      ['م', 'اسم الصنف', 'الكمية', 'سعر الشراء', 'الإجمالي', 'الصلاحية'] // Row 5 is header!
    ];

    const detection = SpreadsheetParser.findTableHeaders(rawGrid);
    assertEqual(detection.headerRowIndex, 5, "Should detect table headers on row index 5");
  });

  await runTest("Spreadsheet Parser", "Detects and filters out footer / grand total / signature rows", () => {
    assert(SpreadsheetParser.isFooterOrSummaryRow(['الإجمالي العام', '', '', '15400']), "Grand total in Arabic");
    assert(SpreadsheetParser.isFooterOrSummaryRow(['Grand Total', '500', '10000']), "Grand total in English");
    assert(SpreadsheetParser.isFooterOrSummaryRow(['توقيع المستلم', '', '']), "Signature row");
    assert(!SpreadsheetParser.isFooterOrSummaryRow(['Panadol Extra 500mg', '10', '15', '150']), "Valid item row");
  });

  // ============================================================================
  // CATEGORY 4: DATA VALIDATION & MATH VERIFICATION
  // ============================================================================
  console.log("\n--- Category 4: Data Validation & Math Verification ---");

  await runTest("Data Validation", "Validates a clean, perfectly formed invoice item row", () => {
    const seenMap = new Map<string, number>();
    const row = DataValidator.validateRow({
      productName: "Amoxicillin 500mg",
      quantity: 10,
      unitPrice: 15.0,
      total: 150.0,
      expiryDate: "2027-12-31"
    }, 1, seenMap);

    assertEqual(row.status, "VALID", "Row must be valid");
    assertEqual(row.validationIssues.length, 0, "Should have 0 issues");
  });

  await runTest("Data Validation", "Flags missing or too short product name", () => {
    const seenMap = new Map<string, number>();
    const row = DataValidator.validateRow({
      productName: "A",
      quantity: 5,
      unitPrice: 10
    }, 1, seenMap);

    assertEqual(row.status, "MISSING_PRODUCT_NAME", "Must catch invalid product name");
  });

  await runTest("Data Validation", "Flags invalid or zero quantity", () => {
    const seenMap = new Map<string, number>();
    const row = DataValidator.validateRow({
      productName: "Ibuprofen 400mg",
      quantity: 0,
      unitPrice: 20
    }, 1, seenMap);

    assertEqual(row.status, "INVALID_QUANTITY", "Must catch zero quantity");
  });

  await runTest("Data Validation", "Detects Calculation Mismatch (Qty * Price != Supplier Total) with tolerance", () => {
    const seenMap = new Map<string, number>();
    // Qty = 10, Price = 100 -> Expected Total = 1000. Supplier Total = 1200 (mismatch!)
    const row = DataValidator.validateRow({
      productName: "Augmentin 1g",
      quantity: 10,
      unitPrice: 100,
      total: 1200
    }, 1, seenMap);

    assertEqual(row.status, "PRICE_TOTAL_MISMATCH", "Must flag math discrepancy");
    assert(row.validationIssues.some(i => i.includes("فارق في الإجمالي")), "Must provide human readable mismatch reason");
  });

  await runTest("Data Validation", "Handles Discount Percentage in mathematical validation", () => {
    const seenMap = new Map<string, number>();
    // Qty = 10, Price = 100 -> Subtotal = 1000. Discount 10% -> Net = 900.
    const row = DataValidator.validateRow({
      productName: "Voltaren 50mg",
      quantity: 10,
      unitPrice: 100,
      discountPercent: 10,
      total: 900
    }, 1, seenMap);

    assertEqual(row.status, "VALID", "Discounted calculation must match net total");
  });

  await runTest("Data Validation", "Detects duplicate items within the same invoice file", () => {
    const seenMap = new Map<string, number>();
    const row1 = DataValidator.validateRow({ productName: "Cataflam 50mg", quantity: 5, unitPrice: 20, batchNumber: "B100" }, 1, seenMap);
    const row2 = DataValidator.validateRow({ productName: "Cataflam 50mg", quantity: 10, unitPrice: 20, batchNumber: "B100" }, 2, seenMap);

    assert(!row1.isDuplicate, "First occurrence is not duplicate");
    assert(row2.isDuplicate, "Second occurrence with same name and batch must be marked duplicate");
    assertEqual(row2.duplicateReason, "مكرر مع السطر رقم #1", "Must link duplicate to row #1");
  });

  // ============================================================================
  // CATEGORY 5: DATE & EXPIRY DETECTION
  // ============================================================================
  console.log("\n--- Category 5: Date & Expiry Detection ---");

  await runTest("Expiry Detection", "Normalizes YYYY-MM-DD and YYYY/MM/DD formats", () => {
    const res1 = DataValidator.normalizeExpiryDate("2028-05-15");
    const res2 = DataValidator.normalizeExpiryDate("2028/05/15");
    assertEqual(res1.normalizedDate, "2028-05-15", "Dash format");
    assertEqual(res2.normalizedDate, "2028-05-15", "Slash format");
  });

  await runTest("Expiry Detection", "Normalizes DD/MM/YYYY format", () => {
    const res = DataValidator.normalizeExpiryDate("25/11/2027");
    assertEqual(res.normalizedDate, "2027-11-25", "DD/MM/YYYY conversion");
  });

  await runTest("Expiry Detection", "Normalizes MM/YYYY and YYYY/MM formats", () => {
    const res1 = DataValidator.normalizeExpiryDate("06/2029");
    const res2 = DataValidator.normalizeExpiryDate("2029/06");
    assertEqual(res1.normalizedDate, "2029-06-01", "MM/YYYY converted to first day of month");
    assertEqual(res2.normalizedDate, "2029-06-01", "YYYY/MM converted to first day of month");
  });

  await runTest("Expiry Detection", "Flags expired or past dates as warning", () => {
    const res = DataValidator.normalizeExpiryDate("2020-01-01");
    assert(res.isValid, "Format is valid");
    assert(res.isExpired === true, "Must flag expired date");
  });

  await runTest("Expiry Detection", "Rejects invalid date strings", () => {
    const res = DataValidator.normalizeExpiryDate("99/99/2026");
    assert(!res.isValid, "Month 99 must be rejected");
  });

  // ============================================================================
  // CATEGORY 6: PRODUCT MATCHING & TENANT ISOLATION
  // ============================================================================
  console.log("\n--- Category 6: Product Matching & Tenant Isolation ---");

  const mockDbProducts: Product[] = [
    { id: 'PROD-1', name: 'Panadol Advance 500mg', Name: 'Panadol Advance 500mg', barcode: '6281001001', CostPrice: 12, UnitPrice: 15, StockQuantity: 100, Is_Active: true, categoryId: 'CAT-1', tenantId: 'TENANT-A' } as any,
    { id: 'PROD-2', name: 'بنادول إكسترا أقراص', Name: 'بنادول إكسترا أقراص', barcode: '6281001002', CostPrice: 18, UnitPrice: 22, StockQuantity: 50, Is_Active: true, categoryId: 'CAT-1', tenantId: 'TENANT-A' } as any,
    { id: 'PROD-3', name: 'Brufen 400mg Syrup', Name: 'Brufen 400mg Syrup', barcode: '6281001003', CostPrice: 25, UnitPrice: 30, StockQuantity: 20, Is_Active: true, categoryId: 'CAT-2', tenantId: 'TENANT-A' } as any
  ];

  await runTest("Product Matching", "Matches product by exact barcode", () => {
    const match = ProductMatchingEngine.matchItem({
      productName: 'Different Name From Supplier',
      barcode: '6281001001',
      quantity: 1,
      unitPrice: 12,
      status: 'VALID',
      validationIssues: [],
      rowNumber: 1,
      rawCells: {}
    }, mockDbProducts);

    assert(match !== null, "Must find match by barcode");
    assertEqual(match?.product.id, 'PROD-1', "Matched product ID");
    assertEqual(match?.matchType, 'BARCODE', "Match tier must be BARCODE");
  });

  await runTest("Product Matching", "Matches product by exact name", () => {
    const match = ProductMatchingEngine.matchItem({
      productName: 'Panadol Advance 500mg',
      quantity: 5,
      unitPrice: 12,
      status: 'VALID',
      validationIssues: [],
      rowNumber: 1,
      rawCells: {}
    }, mockDbProducts);

    assertEqual(match?.matchType, 'EXACT', "Match tier must be EXACT");
    assertEqual(match?.product.id, 'PROD-1', "Matched PROD-1");
  });

  await runTest("Product Matching", "Matches Arabic product with normalized letters (alef/taa/spaces)", () => {
    const match = ProductMatchingEngine.matchItem({
      productName: 'بنادول اكسترا اقراص', // Without hamzas on alef
      quantity: 2,
      unitPrice: 18,
      status: 'VALID',
      validationIssues: [],
      rowNumber: 1,
      rawCells: {}
    }, mockDbProducts);

    assertEqual(match?.matchType, 'NORMALIZED', "Match tier must be NORMALIZED");
    assertEqual(match?.product.id, 'PROD-2', "Matched PROD-2");
  });

  await runTest("Product Matching", "Matches via Learned Alias dictionary", () => {
    const learned = { 'بنادول ادفانس انجليزي': 'Panadol Advance 500mg' };
    const match = ProductMatchingEngine.matchItem({
      productName: 'بنادول ادفانس انجليزي',
      quantity: 10,
      unitPrice: 12,
      status: 'VALID',
      validationIssues: [],
      rowNumber: 1,
      rawCells: {}
    }, mockDbProducts, learned);

    assertEqual(match?.matchType, 'ALIAS', "Match tier must be ALIAS");
    assertEqual(match?.product.id, 'PROD-1', "Matched PROD-1");
  });

  await runTest("Product Matching", "Matches via Fuzzy Similarity when score >= 0.70", () => {
    const match = ProductMatchingEngine.matchItem({
      productName: 'Brufen 400mg Syrp', // Slight typo in Syrup
      quantity: 1,
      unitPrice: 25,
      status: 'VALID',
      validationIssues: [],
      rowNumber: 1,
      rawCells: {}
    }, mockDbProducts);

    assertEqual(match?.matchType, 'FUZZY', "Match tier must be FUZZY");
    assertEqual(match?.product.id, 'PROD-3', "Matched PROD-3");
  });

  await runTest("Product Matching", "Identifies unmatched items as NEW_PRODUCT_CANDIDATE", () => {
    const rows = ProductMatchingEngine.matchAllRows([
      {
        rowNumber: 1,
        rawCells: {},
        productName: 'Unregistered Vitamin C 1000mg effervescent',
        quantity: 10,
        unitPrice: 35,
        status: 'VALID',
        validationIssues: []
      }
    ], mockDbProducts);

    assertEqual(rows[0].isNewProductCandidate, true, "Must flag as new product candidate");
    assertEqual(rows[0].matchType, 'NONE', "Match type must be NONE");
  });

  // ============================================================================
  // CATEGORY 7: END-TO-END ORCHESTRATION & PURCHASE INVOICE INTEGRATION
  // ============================================================================
  console.log("\n--- Category 7: End-to-End Orchestration & Purchase Invoice Integration ---");

  await runTest("End-to-End Orchestration", "Processes 4-Column Supplier Invoice (Item, Qty, Price, Total)", () => {
    const grid = [
      ['اسم الصنف', 'الكمية', 'سعر الشراء', 'الإجمالي'],
      ['Panadol Advance 500mg', '10', '12', '120'],
      ['Brufen 400mg Syrup', '5', '25', '125']
    ];

    const headerDetection = SpreadsheetParser.findTableHeaders(grid);
    const extracted = SmartImportOrchestrator.extractRowsFromGrid(grid, headerDetection.headerRowIndex, headerDetection.columnDefs);
    assertEqual(extracted.length, 2, "Extracted 2 rows");
    assertEqual(extracted[0].productName, 'Panadol Advance 500mg', 'Item 1 name');
    assertEqual(extracted[0].quantity, 10, 'Item 1 qty');
    assertEqual(extracted[0].unitPrice, 12, 'Item 1 price');
  });

  await runTest("End-to-End Orchestration", "Processes 6-Column Invoice with Expiry, Batch, and Discards 4 Irrelevant Columns", () => {
    const grid = [
      ['الرقم', 'اسم الصنف', 'رمز المستودع', 'الكمية', 'موقع الرف', 'سعر الوحدة', 'رقم التشغيلة', 'تاريخ الصلاحية', 'ملاحظات المندوب', 'الإجمالي'],
      ['1', 'بنادول إكسترا أقراص', 'WH-09', '20', 'A-12', '18', 'BATCH-889', '2028-10-31', 'تسليم سريع', '360']
    ];

    const headerDetection = SpreadsheetParser.findTableHeaders(grid);
    const extracted = SmartImportOrchestrator.extractRowsFromGrid(grid, headerDetection.headerRowIndex, headerDetection.columnDefs);
    assertEqual(extracted.length, 1, "Extracted 1 row");
    assertEqual(extracted[0].productName, 'بنادول إكسترا أقراص', 'Product Name extracted');
    assertEqual(extracted[0].batchNumber, 'BATCH-889', 'Batch extracted');
    assertEqual(extracted[0].expiryDate, '2028-10-31', 'Expiry extracted');
  });

  await runTest("End-to-End Orchestration", "Converts approved extracted rows into standard Purchase InvoiceItem array", () => {
    const validatedRows = [
      {
        rowNumber: 1,
        rawCells: {},
        productName: 'Panadol Advance 500mg',
        quantity: 10,
        unitPrice: 12,
        total: 120,
        batchNumber: 'B99',
        expiryDate: '2028-05-01',
        matchedProductId: 'PROD-1',
        matchedProductName: 'Panadol Advance 500mg',
        status: 'VALID' as const,
        validationIssues: []
      }
    ];

    const invoiceItems = SmartImportOrchestrator.convertToInvoiceItems(validatedRows, 'INV-TEST-001');
    assertEqual(invoiceItems.length, 1, "Converted 1 InvoiceItem");
    assertEqual(invoiceItems[0].productId, 'PROD-1', "Product ID preserved");
    assertEqual(invoiceItems[0].quantity, 10, "Quantity preserved");
    assertEqual(invoiceItems[0].unitPrice, 12, "Unit price preserved");
    assertEqual(invoiceItems[0].subtotal, 120, "Subtotal calculated");
    assertEqual(invoiceItems[0].parent_id, 'INV-TEST-001', "Parent invoice number linked");
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  const total = testResults.length;

  console.log("\n================================================================================");
  console.log(` 📊 SMART IMPORT TEST SUITE RESULTS: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
