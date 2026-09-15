import {
  normalizeArabicDigits,
  normalizeArabicText,
  parseNumber,
  extractDate,
  extractInvoiceNumber,
  extractSupplier,
  looksLikeHeader,
  looksLikeFooter,
  parseRow,
  extractRowsFromOCRText
} from '../src/features/purchases/services/smartImport/ocrDocumentParser';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('======================================================');
console.log('🧪 Testing OCR Document Parser Improvements (OCR-FIX 2/5)');
console.log('======================================================');

// 1. Digit and Text Normalization
console.log('\n▶ Group 1: Digit & Text Normalization');
const easternDigits = '١٢٣٤٥٦٧٨٩٠';
assert(normalizeArabicDigits(easternDigits) === '1234567890', 'Converts Eastern Arabic digits');
const persianDigits = '۱۲۳۴۵۶۷۸۹۰';
assert(normalizeArabicDigits(persianDigits) === '1234567890', 'Converts Persian digits');
assert(normalizeArabicDigits('١٥٫٥٠') === '15.50', 'Converts Arabic decimal separator');
assert(normalizeArabicText('أَحْمَدْ') === 'احمد', 'Removes tashkeel and normalizes alef');
assert(normalizeArabicText('صيدلية الشّفاء') === 'صيدليه الشفاء', 'Normalizes teh marbuta');

// 2. Number Parsing
console.log('\n▶ Group 2: Number Parsing');
assert(parseNumber('1,250.50') === 1250.5, 'Parses standard 1,250.50');
assert(parseNumber('1.250,50') === 1250.5, 'Parses European 1.250,50');
assert(parseNumber('١٥٫٥٠') === 15.5, 'Parses Arabic decimal 15.50');
assert(parseNumber('25 ر.س') === 25, 'Strips currency SAR/ر.س');
assert(parseNumber('(50.00)') === -50, 'Handles accounting parentheses');

// 3. Date Extraction
console.log('\n▶ Group 3: Date Extraction');
assert(extractDate('التاريخ: 2026/05/12') === '2026-05-12', 'Extracts YYYY/MM/DD with label');
assert(extractDate('Date: 15-08-2025') === '2025-08-15', 'Extracts DD-MM-YYYY with English label');
assert(extractDate('فاتورة بتاريخ ١٢-٠٤-٢٠٢٦') === '2026-04-12', 'Extracts date with Eastern numerals');
assert(extractDate('2026.11.30') === '2026-11-30', 'Extracts standalone YYYY.MM.DD');

// 4. Invoice Number Extraction
console.log('\n▶ Group 4: Invoice Number Extraction');
assert(extractInvoiceNumber('رقم الفاتورة: INV-2026-004') === 'INV-2026-004', 'Extracts with label رقم الفاتورة');
assert(extractInvoiceNumber('فاتورة رقم 98765') === '98765', 'Extracts with label فاتورة رقم');
assert(extractInvoiceNumber('Invoice #: B-9081') === 'B-9081', 'Extracts Invoice #: B-9081');
const nextLineInvoice = 'رقم الفاتورة:\n45201\nتاريخ: 2026/01/01';
assert(extractInvoiceNumber(nextLineInvoice) === '45201', 'Extracts invoice number from next line');

// 5. Supplier Extraction
console.log('\n▶ Group 5: Supplier Extraction');
assert(
  extractSupplier('المورد: شركة الشرق الأوسط للأدوية') === 'شركة الشرق الأوسط للأدوية',
  'Extracts with explicit label المورد'
);
const headerSupplierText = `شركة المتحدة لتوزيع الأدوية والمستلزمات الطبية
فاتورة مبيعات ضريبية
رقم الفاتورة: 10293
التاريخ: 2026/05/01`;
assert(
  extractSupplier(headerSupplierText) === 'شركة المتحدة لتوزيع الأدوية والمستلزمات الطبية',
  'Detects company name in header without explicit "المورد" label'
);

// 6. Header and Footer Detection
console.log('\n▶ Group 6: Table Header & Footer Detection');
assert(looksLikeHeader('اسم الصنف | الكمية | السعر | الإجمالي'), 'Detects Arabic table header');
assert(looksLikeHeader('Item | Description | Qty | Unit Price | Total'), 'Detects English table header');
assert(!looksLikeHeader('شركة الأدوية المتحدة'), 'Does not falsely classify company header as table header');
assert(looksLikeFooter('الإجمالي العام: 1,500.00 ر.س'), 'Detects Arabic footer');
assert(looksLikeFooter('Grand Total: 2,400.00'), 'Detects English footer');

