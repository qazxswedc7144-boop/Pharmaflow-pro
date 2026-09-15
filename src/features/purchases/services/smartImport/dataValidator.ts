// src/features/purchases/services/smartImport/dataValidator.ts
import { ExtractedImportRow, RowValidationStatus, ImportSummary } from './types';
import { normalizeToISODate, isValidExpiryDate } from '@/utils/expiryUtils';

export class DataValidator {
  /**
   * Normalizes an expiry date string into standard YYYY-MM-DD format
   */
  static normalizeExpiryDate(rawDate: string): { normalizedDate?: string; isValid: boolean; isExpired?: boolean; error?: string } {
    if (!rawDate || !rawDate.trim()) {
      return { isValid: true }; // Optional field, so empty is not an error
    }

    const clean = rawDate.trim().replace(/\s+/g, '');
    const iso = normalizeToISODate(clean);

    if (!iso || !isValidExpiryDate(iso)) {
      return {
        isValid: false,
        error: `تنسيق تاريخ الصلاحية غير صالح: (${rawDate})`
      };
    }

    const parts = iso.split('-');
    const year = parseInt(parts[0] || '0', 10);
    const month = parseInt(parts[1] || '0', 10);
    const day = parseInt(parts[2] || '0', 10);

    // Check if expired
    const expDate = new Date(year, month - 1, day, 23, 59, 59);
    const now = new Date();
    const isExpired = expDate < now;

    return {
      isValid: true,
      normalizedDate: iso,
      isExpired
    };
  }

  /**
   * Validates an extracted invoice row and sets validation issues and status
   */
  static validateRow(
    row: Partial<ExtractedImportRow>,
    rowNumber: number,
    seenItemsMap: Map<string, number>
  ): ExtractedImportRow {
    const issues: string[] = [];
    let status: RowValidationStatus = 'VALID';

    // 1. Check Product Name
    const name = (row.productName || '').trim();
    if (!name || name.length < 2) {
      status = 'MISSING_PRODUCT_NAME';
      issues.push('اسم الصنف مفقود أو غير مكتمل');
    }

    // 2. Check Quantity
    const qty = row.quantity !== undefined ? Number(row.quantity) : 0;
    if (isNaN(qty) || qty <= 0) {
      status = 'INVALID_QUANTITY';
      issues.push('الكمية يجب أن تكون أكبر من الصفر');
    }

    // 3. Check Unit Price
    const price = row.unitPrice !== undefined ? Number(row.unitPrice) : 0;
    if (isNaN(price) || price < 0) {
      status = 'INVALID_PRICE';
      issues.push('سعر الوحدة غير صالح');
    }

    // 4. Check Calculation Math (Qty × Price vs Total)
    const discount = Number(row.discountPercent || 0);
    const calculatedSubtotal = qty * price;
    const expectedTotal = discount > 0 
      ? calculatedSubtotal * (1 - discount / 100) 
      : calculatedSubtotal;

    const supplierTotal = row.total !== undefined ? Number(row.total) : undefined;

    if (supplierTotal !== undefined && supplierTotal > 0 && qty > 0 && price > 0) {
      const diff = Math.abs(supplierTotal - expectedTotal);
      // Tolerance of 0.5 currency unit or 1%
      const tolerance = Math.max(0.5, expectedTotal * 0.01);
      if (diff > tolerance) {
        status = 'PRICE_TOTAL_MISMATCH';
        issues.push(`فارق في الإجمالي: الحسابي (${expectedTotal.toFixed(2)}) ≠ إجمالي المورد (${supplierTotal.toFixed(2)})`);
      }
    }

    // 5. Expiry Date validation
    let normalizedExpiry: string | undefined = undefined;
    if (row.expiryDate) {
      const expResult = this.normalizeExpiryDate(row.expiryDate);
      if (!expResult.isValid) {
        if (status === 'VALID') status = 'INVALID_EXPIRY';
        issues.push(expResult.error || 'تاريخ الصلاحية غير صالح');
      } else {
        normalizedExpiry = expResult.normalizedDate;
        if (expResult.isExpired) {
          issues.push('⚠️ تنبيه: تاريخ الصلاحية منتهي أو قارب على الانتهاء');
        }
      }
    }

    // 6. Duplicate check in the same import file
    let isDuplicate = false;
    let duplicateReason: string | undefined = undefined;
    if (name) {
      const key = `${name.toLowerCase()}__${row.batchNumber || ''}__${row.barcode || ''}`;
      if (seenItemsMap.has(key)) {
        isDuplicate = true;
        duplicateReason = `مكرر مع السطر رقم #${seenItemsMap.get(key)}`;
        issues.push(`⚠️ تنبيه: تكرار الصنف داخل نفس الفاتورة (${duplicateReason})`);
      } else {
        seenItemsMap.set(key, rowNumber);
      }
    }

    const wasSupplierTotalMissing = supplierTotal === undefined || isNaN(supplierTotal);
    const finalTotal = !wasSupplierTotalMissing ? supplierTotal : expectedTotal;
    const addedExplanations: string[] = [];
    if (wasSupplierTotalMissing && qty > 0 && price > 0) {
      addedExplanations.push(`تم استنتاج الإجمالي رياضياً (${finalTotal})`);
    }

    return {
      rowNumber,
      rawCells: row.rawCells || {},
      productName: name,
      quantity: qty > 0 ? qty : 1,
      unitPrice: price >= 0 ? price : 0,
      total: finalTotal,
      expectedTotal,
      barcode: row.barcode,
      productCode: row.productCode,
      batchNumber: row.batchNumber,
      expiryDate: normalizedExpiry || row.expiryDate,
      discountPercent: discount,
      tax: row.tax,
      bonusQty: row.bonusQty,
      unit: row.unit,
      notes: row.notes,
      status,
      validationIssues: issues,
      isDuplicate,
      duplicateReason,
      isHealed: row.isHealed || wasSupplierTotalMissing,
      healingExplanations: [
        ...(row.healingExplanations || []),
        ...addedExplanations
      ]
    };
  }

  /**
   * Generates a comprehensive summary from validated rows
   */
  static generateSummary(rows: ExtractedImportRow[]): ImportSummary {
    let validCount = 0;
    let reviewCount = 0;
    let skippedCount = 0;
    let newCandidatesCount = 0;
    let duplicateCount = 0;
    let totalAmount = 0;

    for (const row of rows) {
      if (row.isSkipped) {
        skippedCount++;
        continue;
      }

      if (row.status === 'VALID') {
        validCount++;
      } else {
        reviewCount++;
      }

      if (row.isNewProductCandidate) {
        newCandidatesCount++;
      }

      if (row.isDuplicate) {
        duplicateCount++;
      }

      totalAmount += (row.total || (row.quantity * row.unitPrice));
    }

    return {
      totalRowsDetected: rows.length,
      validRowsCount: validCount,
      reviewRequiredCount: reviewCount,
      skippedRowsCount: skippedCount,
      newProductCandidatesCount: newCandidatesCount,
      duplicateCandidatesCount: duplicateCount,
      totalInvoiceAmount: Math.round(totalAmount * 100) / 100
    };
  }
}
