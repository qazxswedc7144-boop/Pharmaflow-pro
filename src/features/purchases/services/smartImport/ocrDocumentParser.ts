// src/features/purchases/services/smartImport/ocrDocumentParser.ts
import { ExtractedImportRow } from './types';

export class OCRDocumentParser {
  /**
   * Processes image or PDF invoice via online/local OCR engine and maps results to ExtractedImportRow array
   */
  static async parseDocument(file: File | string): Promise<{
    rows: Partial<ExtractedImportRow>[];
    supplier?: string;
    invoiceNumber?: string;
    date?: string;
    rawText?: string;
  }> {
    const { processInvoice: processInvoiceData } = await import('@/services/data/smartImportEngine');
    const parsed = await processInvoiceData(file);

    const rows: Partial<ExtractedImportRow>[] = (parsed.items || []).map((item, idx) => {
      const q = Number(item.quantity || 1);
      const p = Number(item.price || 0);
      const disc = Number(item.discountPercent || 0);
      const calculatedTotal = disc > 0 ? (q * p) * (1 - disc / 100) : (q * p);

      return {
        rowNumber: idx + 1,
        productName: item.name || '',
        quantity: q > 0 ? q : 1,
        unitPrice: p,
        total: calculatedTotal,
        barcode: item.barcode,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        discountPercent: disc,
        bonusQty: item.bonusQty,
        unit: item.unit,
        notes: item.notes
      };
    });

    return {
      rows,
      supplier: parsed.supplier,
      invoiceNumber: parsed.invoice_number,
      date: parsed.date,
      rawText: parsed.notes
    };
  }
}