// 7. Pharmacy Row Parsing (Preserving Drug Strengths & Row Numbers)
console.log('\n▶ Group 7: Pharmacy Row Parsing');
// Case A: Drug strength 500mg must NOT be captured as quantity!
const rowA = parseRow('Panadol Extra 500mg 10 15.50 155.00');
assert(rowA !== null, 'Parses Panadol Extra row');
assert(rowA?.productName.includes('500mg') === true, 'Preserves 500mg inside product name');
assert(rowA?.quantity === 10, 'Correctly identifies 10 as quantity');
assert(rowA?.unitPrice === 15.5, 'Correctly identifies 15.5 as unit price');
assert(rowA?.total === 155, 'Correctly identifies 155 as total');

// Case B: Row starting with sequence number (1, 2, 3...)
const rowB = parseRow('1 | Amoxil 250mg/5ml Susp | 5 | 20.00 | 100.00');
assert(rowB !== null, 'Parses row starting with sequence number 1');
assert(rowB?.productName.includes('Amoxil') === true, 'Extracts Amoxil without sequence number in name');
assert(rowB?.quantity === 5, 'Extracts quantity 5 (not 1)');
assert(rowB?.unitPrice === 20, 'Extracts unit price 20');

// Case C: Arabic row with Eastern numerals
const rowC = parseRow('١ | أوجمنتين ٦٢٥ مجم | ١٠ | ٤٥٫٠٠ | ٤٥٠٫٠٠');
assert(rowC !== null, 'Parses Arabic row with Eastern numerals');
assert(rowC?.quantity === 10, 'Parses Eastern numeral quantity ١٠ as 10');
assert(rowC?.unitPrice === 45, 'Parses Eastern numeral price ٤٥ as 45');
assert(rowC?.total === 450, 'Parses Eastern numeral total ٤٥٠ as 450');

// Case D: Missing price or quantity - must NOT be dropped!
const rowD = parseRow('Cataflam 50mg Tablets 20');
assert(rowD !== null, 'Does not drop row when price is missing');
assert(rowD?.productName.includes('Cataflam 50mg') === true, 'Extracts Cataflam 50mg');
assert(rowD?.status === 'WARNING', 'Flags row as WARNING for human review');

// 8. Full Document Extraction
console.log('\n▶ Group 8: Full Document Extraction');
const sampleInvoice = `
مستودع الأدوية الحديث
فاتورة مبيعات ضريبية
رقم الفاتورة: 2026/891
التاريخ: 2026/04/10

م | اسم الصنف | الكمية | السعر | الإجمالي
1 | Panadol Advance 500mg | 20 | 12.50 | 250.00
2 | Brufen 400mg 30 Tab | 15 | 18.00 | 270.00
3 | Augmentin 1g 14 Tab | 10 | 55.00 | 550.00
4 | Omega 3 Fish Oil 1000mg | 5 | 80.00 | 400.00

الإجمالي العام: 1470.00
ضريبة القيمة المضافة: 220.50
صافي الفاتورة: 1690.50
`;

const rows = extractRowsFromOCRText(sampleInvoice);
assert(rows.length === 4, `Extracted all 4 items (got ${rows.length})`);
assert(rows[0].productName.includes('Panadol Advance 500mg'), 'Row 1 has correct product name');
assert(rows[0].quantity === 20, 'Row 1 has correct quantity 20');
assert(rows[0].unitPrice === 12.5, 'Row 1 has correct price 12.50');
assert(rows[3].productName.includes('Omega 3 Fish Oil 1000mg'), 'Row 4 preserves 1000mg in name');
assert(rows[3].quantity === 5, 'Row 4 has quantity 5');

// 9. Token De-Gluing & Glued Codes (OCR-FIX 5/5 Part 2/3)
console.log('\n▶ Group 9: Token De-Gluing & Glued Codes');

// Case 9.1: Cataflam50mg glued
const gluedRow1 = parseRow('Cataflam50mg 20 4.50 90.00');
assert(gluedRow1 !== null, 'Parses Cataflam50mg row');
assert(gluedRow1?.productName === 'Cataflam 50mg', `De-glues Cataflam50mg -> Cataflam 50mg (got: "${gluedRow1?.productName}")`);
assert(gluedRow1?.quantity === 20, 'Quantity is 20');
assert(gluedRow1?.unitPrice === 4.5, 'Unit price is 4.50');
assert(gluedRow1?.total === 90, 'Total is 90.00');

