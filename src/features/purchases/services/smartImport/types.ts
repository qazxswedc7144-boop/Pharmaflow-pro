// src/features/purchases/services/smartImport/types.ts
/**
 * Types & Data Contracts for PharmaFlow Enterprise Smart Purchase Import Engine
 */

export type ImportSourceType = 
  | 'EXCEL' 
  | 'CSV' 
  | 'TSV'
  | 'TXT'
  | 'DOCX'
  | 'PDF'
  | 'PDF_TEXT' 
  | 'PDF_SCANNED' 
  | 'IMAGE' 
  | 'CAMERA' 
  | 'UNKNOWN';

export type ExtractionMethod = 
  | 'SPREADSHEET' 
  | 'DOCX_TABLE' 
  | 'PDF_TEXT' 
  | 'OCR' 
  | 'AI_DOCUMENT';

export interface CanonicalImportRawRow {
  sourceRowIndex: number;
  cells: Record<string, unknown>;
  rawCells?: unknown[];
  sourceReference?: {
    page?: number;
    sheet?: string;
    table?: number;
    row?: number;
  };
}

export interface CanonicalImportTable {
  id: string;
  sourceIndex: number;
  name?: string;
  headers: string[];
  rows: CanonicalImportRawRow[];
  confidence?: number;
  isPrimaryInvoiceTable: boolean;
}

export interface ImportWarning {
  code: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  rowIndex?: number;
  columnName?: string;
}

export interface ImportDiagnostic {
  code: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  sourceReference?: {
    page?: number;
    sheet?: string;
    table?: number;
    row?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface CanonicalImportDocument {
  id: string;
  source: {
    type: ImportSourceType;
    fileName?: string;
    mimeType?: string;
    size?: number;
    hash?: string;
    pageCount?: number;
    sheetCount?: number;
    tableCount?: number;
  };
  metadata: {
    detectedLanguage?: string;
    extractionMethod: ExtractionMethod;
    extractedAt: string;
    parserVersion: string;
    confidence?: number;
  };
  documentFields: {
    supplierName?: string;
    supplierCode?: string;
    supplierPhone?: string;
    supplierTaxNumber?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    currency?: string;
    subtotal?: number;
    discount?: number;
    tax?: number;
    total?: number;
    notes?: string;
  };
  tables: CanonicalImportTable[];
  warnings: ImportWarning[];
  diagnostics: ImportDiagnostic[];
}

export interface ImportParseContext {
  tenantId: string;
  branchId: string;
  userId?: string;
  onProgress?: (percent: number, message: string) => void;
  signal?: AbortSignal;
}

export interface ImportSourceParser {
  canParse(file: File | string, type: ImportSourceType): boolean;
  parse(file: File | string, context: ImportParseContext): Promise<CanonicalImportDocument>;
}

export type TargetField = 
  | 'productName' 
  | 'quantity' 
  | 'unitPrice' 
  | 'total' 
  | 'batchNumber' 
  | 'expiryDate' 
  | 'discount' 
  | 'tax' 
  | 'barcode' 
  | 'productCode' 
  | 'bonusQty' 
  | 'unit' 
  | 'notes' 
  | 'ignore';

export interface ColumnDefinition {
  index: number;
  rawHeader: string;
  normalizedHeader: string;
  mappedField: TargetField;
  confidence: number; // 0 to 100
  isAutoMapped: boolean;
  sampleValues: string[];
}

export type RowValidationStatus = 
  | 'VALID'
  | 'WARNING'
  | 'INVALID_PRICE'
  | 'INVALID_QUANTITY'
  | 'MISSING_PRODUCT_NAME'
  | 'PRICE_TOTAL_MISMATCH'
  | 'INVALID_EXPIRY'
  | 'DUPLICATE_CANDIDATE'
  | 'NEW_PRODUCT_CANDIDATE'
  | 'FOOTER_IGNORED'
  | 'EMPTY_ROW';

export interface ExtractedImportRow {
  rowNumber: number;
  rawCells: Record<string, string>;
  productName: string;
  quantity: number;
  unitPrice: number;
  total?: number;
  expectedTotal?: number;
  barcode?: string;
  productCode?: string;
  batchNumber?: string;
  expiryDate?: string;
  discountPercent?: number;
  tax?: number;
  bonusQty?: number;
  unit?: string;
  notes?: string;
  
  // Intelligence & Matching
  matchedProductId?: string;
  matchedProductName?: string;
  matchType?: 'EXACT' | 'NORMALIZED' | 'BARCODE' | 'CODE' | 'ALIAS' | 'FUZZY' | 'NONE';
  matchScore?: number;
  isNewProductCandidate?: boolean;
  
  // Validation
  status: RowValidationStatus;
  validationIssues: string[];
  isDuplicate?: boolean;
  duplicateReason?: string;
  isSkipped?: boolean;
}

export interface ImportSummary {
  totalRowsDetected: number;
  validRowsCount: number;
  reviewRequiredCount: number;
  skippedRowsCount: number;
  newProductCandidatesCount: number;
  duplicateCandidatesCount: number;
  totalInvoiceAmount: number;
  detectedSupplier?: string;
  detectedInvoiceNumber?: string;
  detectedDate?: string;
}

export interface ImportAnalysisResult {
  sourceType: ImportSourceType;
  fileName: string;
  fileSize: number;
  detectedColumns: ColumnDefinition[];
  headerRowIndex: number;
  rows: ExtractedImportRow[];
  summary: ImportSummary;
  rawText?: string;
  metadata: {
    tenantId: string;
    branchId: string;
    userId: string;
    analyzedAt: string;
    processingTimeMs: number;
  };
}

export interface SmartImportProgressCallback {
  (stage: 'DETECTING_SOURCE' | 'PARSING_DOCUMENT' | 'DETECTING_COLUMNS' | 'EXTRACTING_ROWS' | 'MATCHING_PRODUCTS' | 'VALIDATING_DATA' | 'READY_FOR_REVIEW', progressPercent: number, message: string): void;
}
