// src/services/data/smartImportEngine.ts
import { extractTextFromImage } from '@features/ai/services/ocrService';
import { normalizeArabic, cleanInvoiceText } from '@features/ai/services/arabicProcessor';
import { parseInvoice, ParsedInvoice } from '@features/ai/services/aiInvoiceParser';
import { configurationService } from '@/services/config/configurationService';
import { getOCRCache, saveOCRCache } from '@features/ai/services/ocrCache';
import { applyLearning } from '@features/ai/services/learningService';
import * as pdfjsLib from 'pdfjs-dist';
import readXlsxFile from 'read-excel-file/browser';

// Safe Worker Configuration for PDF.js
if (typeof window !== 'undefined' && 'Worker' in window) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn("PDF.js worker initialization warning:", e);
  }
}

const MAX_EXCEL_FILE_SIZE = 15 * 1024 * 1024;
const MAX_PDF_FILE_SIZE = 25 * 1024 * 1024;
const MAX_TOTAL_ROWS = 5000;

function sanitizeCellValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    try {
      return val.toISOString().split('T')[0] || '';
    } catch {
      return '';
    }
  }
  let str = String(val).trim();
  
  if (/^[=+\-@\t\r]/.test(str) && isNaN(Number(str))) {
    str = str.replace(/^[=+\-@\t\r]+/, '');
  }

  if (str === '__proto__' || str === 'constructor' || str === 'prototype') {
    return '';
  }

  return str;
}

function parseSafeCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  const lines = csvText.split(/\r?\n/);
  
  for (const line of lines) {
    if (!line.trim()) continue;
    if (rows.length >= MAX_TOTAL_ROWS) break;

    const row: string[] = [];
    let insideQuotes = false;
    let currentCell = '';
    const delimiter = line.includes('\t') ? '\t' : (line.includes(';') && !line.includes(',') ? ';' : ',');

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        row.push(sanitizeCellValue(currentCell));
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    row.push(sanitizeCellValue(currentCell));
    if (row.length > 0) {
      rows.push(row);
    }
  }
  return rows;
}