// Case 9.2: Augmentin1g glued
const gluedRow2 = parseRow('Augmentin1g 10 5 50');
assert(gluedRow2 !== null, 'Parses Augmentin1g row');
assert(gluedRow2?.productName === 'Augmentin 1g', `De-glues Augmentin1g -> Augmentin 1g (got: "${gluedRow2?.productName}")`);
assert(gluedRow2?.quantity === 10, 'Quantity is 10');
assert(gluedRow2?.unitPrice === 5, 'Unit price is 5');
assert(gluedRow2?.total === 50, 'Total is 50');

// Case 9.3: 10042Panadol glued product code
const gluedRow3 = parseRow('10042Panadol 10 15 150');
assert(gluedRow3 !== null, 'Parses 10042Panadol row');
assert(gluedRow3?.productCode === '10042', `Extracts productCode 10042 (got: "${gluedRow3?.productCode}")`);
assert(gluedRow3?.productName === 'Panadol', `Extracts clean productName Panadol (got: "${gluedRow3?.productName}")`);
assert(gluedRow3?.quantity === 10, 'Quantity is 10');
assert(gluedRow3?.unitPrice === 15, 'Unit price is 15');
assert(gluedRow3?.total === 150, 'Total is 150');

// Case 9.4: PanadolExtra500mg CamelCase and Strength
const gluedRow4 = parseRow('PanadolExtra500mg 15 12.00 180.00');
assert(gluedRow4 !== null, 'Parses PanadolExtra500mg row');
assert(gluedRow4?.productName === 'Panadol Extra 500mg', `De-glues PanadolExtra500mg -> Panadol Extra 500mg (got: "${gluedRow4?.productName}")`);
assert(gluedRow4?.quantity === 15, 'Quantity is 15');
assert(gluedRow4?.unitPrice === 12, 'Unit price is 12.00');
assert(gluedRow4?.total === 180, 'Total is 180.00');

// 10. Multi-Number Resolution (Bonus, Discounts, Positional weighting)
console.log('\n▶ Group 10: Multi-Number Resolution (Bonus & Discounts)');

// Case 10.1: Row with Quantity + Bonus + Price + Total
const bonusRow = parseRow('Panadol Extra 500mg 10 2 15.00 150.00');
assert(bonusRow !== null, 'Parses row with bonus quantity');
assert(bonusRow?.quantity === 10, `Extracts purchased quantity 10 (got: ${bonusRow?.quantity})`);
assert(bonusRow?.bonusQty === 2, `Extracts bonus quantity 2 (got: ${bonusRow?.bonusQty})`);
assert(bonusRow?.unitPrice === 15, 'Extracts unit price 15.00');
assert(bonusRow?.total === 150, 'Extracts total 150.00');

// Case 10.2: Row with Quantity + Price + Discount % + Total
const discountRow = parseRow('Amoxil 500mg 20 10.00 10 180.00');
assert(discountRow !== null, 'Parses row with discount percentage');
assert(discountRow?.quantity === 20, `Extracts quantity 20 (got: ${discountRow?.quantity})`);
assert(discountRow?.unitPrice === 10, 'Extracts unit price 10.00');
assert(discountRow?.discountPercent === 10, `Extracts discount 10% (got: ${discountRow?.discountPercent})`);
assert(discountRow?.total === 180, 'Extracts net total 180.00');

// 11. Multi-Page Document & Repeated Header Filtering
console.log('\n▶ Group 11: Multi-Page Document & Repeated Header Filtering');
const multiPageInvoice = `
شركة القدس للأدوية
فاتورة مبيعات
رقم الفاتورة: 77889
التاريخ: 2026/05/12

م | اسم الصنف | الكمية | السعر | الإجمالي
1 | Panadol Advance 500mg | 10 | 15.00 | 150.00
المجموع المنقول: 150.00
صفحة 1 من 2

شركة القدس للأدوية
فاتورة مبيعات
رقم الفاتورة: 77889
التاريخ: 2026/05/12

م | اسم الصنف | الكمية | السعر | الإجمالي
2 | Augmentin 1g 14 Tab | 5 | 50.00 | 250.00
المجموع الكلي: 400.00
صفحة 2 من 2
`;

const multiPageRows = extractRowsFromOCRText(multiPageInvoice);
assert(multiPageRows.length === 2, `Extracted exactly 2 product rows across pages (got: ${multiPageRows.length})`);
assert(multiPageRows[0].productName.includes('Panadol Advance 500mg'), 'Page 1 item extracted correctly');
assert(multiPageRows[0].quantity === 10, 'Page 1 quantity correct');
assert(multiPageRows[1].productName.includes('Augmentin 1g 14 Tab'), 'Page 2 item extracted correctly without repeated header corruption');
assert(multiPageRows[1].quantity === 5, 'Page 2 quantity correct');

console.log('\n======================================================');
console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
