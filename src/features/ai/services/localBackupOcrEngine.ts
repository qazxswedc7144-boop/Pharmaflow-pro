import { ParsedInvoice } from './aiInvoiceParser';

/**
 * Local Backup OCR Engine (محرك الاستخراج المحلي الآمن)
 * Performs safe, non-hallucinating local parsing without fabricating fake medicines,
 * fake invoice numbers, or mock data. If data cannot be extracted, it returns empty results
 * with a human-review notice.
 */
export async function parseInvoiceLocally(file: File | string): Promise<ParsedInvoice> {
  console.log("🕵️ Utilizing Safe Local Extraction Engine (Zero Mock Data Policy)...");

  let fileName = "document";
  let rawText = "";

  if (file instanceof File) {
    fileName = file.name;
    try {
      if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
        rawText = await file.text();
      }
    } catch {
      // Binary file or unreadable as plain text
    }
  } else if (typeof file === 'string') {
    if (file.startsWith('data:')) {
      fileName = "scanned_document.png";
    } else {
      rawText = file;
    }
  }

  // Attempt deterministic plain text line extraction only if real text content is present
  const extractedItems: Array<{ name: string; quantity: number; price: number }> = [];

  if (rawText && rawText.trim().length > 10) {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Check if line matches tab or pipe or comma separated row: [name, qty, price]
      const parts = line.split(/[,\t|]/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        const namePart = parts[0] || '';
        const potentialQty = Number(parts[1]);
        const potentialPrice = Number(parts[2]);
        if (namePart.length >= 2 && !isNaN(potentialQty) && potentialQty > 0 && !isNaN(potentialPrice) && potentialPrice >= 0) {
          extractedItems.push({
            name: namePart,
            quantity: potentialQty,
            price: potentialPrice
          });
        }
      }
    }
  }

  const reviewNotice = extractedItems.length > 0
    ? "⚠️ تم استخراج البيانات محلياً من النص الصريح؛ يرجى تدقيق ومراجعة الأصناف والأسعار."
    : "⚠️ تعذر التعرف الآلي على تفاصيل الفاتورة بدون خادم الذكاء الاصطناعي. لم يتم اختلاق أي بيانات وهمية، يرجى إدخال البيانات يدوياً.";

  return {
    type: 'cash',
    supplier: '',
    invoice_number: '',
    date: new Date().toISOString().split('T')[0],
    notes: `[محرك الاستخراج المحلي الآمن] الملف: ${fileName}. ${reviewNotice}`,
    items: extractedItems,
    status: 'Draft',
    warning: reviewNotice
  };
}