async function extractDataFromExcelOrCSV(file: File): Promise<{ text: string; structuredItems?: any[] }> {
  if (file.size > MAX_EXCEL_FILE_SIZE) {
    throw new Error(`حجم الملف يتجاوز الحد الأقصى المسموح به (${MAX_EXCEL_FILE_SIZE / (1024 * 1024)} ميجابايت).`);
  }

  const fileName = file.name.toLowerCase();
  let rows: string[][] = [];

  if (fileName.endsWith('.csv') || file.type.includes('csv')) {
    const textContent = await file.text();
    rows = parseSafeCSV(textContent);
  } else {
    try {
      const rawRows = await readXlsxFile(file);
      if (!rawRows || (rawRows as any[]).length === 0) {
        throw new Error('ملف الاكسل فارغ أو لا يحتوي على بيانات صالحة.');
      }
      rows = (rawRows as any[]).slice(0, MAX_TOTAL_ROWS).map((row: any) => 
        (Array.isArray(row) ? row : []).map((cell: any) => sanitizeCellValue(cell))
      );
    } catch (parseErr: any) {
      try {
        const textContent = await file.text();
        rows = parseSafeCSV(textContent);
      } catch {
        throw new Error(`فشل تحليل ملف الاكسل: ${parseErr.message || 'تنسيق الملف غير مدعوم'}`);
      }
    }
  }

  if (!rows || rows.length === 0) {
    throw new Error('ملف الاكسل فارغ أو لا يحتوي على بيانات صالحة.');
  }

  const nameKeywords = ['صنف', 'دواء', 'اسم', 'مادة', 'بيان', 'وصف', 'مستحضر', 'item', 'product', 'description', 'name', 'article'];
  const qtyKeywords = ['كمية', 'كميه', 'عدد', 'مشتراه', 'مشتريات', 'qty', 'quantity', 'count', 'units'];
  const priceKeywords = ['سعر', 'تكلفة', 'تكلفه', 'شراء', 'وحدة', 'فاتورة', 'price', 'cost', 'unit price', 'rate'];
  const expiryKeywords = ['صلاحية', 'صلاحيه', 'انتهاء', 'تاريخ', 'exp', 'expiry', 'expire'];
  const barcodeKeywords = ['باركود', 'كود', 'رمز', 'code', 'barcode', 'gtin', 'upc'];
  const discountKeywords = ['خصم', 'نسبة', 'تخفيض', 'disc', 'discount'];
  const bonusKeywords = ['بونص', 'مجاني', 'مجانا', 'هدية', 'bonus', 'free'];
  const batchKeywords = ['تشغيلة', 'تشغيله', 'باتش', 'وجبة', 'شحنة', 'batch', 'lot'];

  let headerRowIndex = -1;
  const colIndices = {
    name: -1,
    barcode: -1,
    quantity: -1,
    price: -1,
    expiryDate: -1,
    discountPercent: -1,
    bonusQty: -1,
    batchNumber: -1
  };

  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;

    let matchedCount = 0;
    row.forEach((cell) => {
      const val = String(cell).toLowerCase().trim();
      if (!val) return;
      if (nameKeywords.some(k => val.includes(k))) matchedCount++;
      if (qtyKeywords.some(k => val.includes(k))) matchedCount++;
      if (priceKeywords.some(k => val.includes(k))) matchedCount++;
    });

    if (matchedCount >= 2) {
      headerRowIndex = r;
      row.forEach((cell, colIdx) => {
        const val = String(cell).toLowerCase().trim();
        if (!val) return;

        if (colIndices.name === -1 && nameKeywords.some(k => val.includes(k))) colIndices.name = colIdx;
        else if (colIndices.quantity === -1 && qtyKeywords.some(k => val.includes(k))) colIndices.quantity = colIdx;
        else if (colIndices.price === -1 && priceKeywords.some(k => val.includes(k))) colIndices.price = colIdx;
        else if (colIndices.expiryDate === -1 && expiryKeywords.some(k => val.includes(k))) colIndices.expiryDate = colIdx;
        else if (colIndices.barcode === -1 && barcodeKeywords.some(k => val.includes(k))) colIndices.barcode = colIdx;
        else if (colIndices.discountPercent === -1 && discountKeywords.some(k => val.includes(k))) colIndices.discountPercent = colIdx;
        else if (colIndices.bonusQty === -1 && bonusKeywords.some(k => val.includes(k))) colIndices.bonusQty = colIdx;
        else if (colIndices.batchNumber === -1 && batchKeywords.some(k => val.includes(k))) colIndices.batchNumber = colIdx;
      });
      break;
    }
  }

  const extractedItems: any[] = [];
  let formattedText = `[جدول الاكسل - استخراج مباشر مؤمّن]\n`;

  const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    let itemName = colIndices.name !== -1 ? String(row[colIndices.name] || '').trim() : '';
    
    if (!itemName) {
      const textCell = row.find(c => typeof c === 'string' && c.trim().length > 2 && isNaN(Number(c)));
      if (textCell) itemName = String(textCell).trim();
    }

    if (!itemName || itemName.length < 2) continue;

    const qty = colIndices.quantity !== -1 ? Number(row[colIndices.quantity]) || 1 : 1;
    const price = colIndices.price !== -1 ? Number(row[colIndices.price]) || 0 : 0;
    const rawExpiry = colIndices.expiryDate !== -1 ? row[colIndices.expiryDate] : '';
    const expiry = rawExpiry ? String(rawExpiry).trim() : '';
    const barcode = colIndices.barcode !== -1 ? String(row[colIndices.barcode] || '').trim() : '';
    const discount = colIndices.discountPercent !== -1 ? Number(row[colIndices.discountPercent]) || 0 : 0;
    const bonus = colIndices.bonusQty !== -1 ? Number(row[colIndices.bonusQty]) || 0 : 0;
    const batch = colIndices.batchNumber !== -1 ? String(row[colIndices.batchNumber] || '').trim() : '';

    extractedItems.push({
      name: itemName,
      barcode: barcode || undefined,
      quantity: qty > 0 ? qty : 1,
      price: price >= 0 ? price : 0,
      expiryDate: expiry || undefined,
      discountPercent: discount,
      bonusQty: bonus,
      batchNumber: batch || undefined
    });

    formattedText += `- صنف: ${itemName} | كمية: ${qty} | سعر الشراء: ${price}\n`;
  }

  return {
    text: formattedText,
    structuredItems: extractedItems.length > 0 ? extractedItems : undefined
  };
}

