import { processInvoice as processInvoiceData } from '@/services/data/smartImportEngine';
import { ParsedInvoice } from './aiInvoiceParser';

export type { ParsedInvoice };

/**
 * Smart Import Engine - High accuracy OCR + Excel + PDF + AI multi-column parsing pipeline
 */
export async function processInvoice(file: File | string): Promise<ParsedInvoice> {
  return await processInvoiceData(file);
}
