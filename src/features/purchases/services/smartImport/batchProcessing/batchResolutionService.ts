// src/features/purchases/services/smartImport/batchProcessing/batchResolutionService.ts
import { db } from '@/core/db';
import { 
  BatchProcessingSession, 
  BatchApplyContext, 
  CanonicalResolutionResult, 
  BatchProcessingStatus, 
  SupplierResolutionAction, 
  ProductResolutionAction 
} from './types';
import { BatchDecisionValidator } from './batchDecisionValidator';
import { BatchIdempotencyService } from './batchIdempotencyService';
import { BatchSessionService } from './batchSessionService';
import { InvoiceItem, Product, Supplier } from '@/types';
import { normalizeToISODate } from '@/utils/expiryUtils';
import { auditLogService } from '@/services/audit/auditLog';

export class BatchResolutionService {
  /**
   * Applies the batch session atomically to master data and generates invoice items
   */
  static async applyBatch(
    session: BatchProcessingSession,
    context: BatchApplyContext
  ): Promise<CanonicalResolutionResult> {
    const startTime = Date.now();
    const { tenantId, branchId, userId, idempotencyKey } = context;

    // 1. Check Idempotency Cache
    const payloadHash = BatchIdempotencyService.hashPayload(session);
    const existingCheck = BatchIdempotencyService.getExecution(tenantId, idempotencyKey, payloadHash);

    if (existingCheck.exists) {
      if (existingCheck.mismatch) {
        throw new Error(`[IDEMPOTENCY_CONFLICT] مفتاح الإجراء (${idempotencyKey}) تم استخدامه مسبقاً مع جلسة استيراد مختلفة`);
      }
      if (existingCheck.result) {
        return existingCheck.result;
      }
    }

    // 2. Fetch scoped master data for validation
    let existingSuppliers: Supplier[] = context.masterData?.suppliers || [];
    let existingProducts: Product[] = context.masterData?.products || [];

    if (existingSuppliers.length === 0) {
      try {
        if (db.suppliers && typeof db.suppliers.toArray === 'function') {
          const allSuppliers = await db.suppliers.toArray();
          existingSuppliers = allSuppliers.filter(s => {
            if (s.Is_Active === false) return false;
            if (tenantId && (s as any).tenantId && (s as any).tenantId !== tenantId) return false;
            return true;
          });
        }
      } catch {
        existingSuppliers = [];
      }
    }

    if (existingProducts.length === 0) {
      try {
        if (db.products && typeof db.products.toArray === 'function') {
          const allProducts = await db.products.toArray();
          existingProducts = allProducts.filter(p => {
            if (p.Is_Active === false) return false;
            if (tenantId && (p as any).tenantId && (p as any).tenantId !== tenantId) return false;
            return true;
          });
        }
      } catch {
        existingProducts = [];
      }
    }

    // 3. Strict Pre-Application Validation
    const validation = BatchDecisionValidator.validate(session, {
      tenantId,
      branchId,
      existingProducts,
      existingSuppliers
    });

    if (!validation.canApply) {
      const errorMsg = validation.errors.map(e => e.message).join(' | ');
      throw new Error(`[VALIDATION_FAILED] تعذر تطبيق الاستيراد بسبب وجود قرارات غير مكتملة أو غير صالحة: ${errorMsg}`);
    }

    // 4. Atomic Execution Unit
    let createdSupplier: Supplier | undefined = undefined;
    const createdProducts: Product[] = [];
    const createdAliases: Array<{ sourceName: string; targetId: string; targetName: string }> = [];
    const invoiceItems: InvoiceItem[] = [];

    let appliedSupplierId = '';
    let appliedSupplierName = '';

    const executeUnit = async () => {
      // Step A: Supplier Resolution
      const supDecision = session.supplierDecision;
      if (supDecision.action === SupplierResolutionAction.CREATE_NEW) {
        const newSupName = (supDecision.newSupplierData?.name || supDecision.importedSupplierName || 'مورد مستورد جديد').trim();
        const newSupId = `SUP-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
        
        createdSupplier = {
          id: newSupId,
          Supplier_ID: newSupId,
          Supplier_Name: newSupName,
          Phone: supDecision.newSupplierData?.phone || '',
          Address: supDecision.newSupplierData?.address || '',
          taxNumber: supDecision.newSupplierData?.taxNumber || '',
          balance: 0,
          openingBalance: 0,
          Is_Active: true,
          Created_At: new Date().toISOString()
        };
        (createdSupplier as any).tenantId = tenantId;
        (createdSupplier as any).branchId = branchId;

        if (db.suppliers && typeof db.suppliers.put === 'function') {
          await db.suppliers.put(createdSupplier);
        }

        appliedSupplierId = newSupId;
        appliedSupplierName = newSupName;

        await auditLogService.log({
          user_id: userId,
          action: 'SMART_IMPORT_SUPPLIER_CREATED',
          target_type: 'SUPPLIER',
          target_id: newSupId,
          details: `تم إنشاء مورد جديد من الاستيراد الذكي: ${newSupName}`
        });
      } else if (supDecision.action === SupplierResolutionAction.AUTO_MATCH || supDecision.action === SupplierResolutionAction.LINK_EXISTING) {
        appliedSupplierId = supDecision.matchedSupplierId || '';
        appliedSupplierName = supDecision.matchedSupplierName || supDecision.importedSupplierName;
      }

      // Step B: Products Resolution & Generation
      let itemIdx = 0;
      for (const prod of session.productDecisions) {
        if (prod.isSkipped || prod.action === ProductResolutionAction.SKIP) {
          await auditLogService.log({
            user_id: userId,
            action: 'SMART_IMPORT_PRODUCT_SKIPPED',
            target_type: 'PRODUCT',
            target_id: prod.importedProductName,
            details: `تم تخطي الصنف في الاستيراد الذكي: ${prod.importedProductName}`
          });
          continue;
        }

        let targetProdId = '';
        let targetProdName = '';
        let barcodeToUse = prod.barcode;

        if (prod.action === ProductResolutionAction.CREATE_NEW) {
          const newName = (prod.newProductData?.name || prod.importedProductName).trim();
          const newId = `PROD-${Date.now()}-${itemIdx}-${Math.random().toString(36).substring(2, 5)}`;
          barcodeToUse = prod.newProductData?.barcode || prod.barcode || '';
          const unitPrice = prod.newProductData?.unitPrice !== undefined ? prod.newProductData.unitPrice : prod.unitPrice;
          const costPrice = prod.newProductData?.costPrice !== undefined ? prod.newProductData.costPrice : prod.unitPrice;

          const newProduct: Product = {
            id: newId,
            name: newName,
            Name: newName,
            barcode: barcodeToUse,
            UnitPrice: unitPrice,
            CostPrice: costPrice,
            price: unitPrice,
            stock: 0,
            StockQuantity: 0,
            categoryName: prod.newProductData?.categoryName || 'General',
            categoryId: prod.newProductData?.categoryId || 'CAT-GEN',
            supplierId: appliedSupplierId || undefined,
            supplierName: appliedSupplierName || undefined,
            Is_Active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          (newProduct as any).tenantId = tenantId;
          (newProduct as any).branchId = branchId;

          if (db.products && typeof db.products.put === 'function') {
            await db.products.put(newProduct);
          }

          createdProducts.push(newProduct);
          targetProdId = newId;
          targetProdName = newName;

          await auditLogService.log({
            user_id: userId,
            action: 'SMART_IMPORT_PRODUCT_CREATED',
            target_type: 'PRODUCT',
            target_id: newId,
            details: `تم إنشاء صنف جديد عبر الاستيراد الذكي: ${newName}`
          });
        } else {
          // AUTO_MATCH or LINK_EXISTING
          targetProdId = prod.matchedProductId || '';
          targetProdName = prod.matchedProductName || prod.importedProductName;

          if (prod.importedProductName && prod.matchedProductName && prod.importedProductName !== prod.matchedProductName) {
            createdAliases.push({
              sourceName: prod.importedProductName,
              targetId: targetProdId,
              targetName: targetProdName
            });
          }

          await auditLogService.log({
            user_id: userId,
            action: prod.action === ProductResolutionAction.AUTO_MATCH ? 'SMART_IMPORT_PRODUCT_AUTO_MATCHED' : 'SMART_IMPORT_PRODUCT_LINKED',
            target_type: 'PRODUCT',
            target_id: targetProdId,
            details: `تم ربط الصنف المستورد (${prod.importedProductName}) بالصنف المسجل (${targetProdName})`
          });
        }

        const normExp = normalizeToISODate(prod.expiryDate || '');
        const lineQty = prod.quantity > 0 ? prod.quantity : 1;
        const linePrice = prod.unitPrice >= 0 ? prod.unitPrice : 0;
        const lineTotal = Math.round(lineQty * linePrice * 100) / 100;

        const invoiceItem: InvoiceItem = {
          id: `item-${Date.now()}-${itemIdx}`,
          productId: targetProdId,
          product_id: targetProdId,
          name: targetProdName,
          productName: targetProdName,
          qty: lineQty,
          quantity: lineQty,
          price: linePrice,
          unitPrice: linePrice,
          sum: lineTotal,
          subtotal: lineTotal,
          expiryDate: normExp,
          notes: prod.notes || (prod.batchNumber ? `تشغيلة: ${prod.batchNumber}` : undefined),
          row_order: itemIdx + 1,
          rowOrder: itemIdx + 1
        };
        if (barcodeToUse) {
          (invoiceItem as any).barcode = barcodeToUse;
        }
        if (prod.bonusQty) {
          (invoiceItem as any).bonusQty = prod.bonusQty;
        }
        if (prod.discountPercent) {
          (invoiceItem as any).discountPercent = prod.discountPercent;
        }

        invoiceItems.push(invoiceItem);
        itemIdx++;
      }

      // Step C: Persist Learned Aliases
      if (createdAliases.length > 0) {
        try {
          const currentAliases = (await db.getSetting?.('smart_import_aliases', {})) || {};
          const updatedAliases = { ...currentAliases };
          createdAliases.forEach(a => {
            updatedAliases[a.sourceName] = a.targetName;
          });
          if (db.setSetting) {
            await db.setSetting('smart_import_aliases', updatedAliases);
          }
        } catch (err) {
          console.warn('[BatchResolutionService] Could not save smart_import_aliases setting:', err);
        }
      }
    };

    // Execute within Dexie transaction if available in browser, otherwise execute sequentially with resilience
    if (typeof indexedDB !== 'undefined' && db.transaction && typeof db.transaction === 'function') {
      try {
        const tables = [db.suppliers, db.products, db.settings, db.auditLogs].filter(Boolean);
        if (tables.length > 0) {
          await db.transaction('rw', tables, async () => {
            await executeUnit();
          });
        } else {
          await executeUnit();
        }
      } catch (txErr: any) {
        if (txErr?.name === 'MissingAPIError' || txErr?.message?.includes('IndexedDB')) {
          console.warn('[BatchResolutionService] IndexedDB unavailable, executing in-memory unit fallback:', txErr);
          await executeUnit();
        } else {
          console.error('[BatchResolutionService] Transaction error:', txErr);
          throw txErr;
        }
      }
    } else {
      await executeUnit();
    }

    const executionTimeMs = Date.now() - startTime;
    const appliedInvoiceNumber: string = session.summary.detectedInvoiceNumber || `INV-IMP-${Date.now()}`;
    const appliedDate: string = session.summary.detectedDate || new Date().toISOString().slice(0, 10);

    const resolutionResult: CanonicalResolutionResult = {
      success: true,
      sessionId: session.sessionId,
      tenantId,
      branchId,
      createdSupplier,
      createdSupplierId: createdSupplier ? (createdSupplier as any).id : undefined,
      createdProducts,
      createdProductIds: createdProducts.map(p => (p as any).id || ''),
      createdAliases,
      invoiceItems,
      appliedSupplierId: appliedSupplierId || '',
      appliedSupplierName: appliedSupplierName || session.summary.detectedSupplier || 'مورد غير محدد',
      appliedInvoiceNumber,
      appliedDate,
      executionTimeMs,
      idempotentReplay: false
    };

    // Record in Idempotency Service
    BatchIdempotencyService.recordExecution(
      tenantId,
      idempotencyKey,
      session.sessionId,
      payloadHash,
      resolutionResult
    );

    // Update Session State to APPLIED
    session.status = BatchProcessingStatus.APPLIED;
    session.appliedAt = new Date().toISOString();
    session.idempotencyKey = idempotencyKey;
    BatchSessionService.refreshSessionState(session);

    await auditLogService.log({
      user_id: userId,
      action: 'SMART_IMPORT_BATCH_APPLIED',
      target_type: 'BATCH_SESSION',
      target_id: session.sessionId,
      details: `تم تطبيق دفعة الاستيراد الذكي (${session.sessionId}) بنجاح. الأصناف المولدة: ${invoiceItems.length}`
    });

    return resolutionResult;
  }
}