async function extractTextFromPDF(file: File): Promise<string> {
  if (file.size > MAX_PDF_FILE_SIZE) {
    throw new Error(`حجم ملف PDF يتجاوز الحد الأقصى المسموح به (${MAX_PDF_FILE_SIZE / (1024 * 1024)} ميجابايت).`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
    stopAtErrors: false
  });

  const pdf = await loadingTask.promise;
  let fullText = '';

  const maxPages = Math.min(pdf.numPages, 100);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent({
      includeMarkedContent: false,
      disableNormalization: false
    });
    const pageText = textContent.items
      .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

async function generateFileHash(file: File | string): Promise<string> {
  if (typeof file === 'string') {
    return file.slice(0, 32);
  }
  return `${file.name}_${file.size}_${file.lastModified}`;
}

export async function processInvoice(file: File | string): Promise<ParsedInvoice> {
  const hash = await generateFileHash(file);
  
  let text = getOCRCache(hash);
  const aiCacheKey = `pharmaflow_ai_cache_${hash}`;
  const cachedAI = configurationService.getSync<any>(aiCacheKey);

  if (cachedAI) {
    try {
      const { data, timestamp } = cachedAI;
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        return data;
      }
    } catch (e) {
      console.error("AI Cache Parse Error:", e);
    }
  }
  
  let excelItems: any[] | undefined = undefined;

  if (!text) {
    if (file instanceof File) {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv') || file.type.includes('excel') || file.type.includes('csv') || file.type.includes('spreadsheet')) {
        const excelRes = await extractDataFromExcelOrCSV(file);
        text = excelRes.text;
        excelItems = excelRes.structuredItems;
      } else if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else {
        text = await extractTextFromImage(file);
      }
    } else {
      text = await extractTextFromImage(file);
    }
    
    if (text) {
      saveOCRCache(hash, text);
    }
  }

  if (!text || text.trim().length < 5) {
    throw new Error('تعذر استخراج النص أو محتوى الجدول من الفاتورة.');
  }

  text = applyLearning(text);
  text = normalizeArabic(text);
  text = cleanInvoiceText(text);

  let data: ParsedInvoice;
  try {
    data = await parseInvoice(text);
    if ((!data.items || data.items.length === 0) && excelItems && excelItems.length > 0) {
      data.items = excelItems;
    } else if (excelItems && excelItems.length > 0 && data.items.length > 0) {
      data.items = data.items.map((aiItem, idx) => {
        const exItem = excelItems?.[idx];
        return {
          ...aiItem,
          barcode: aiItem.barcode || exItem?.barcode,
          batchNumber: aiItem.batchNumber || exItem?.batchNumber,
          discountPercent: aiItem.discountPercent || exItem?.discountPercent,
          bonusQty: aiItem.bonusQty || exItem?.bonusQty
        };
      });
    }
  } catch (err) {
    if (excelItems && excelItems.length > 0) {
      data = {
        type: 'cash',
        supplier: '',
        invoice_number: '',
        date: new Date().toISOString().split('T')[0],
        notes: '[استيراد مباشر من ملف اكسل/CSV]',
        items: excelItems,
        status: 'Draft',
        warning: '⚠️ تم استخراج بيانات الاكسل بنجاح بانتظار المراجعة والتدقيق.'
      };
    } else {
      throw err;
    }
  }

  try {
    configurationService.set(aiCacheKey, {
      data,
      timestamp: Date.now()
    }).catch(() => {});
  } catch (e) {
    // ignore quota issues
  }

  return data;
          }
