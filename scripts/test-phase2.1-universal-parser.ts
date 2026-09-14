// scripts/test-phase2.1-universal-parser.ts
import { SourceDetector } from '../src/features/purchases/services/smartImport/sourceDetector';
import { SpreadsheetParser } from '../src/features/purchases/services/smartImport/spreadsheetParser';
import { DocxParserAdapter } from '../src/features/purchases/services/smartImport/parsers/DocxParserAdapter';
import { SpreadsheetParserAdapter } from '../src/features/purchases/services/smartImport/parsers/SpreadsheetParserAdapter';
import { PdfTextParserAdapter } from '../src/features/purchases/services/smartImport/parsers/PdfTextParserAdapter';
import { OcrImageParserAdapter } from '../src/features/purchases/services/smartImport/parsers/OcrImageParserAdapter';
import { ParserRegistry } from '../src/features/purchases/services/smartImport/parsers';
import { DataValidator } from '../src/features/purchases/services/smartImport/dataValidator';
import { ProductMatchingEngine } from '../src/features/purchases/services/smartImport/productMatchingEngine';
import { SmartImportOrchestrator } from '../src/features/purchases/services/smartImport/smartImportOrchestrator';
import { isValidExpiryDate } from '../src/utils/expiryUtils';
import JSZip from 'jszip';

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

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting PharmaFlow PRO Phase 2.1 Universal Parser Test Suite');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST GROUP 1: Source Detection & Security Gatekeeper
  // -------------------------------------------------------------
  console.log('📁 Group 1: Source Detection & Security Gatekeeper');

  const xlsxType = SourceDetector.detectSourceType('invoice.xlsx');
  assert(xlsxType === 'EXCEL', 'Detects .xlsx as EXCEL');

  const csvType = SourceDetector.detectSourceType('data.csv');
  assert(csvType === 'CSV', 'Detects .csv as CSV');

  const tsvType = SourceDetector.detectSourceType('export.tsv');
  assert(tsvType === 'CSV', 'Detects .tsv as CSV/delimited text');

  const docxType = SourceDetector.detectSourceType('supplier_invoice.docx');
  assert(docxType === 'DOCX', 'Detects .docx as DOCX');

  const pdfType = SourceDetector.detectSourceType('bill.pdf');
  assert(pdfType === 'PDF', 'Detects .pdf as PDF');

  const imgType = SourceDetector.detectSourceType('receipt.png');
  assert(imgType === 'IMAGE', 'Detects .png as IMAGE');

  const cameraType = SourceDetector.detectSourceType('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  assert(cameraType === 'IMAGE', 'Detects base64 image as IMAGE');

  // Security: Double Extension Rejection
  const doubleExtValidation = SourceDetector.validateFile('invoice.xlsx.exe');
  assert(!doubleExtValidation.isValid && doubleExtValidation.errorCode === 'DANGEROUS_FILE_TYPE', 'Blocks double executable extension (invoice.xlsx.exe)');

  const dangerousBat = SourceDetector.validateFile('script.pdf.bat');
  assert(!dangerousBat.isValid && dangerousBat.errorCode === 'DANGEROUS_FILE_TYPE', 'Blocks .bat script file disguised as PDF');

  // Empty File Check
  const emptyStrValidation = SourceDetector.validateFile('');
  assert(!emptyStrValidation.isValid && emptyStrValidation.errorCode === 'EMPTY_FILE', 'Rejects empty 0-byte file string');

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 2: Excel Serial Date Conversion & Timezone Safety
  // -------------------------------------------------------------
  console.log('📅 Group 2: Excel Serial Date Conversion & Timezone Safety');

  // Test standard 1900 system serial dates: 45292 -> 2024-01-01
  const d2024 = SpreadsheetParser.excelSerialDateToISO(45292, false);
  assert(d2024 === '2024-01-01', `Excel 1900 serial 45292 converts to 2024-01-01 (got ${d2024})`);

  // Test 44197 -> 2021-01-01
  const d2021 = SpreadsheetParser.excelSerialDateToISO(44197, false);
  assert(d2021 === '2021-01-01', `Excel 1900 serial 44197 converts to 2021-01-01 (got ${d2021})`);

  // Test 1904 Mac date system: serial 43830 is 2024-01-01
  const d1904 = SpreadsheetParser.excelSerialDateToISO(43830, true);
  assert(d1904 === '2024-01-01', `Excel 1904 Mac serial 43830 converts to 2024-01-01 (got ${d1904})`);

  // Test string with serial date number in cell
  const parseCellSerial = SpreadsheetParser.parseCellValueToDate(45292);
  assert(parseCellSerial === '2024-01-01', 'parseCellValueToDate handles number serial date');

  const parseCellString = SpreadsheetParser.parseCellValueToDate('2025/12/31');
  assert(parseCellString === '2025-12-31', 'parseCellValueToDate handles slash date string');

  const parseCellArabic = SpreadsheetParser.parseCellValueToDate('٢٠٢٦/٠٨/١٥');
  assert(parseCellArabic === '2026-08-15', 'parseCellValueToDate handles Arabic numeral date');

  // Expiry date verification
  assert(isValidExpiryDate('2026-12-31'), '2026-12-31 is valid expiry date');
  assert(!isValidExpiryDate('invalid-date'), 'invalid-date is rejected as expiry date');

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 3: DOCX Table Extraction with JSZip
  // -------------------------------------------------------------
  console.log('📄 Group 3: DOCX Table Extraction with JSZip');

  // Build an in-memory test DOCX ZIP file with standard w:tbl structures
  const testDocxZip = new JSZip();
  const sampleDocumentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>فاتورة مشتريات توريد أدوية</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>اسم الصنف</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>الكمية</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>سعر الوحدة</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>الإجمالي</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>الصلاحية</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>التشغيلة</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Panadol Extra 500mg</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>100</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>12.50</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>1250.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2026-10-01</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>BN-7788</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Amoxicillin 500mg Cap</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>50</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>24.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>1200.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2025-11-15</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>AMX-9901</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>الإجمالي العام</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2450.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  testDocxZip.file('word/document.xml', sampleDocumentXml);
  const docxUint8 = await testDocxZip.generateAsync({ type: 'uint8array' });
  const docxFile = new File([docxUint8], 'supplier_invoice.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const docxAdapter = new DocxParserAdapter();
  assert(docxAdapter.canParse(docxFile, 'DOCX'), 'DocxParserAdapter canParse returns true for .docx');

  const canonicalDoc = await docxAdapter.parse(docxFile, {
    tenantId: 'TENANT-01',
    branchId: 'WH-01'
  });

  assert(canonicalDoc.tables.length === 1, 'Extracted 1 table from DOCX');
  assert(canonicalDoc.tables[0].isPrimaryInvoiceTable, 'DOCX table flagged as primary invoice table');
  assert(canonicalDoc.tables[0].rows.length === 2, 'Filtered footer summary row and extracted 2 item rows');
  assert(canonicalDoc.tables[0].headers.includes('اسم الصنف'), 'Headers contain Arabic "اسم الصنف"');
  assert(canonicalDoc.metadata.extractionMethod === 'DOCX_TABLE', 'Extraction method is DOCX_TABLE');

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 4: Universal Parser Registry & Multi-Adapter
  // -------------------------------------------------------------
  console.log('⚙️ Group 4: Universal Parser Registry & Multi-Adapter');

  const resolvedDocxParser = ParserRegistry.getParser(docxFile, 'DOCX');
  assert(resolvedDocxParser instanceof DocxParserAdapter, 'ParserRegistry resolves DocxParserAdapter for DOCX');

  const csvParser = ParserRegistry.getParser('data.csv', 'CSV');
  assert(csvParser instanceof SpreadsheetParserAdapter, 'ParserRegistry resolves SpreadsheetParserAdapter for CSV');

  const pdfParser = ParserRegistry.getParser('doc.pdf', 'PDF');
  assert(pdfParser instanceof PdfTextParserAdapter, 'ParserRegistry resolves PdfTextParserAdapter for PDF');

  const imgParser = ParserRegistry.getParser('receipt.jpg', 'IMAGE');
  assert(imgParser instanceof OcrImageParserAdapter, 'ParserRegistry resolves OcrImageParserAdapter for IMAGE');

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 5: Spreadsheet & CSV Parsing with Formula Sanitization
  // -------------------------------------------------------------
  console.log('🛡️ Group 5: Spreadsheet Sanitization & DDE Formula Injection Immunity');

  // Dangerous formula cells
  const formulaCell1 = SpreadsheetParser.sanitizeCellValue('=1+1');
  assert(formulaCell1 === '1+1', 'Strips leading = from formula string');

  const protoCell = SpreadsheetParser.sanitizeCellValue('__proto__');
  assert(protoCell === '', 'Blocks prototype pollution keyword (__proto__)');

  // Test CSV text parser
  const csvContent = `الصنف,الكمية,سعر الشراء,تاريخ الانتهاء
Cataflam 50mg,20,15.50,2026-05-01
Augmentin 1g,10,35.00,2025-12-31
المجموع,30,50.50,`;

  const csvGrid = SpreadsheetParser.parseCSVText(csvContent);
  assert(csvGrid.length === 4, 'CSV parser correctly parses 4 lines');

  const canonicalSpreadsheetDoc = SpreadsheetParser.convertGridToCanonicalDocument(csvGrid, {
    type: 'CSV',
    fileName: 'test.csv',
    fileSize: csvContent.length
  });

  assert(canonicalSpreadsheetDoc.tables.length === 1, 'Canonical Document has 1 table');
  assert(canonicalSpreadsheetDoc.tables[0].rows.length === 2, 'Summary row filtered out, 2 item rows remain');

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 6: Data Validator, Expiry & Product Matching
  // -------------------------------------------------------------
  console.log('🔍 Group 6: Data Validator, Expiry Normalization & Scoped Matching');

  const seenMap = new Map<string, number>();
  const row1 = DataValidator.validateRow({
    productName: 'Panadol Extra',
    quantity: 10,
    unitPrice: 15,
    total: 150,
    expiryDate: '2027-01-01'
  }, 1, seenMap);

  assert(row1.status === 'VALID', 'Row 1 is VALID');
  assert(row1.expiryDate === '2027-01-01', 'Expiry date normalized');

  // Row with math mismatch
  const rowMismatch = DataValidator.validateRow({
    productName: 'Aspirin 100mg',
    quantity: 10,
    unitPrice: 10,
    total: 500 // mismatch: 10 x 10 = 100 != 500
  }, 2, seenMap);

  assert(rowMismatch.status === 'PRICE_TOTAL_MISMATCH', 'Detected PRICE_TOTAL_MISMATCH');

  // 6-level matching hierarchy
  const mockProducts = [
    { id: 'PROD-01', name: 'Panadol Extra Tab', barcode: '628100123456', price: 15 }
  ];

  const matched = ProductMatchingEngine.matchItem(row1, mockProducts as any);
  assert(matched !== null && (matched.matchType === 'FUZZY' || matched.matchType === 'NORMALIZED'), 'Matched Panadol Extra with catalog');

  const enrichedRows = ProductMatchingEngine.matchAllRows([row1], mockProducts as any);
  assert(enrichedRows[0].matchedProductId === 'PROD-01', 'matchAllRows correctly enriches matchedProductId');

  console.log('');

  // -------------------------------------------------------------
  // TEST GROUP 7: End-to-End SmartImportOrchestrator Pipeline
  // -------------------------------------------------------------
  console.log('🚀 Group 7: End-to-End SmartImportOrchestrator Pipeline');

  const csvFile = new File([csvContent], 'invoice_test.csv', { type: 'text/csv' });
  const analysisResult = await SmartImportOrchestrator.analyzeInvoice(csvFile, {
    tenantId: 'TENANT-DEMO',
    branchId: 'WH-MAIN'
  });

  assert(analysisResult.sourceType === 'CSV', 'Analysis Result sourceType is CSV');
  assert(analysisResult.rows.length === 2, 'Extracted 2 valid rows in analysis result');
  assert(analysisResult.summary.validRowsCount >= 1, 'Summary has valid rows count');
  assert(analysisResult.metadata.tenantId === 'TENANT-DEMO', 'Tenant isolation preserved');

  // Test DOCX End-to-End in Orchestrator
  const docxAnalysis = await SmartImportOrchestrator.analyzeInvoice(docxFile, {
    tenantId: 'TENANT-DEMO',
    branchId: 'WH-MAIN'
  });

  assert(docxAnalysis.sourceType === 'DOCX', 'DOCX analyzed with sourceType DOCX');
  assert(docxAnalysis.rows.length === 2, 'Extracted 2 rows from Word docx');

  // Conversion to InvoiceItem[]
  const invoiceItems = SmartImportOrchestrator.convertToInvoiceItems(docxAnalysis.rows, 'INV-2026-001');
  assert(invoiceItems.length === 2, 'Converted to 2 PharmaFlow standard InvoiceItem objects');
  assert(invoiceItems[0].parent_id === 'INV-2026-001', 'Invoice items have correct parent invoice number');

  console.log('\n================================================================');
  console.log(`📊 Phase 2.1 Test Suite Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running Phase 2.1 test suite:', err);
  process.exit(1);
});
