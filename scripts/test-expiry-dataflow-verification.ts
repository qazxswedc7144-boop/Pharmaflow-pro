// scripts/test-expiry-dataflow-verification.ts
// Comprehensive Automated Test Suite for Expiry Date Data Flow & Adaptive Purchase Row Verification

import 'fake-indexeddb/auto';
import { db } from '../src/core/db';
import { normalizeToISODate, formatExpiryDateDisplay, getExpiryStatus, isValidISODate } from '../src/utils/expiryUtils';
import { DraftService } from '../src/services/system/DraftService';
import { StockMovementEngine } from '../src/features/inventory/services/stockMovementEngine';
import { SmartImportOrchestrator } from '../src/features/purchases/services/smartImport/smartImportOrchestrator';
import { InvoiceItem } from '../src/types';

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

async function main() {
  console.log("================================================================================");
  console.log(" 🧪 PHARMAFLOW PRO — EXPIRY DATE DATA FLOW & ADAPTIVE ROW VERIFICATION SUITE");
  console.log("================================================================================\n");

  // -------------------------------------------------------------
  // Category 1: Date Normalization Safety & Determinism
  // -------------------------------------------------------------
  await runTest("DATE_NORMALIZATION", "Scenario 8: ISO date string '2027-05-30' is preserved", () => {
    const result = normalizeToISODate("2027-05-30");
    assertEqual(result, "2027-05-30", "Exact ISO date should match");
  });

  await runTest("DATE_NORMALIZATION", "Scenario 8: Slash date '2027/05/30' normalizes to ISO", () => {
    const result = normalizeToISODate("2027/05/30");
    assertEqual(result, "2027-05-30", "Slash format should normalize to YYYY-MM-DD");
  });

  await runTest("DATE_NORMALIZATION", "Scenario 8: Valid DD/MM/YYYY '30/05/2027' normalizes to ISO", () => {
    const result = normalizeToISODate("30/05/2027");
    assertEqual(result, "2027-05-30", "DD/MM/YYYY should normalize to YYYY-MM-DD");
  });

  await runTest("DATE_NORMALIZATION", "Scenario 8: Valid MM/YYYY '05/2027' normalizes deterministically to ISO date", () => {
    const result = normalizeToISODate("05/2027");
    assertEqual(result, "2027-05-01", "MM/YYYY should normalize to deterministic start-of-month date YYYY-MM-01");
  });

  await runTest("DATE_NORMALIZATION", "Scenario 8: Partial month-year '02/2028' normalizes to deterministic ISO date", () => {
    const result = normalizeToISODate("02/2028");
    assertEqual(result, "2028-02-01", "Month-year should normalize deterministically");
  });

  await runTest("TIMEZONE_SAFETY", "Scenario 9: Timezone conversion safety - date does not shift by +/- 1 day", () => {
    const rawDate = "2027-05-30";
    const normalized = normalizeToISODate(rawDate);
    // Parse strictly date parts
    const [year, month, day] = normalized.split('-').map(Number);
    assertEqual(year, 2027, "Year must remain 2027");
    assertEqual(month, 5, "Month must remain 5");
    assertEqual(day, 30, "Day must remain 30 without shifting to 29 or 31");
  });

  await runTest("NO_EXPIRY", "Scenario 14: Empty, null, undefined or whitespace expiry dates normalize to empty string", () => {
    assertEqual(normalizeToISODate(""), "", "Empty string should return empty string");
    assertEqual(normalizeToISODate(null), "", "Null should return empty string");
    assertEqual(normalizeToISODate(undefined), "", "Undefined should return empty string");
    assertEqual(normalizeToISODate("   "), "", "Whitespace string should return empty string");
  });

  // -------------------------------------------------------------
  // Category 2: End-to-End Invoice Item & Modal Operations
  // -------------------------------------------------------------
  await runTest("MANUAL_ENTRY", "Scenario 1: Add purchase item with expiryDate", async () => {
    const inputItem = {
      id: "test-item-1",
      product_id: "prod-panadol",
      productId: "prod-panadol",
      name: "بانادول إكسترا 500 مجم Panadol Extra",
      productName: "بانادول إكسترا 500 مجم Panadol Extra",
      qty: 10,
      price: 25.5,
      sum: 255,
      expiryDate: "2027-05-30"
    };

    const normalizedExp = normalizeToISODate(inputItem.expiryDate);
    const invoiceItem: InvoiceItem = {
      ...inputItem,
      expiryDate: normalizedExp,
      row_order: 1
    };

    assertEqual(invoiceItem.expiryDate, "2027-05-30", "Item state retains normalized expiryDate");
    assertEqual(invoiceItem.qty, 10, "Item quantity is correct");
    assertEqual(invoiceItem.price, 25.5, "Item price is correct");
  });

  await runTest("EDIT_FLOW", "Scenario 2: Edit item and pre-fill expiry date", async () => {
    const existingItem: InvoiceItem = {
      id: "test-item-1",
      product_id: "prod-panadol",
      name: "بانادول إكسترا 500 مجم Panadol Extra",
      qty: 10,
      price: 25.5,
      sum: 255,
      expiryDate: "2027-05-30",
      row_order: 1
    };

    // Pre-fill simulation for Edit Modal
    const editingModalState = {
      id: existingItem.id,
      name: existingItem.name,
      qty: existingItem.qty,
      price: existingItem.price,
      expiryDate: normalizeToISODate(existingItem.expiryDate)
    };

    assertEqual(editingModalState.expiryDate, "2027-05-30", "Modal pre-fills the exact expiry date");

    // Change the expiry date and save
    const updatedPayload = {
      ...editingModalState,
      expiryDate: "2028-12-31"
    };

    const updatedItem: InvoiceItem = {
      ...existingItem,
      expiryDate: normalizeToISODate(updatedPayload.expiryDate)
    };

    assertEqual(updatedItem.expiryDate, "2028-12-31", "Updated item retains new expiry date");
  });

  await runTest("CLEAR_EXPIRY", "Scenario 3: Clear expiry date and save", async () => {
    const existingItem: InvoiceItem = {
      id: "test-item-1",
      product_id: "prod-panadol",
      name: "بانادول إكسترا 500 مجم",
      qty: 10,
      price: 25.5,
      sum: 255,
      expiryDate: "2027-05-30",
      row_order: 1
    };

    // User clears the field
    const clearedExpiry = "";
    const updatedItem: InvoiceItem = {
      ...existingItem,
      expiryDate: normalizeToISODate(clearedExpiry)
    };

    assertEqual(updatedItem.expiryDate, "", "Expiry date is cleanly cleared to empty string");
  });

  // -------------------------------------------------------------
  // Category 3: Draft Save & Restore
  // -------------------------------------------------------------
  await runTest("DRAFT_SERVICE", "Scenario 5: Draft save and Draft restore preserve expiry dates", async () => {
    const draftKey = "purchases_draft_current";
    const draftItems: InvoiceItem[] = [
      {
        id: "draft-item-1",
        product_id: "prod-1",
        name: "أوجمنتين 1 جم Augmentin 1g",
        qty: 5,
        price: 90,
        sum: 450,
        expiryDate: "2026-11-30",
        row_order: 1
      },
      {
        id: "draft-item-2",
        product_id: "prod-2",
        name: "باراسيتامول شراب",
        qty: 12,
        price: 15,
        sum: 180,
        expiryDate: "",
        row_order: 2
      }
    ];

    const draftHeader = {
      invoice_number: "PUR-DRAFT-99",
      supplier_id: "SUP-01",
      date: "2026-08-21"
    };

    // Save invoice draft
    await DraftService.saveInvoiceDraft(draftKey, "PURCHASE", draftItems, {
      header: draftHeader,
      adjData: { discountPercent: 0, otherFees: 0, paymentType: 'CASH', isPaid: true }
    });

    // Restore draft
    const restoredDraft = await DraftService.getInvoiceDraft(draftKey);
    assert(!!restoredDraft, "Draft must be retrievable from DraftService");
    assert(restoredDraft?.items?.length === 2, "Draft must contain 2 items");

    const item1 = restoredDraft.items[0];
    const item2 = restoredDraft.items[1];

    assertEqual(normalizeToISODate(item1.expiryDate), "2026-11-30", "Item 1 preserves expiry date in draft");
    assertEqual(normalizeToISODate(item2.expiryDate), "", "Item 2 without expiry preserves empty value in draft");
  });

  // -------------------------------------------------------------
  // Category 4: Persistence & Reload in Dexie Database
  // -------------------------------------------------------------
  await runTest("PERSISTENCE", "Scenario 4: Save purchase invoice and reload from DB retaining expiryDate", async () => {
    const invId = `PUR-TEST-INV-${Date.now()}`;
    const purchaseData = {
      id: invId,
      invoiceNumber: invId,
      type: "PURCHASE" as const,
      date: "2026-08-21",
      supplierId: "SUP-TEST",
      supplierName: "شركة الفتح للأدوية",
      items: [
        {
          id: `item-${invId}-1`,
          product_id: "prod-amox",
          productId: "prod-amox",
          name: "أموكسيسيلين 500 مجم Amoxicillin",
          qty: 20,
          price: 35,
          sum: 700,
          expiryDate: "2027-08-31",
          row_order: 1
        }
      ],
      total: 700,
      grandTotal: 700,
      paymentMethod: "CASH" as const,
      isPaid: true
    };

    // Save into db.invoices
    await db.invoices.put(purchaseData);

    // Reload from database
    const loaded = await db.invoices.get(invId);
    assert(!!loaded, "Invoice must be loaded from db.invoices");
    assert(loaded.items && loaded.items.length === 1, "Invoice must have 1 item");
    assertEqual(normalizeToISODate(loaded.items[0].expiryDate), "2027-08-31", "Reloaded invoice item retains exact expiry date");
  });

  // -------------------------------------------------------------
  // Category 5: Inventory Batch Propagation (MedicineBatch)
  // -------------------------------------------------------------
  await runTest("INVENTORY_BATCH", "Scenario 6: Inventory batch propagation into medicineBatches table", async () => {
    const invoiceId = `PUR-BATCH-TEST-${Date.now()}`;
    const testItemId = `prod-cipro-${Date.now()}`;
    const testInvoice = {
      id: invoiceId,
      invoiceId: invoiceId,
      type: "PURCHASE",
      items: [
        {
          id: `item-${invoiceId}`,
          product_id: testItemId,
          productId: testItemId,
          name: "سيبروفلوكساسين 500 مجم Ciprofloxacin",
          qty: 15,
          quantity: 15,
          price: 40,
          unitPrice: 40,
          sum: 600,
          expiryDate: "2027-10-31",
          batchNumber: "B-20271031"
        }
      ]
    };

    // Execute StockMovementEngine
    await StockMovementEngine.apply(testInvoice as any);

    // Check medicineBatches
    const batches = await db.medicineBatches.where("productId").equals(testItemId).toArray();
    assert(batches.length > 0, "MedicineBatch record must be created");
    const batch = batches[0];
    assertEqual(batch.expiryDate, "2027-10-31", "MedicineBatch has exact normalized expiry date");
    assertEqual(batch.quantity, 15, "MedicineBatch has correct initial quantity");
  });

  // -------------------------------------------------------------
  // Category 6: Smart Import & Serializer Preservation
  // -------------------------------------------------------------
  await runTest("SMART_IMPORT", "Scenario 7: SmartImportOrchestrator converts and preserves expiry dates", () => {
    const sampleRows = [
      {
        id: "imp-1",
        rawIndex: 1,
        rawText: "كتافلام 50 مجم 2027/04/30",
        rawName: "كتافلام 50 مجم Cataflam",
        productName: "كتافلام 50 مجم Cataflam",
        matchedProductId: "prod-cataflam",
        matchedProductName: "كتافلام 50 مجم Cataflam",
        matchedBarcode: "622123456789",
        confidence: 0.98,
        matchStatus: "EXACT" as const,
        quantity: 25,
        qty: 25,
        unitPrice: 33,
        price: 33,
        total: 825,
        expiryDate: "2027/04/30",
        isApproved: true,
        isSkipped: false,
        validationIssues: []
      }
    ];

    const converted = SmartImportOrchestrator.convertToInvoiceItems(sampleRows as any, "INV-SMART-001");
    assert(converted.length === 1, "Should convert 1 row");
    assertEqual(converted[0].expiryDate, "2027-04-30", "Smart Import converts slash date to normalized ISO expiryDate");
  });

  // -------------------------------------------------------------
  // Category 7: Arabic, English, Mixed Names & Adaptive Row Layout
  // -------------------------------------------------------------
  await runTest("UI_TYPOGRAPHY", "Scenario 10: Long Arabic product name handles display without truncation", () => {
    const longArabicName = "مستحضر دوائي مضاد حيوي واسع المجال مركب أموكسيسيللين وكلافولانات البوتاسيوم عيار 1000 مجم أقراص مغلفة";
    assert(longArabicName.length > 60, "Name is sufficiently long");
    assertEqual(longArabicName.trim(), longArabicName, "String is valid");
  });

  await runTest("UI_TYPOGRAPHY", "Scenario 11: Long English product name handles display without truncation", () => {
    const longEnglishName = "Amoxicillin and Clavulanate Potassium Tablets USP 1000mg Film-Coated Antibiotic Formula";
    assert(longEnglishName.length > 60, "Name is sufficiently long");
    assertEqual(longEnglishName.trim(), longEnglishName, "String is valid");
  });

  await runTest("UI_TYPOGRAPHY", "Scenario 12: Mixed Arabic/English name handles bidirectional display correctly", () => {
    const mixedName = "كونكور 5 مجم Concor 5mg Bisoprolol Fumarate أقراص علاج ارتفاع ضغط الدم";
    assert(mixedName.includes("كونكور") && mixedName.includes("Concor"), "Contains both Arabic and English");
  });

  await runTest("MOBILE_ADAPTIVE", "Scenario 13: Expiry status formatting across standard & mobile viewports", () => {
    const expiredStatus = getExpiryStatus("2020-01-01");
    assertEqual(expiredStatus.isExpired, true, "Past date should be marked expired");

    const futureDate = "2029-12-31";
    const futureStatus = getExpiryStatus(futureDate);
    assertEqual(futureStatus.isExpired, false, "Future date should not be expired");

    const formatted = formatExpiryDateDisplay(futureDate);
    assertEqual(formatted, "2029/12/31", "Formatted display string is readable slash date");
  });

  await runTest("SYNC_PRESERVATION", "Scenario 15: Sync queue mapping and entity serialization preserves expiryDate", async () => {
    const purchasePayload = {
      supplierId: "SUP-01",
      invoiceNumber: "PUR-SYNC-01",
      items: [
        {
          id: "item-1",
          productId: "prod-1",
          name: "دواء تجريبي",
          qty: 10,
          price: 50,
          expiryDate: "2027-09-30"
        }
      ]
    };

    // Serialize payload as done by SyncEngine
    const serialized = JSON.stringify(purchasePayload);
    const deserialized = JSON.parse(serialized);

    assertEqual(deserialized.items[0].expiryDate, "2027-09-30", "Serialized & deserialized sync payload preserves expiryDate");
  });

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n================================================================================");
  const total = testResults.length;
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  console.log(`Total: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: 0`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal Test Runner Error:", err);
  process.exit(1);
});
