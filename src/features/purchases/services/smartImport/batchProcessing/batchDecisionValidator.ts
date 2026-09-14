// src/features/purchases/services/smartImport/batchProcessing/batchDecisionValidator.ts
import { 
  BatchProcessingSession, 
  DecisionValidationResult, 
  ValidationIssue,
  SupplierResolutionAction,
  ProductResolutionAction
} from './types';
import { Product, Supplier } from '@/types';
import { isValidExpiryDate } from '@/utils/expiryUtils';

export interface ValidationScopeContext {
  tenantId: string;
  branchId?: string;
  userRole?: string;
  existingProducts: Product[];
  existingSuppliers: Supplier[];
}

export class BatchDecisionValidator {
  /**
   * Validates all decisions in a batch processing session prior to execution
   */
  static validate(
    session: BatchProcessingSession,
    context: ValidationScopeContext
  ): DecisionValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    const { tenantId, existingProducts, existingSuppliers } = context;

    // 1. Tenant Integrity Verification
    if (!tenantId || session.tenantId !== tenantId) {
      errors.push({
        field: 'tenantId',
        code: 'TENANT_MISMATCH',
        message: `جلسة المعالجة تنتمي إلى مؤسسة أخرى (${session.tenantId}) ولا تطابق جلسة المستخدم المصادق عليها (${tenantId})`,
        severity: 'ERROR'
      });
      return {
        isValid: false,
        canApply: false,
        unresolvedCount: 999,
        errors,
        warnings
      };
    }

    // 2. Supplier Resolution Validation
    const supplierDecision = session.supplierDecision;
    if (supplierDecision.action === SupplierResolutionAction.UNRESOLVED && !supplierDecision.isSkipped) {
      errors.push({
        field: 'supplierDecision',
        code: 'SUPPLIER_UNRESOLVED',
        message: 'يجب اتخاذ قرار صريح بشأن المورد (مطابقة، اختيار، إنشاء جديد، أو تخطي)',
        severity: 'ERROR'
      });
    } else if (supplierDecision.action === SupplierResolutionAction.LINK_EXISTING || supplierDecision.action === SupplierResolutionAction.AUTO_MATCH) {
      if (!supplierDecision.matchedSupplierId) {
        errors.push({
          field: 'supplierDecision',
          code: 'SUPPLIER_MISSING_LINK_ID',
          message: 'تم تحديد ربط المورد ولكن لم يتم اختيار معرف مورد صالح',
          severity: 'ERROR'
        });
      } else {
        const found = existingSuppliers.find(s => s.id === supplierDecision.matchedSupplierId || s.Supplier_ID === supplierDecision.matchedSupplierId);
        if (!found) {
          errors.push({
            field: 'supplierDecision',
            code: 'SUPPLIER_NOT_FOUND',
            message: `المورد المختار (${supplierDecision.matchedSupplierId}) غير موجود في قاعدة بيانات الفرع أو المؤسسة`,
            severity: 'ERROR'
          });
        }
      }
    } else if (supplierDecision.action === SupplierResolutionAction.CREATE_NEW) {
      const newName = (supplierDecision.newSupplierData?.name || supplierDecision.importedSupplierName || '').trim();
      if (!newName) {
        errors.push({
          field: 'supplierDecision',
          code: 'SUPPLIER_NAME_REQUIRED',
          message: 'اسم المورد الجديد مطلوب',
          severity: 'ERROR'
        });
      } else {
        // Prevent duplicate supplier creation
        const duplicate = existingSuppliers.find(s => 
          (s.Supplier_Name || '').trim().toLowerCase() === newName.toLowerCase()
        );
        if (duplicate) {
          errors.push({
            field: 'supplierDecision',
            code: 'DUPLICATE_SUPPLIER_NAME',
            message: `يوجد مورد مسجل بالفعل بنفس الاسم: "${newName}" (المعرف: ${duplicate.id || duplicate.Supplier_ID})`,
            severity: 'ERROR'
          });
        }
      }
    }

    // 3. Product Decisions Validation
    let unresolvedCount = 0;
    const createdNamesInBatch = new Set<string>();
    const createdBarcodesInBatch = new Set<string>();

    const productsMapById = new Map<string, Product>();
    existingProducts.forEach(p => {
      if (p.id) productsMapById.set(p.id, p);
    });

    for (const prod of session.productDecisions) {
      if (prod.isSkipped || prod.action === ProductResolutionAction.SKIP) {
        continue;
      }

      if (prod.action === ProductResolutionAction.UNRESOLVED) {
        unresolvedCount++;
        errors.push({
          field: `productDecisions[${prod.sourceRowId}]`,
          code: 'PRODUCT_UNRESOLVED',
          message: `الصنف في السطر (${prod.sourceRowId}: ${prod.importedProductName}) لم يتم حسم قراره بعد`,
          sourceRowId: prod.sourceRowId,
          severity: 'ERROR'
        });
        continue;
      }

      // Quantity and Price validation
      if (prod.quantity <= 0 || isNaN(prod.quantity)) {
        errors.push({
          field: `productDecisions[${prod.sourceRowId}].quantity`,
          code: 'INVALID_QUANTITY',
          message: `الكمية غير صالحة للصنف "${prod.importedProductName}" في السطر ${prod.sourceRowId}`,
          sourceRowId: prod.sourceRowId,
          severity: 'ERROR'
        });
      }

      if (prod.unitPrice < 0 || isNaN(prod.unitPrice)) {
        errors.push({
          field: `productDecisions[${prod.sourceRowId}].unitPrice`,
          code: 'INVALID_UNIT_PRICE',
          message: `سعر الوحدة غير صالح للصنف "${prod.importedProductName}" في السطر ${prod.sourceRowId}`,
          sourceRowId: prod.sourceRowId,
          severity: 'ERROR'
        });
      }

      // Expiry Date Validation
      if (prod.expiryDate && !isValidExpiryDate(prod.expiryDate)) {
        warnings.push({
          field: `productDecisions[${prod.sourceRowId}].expiryDate`,
          code: 'INVALID_EXPIRY_FORMAT',
          message: `تاريخ الصلاحية (${prod.expiryDate}) للصنف في السطر ${prod.sourceRowId} يحتاج إلى مراجعة`,
          sourceRowId: prod.sourceRowId,
          severity: 'WARNING'
        });
      }

      // Action-specific validations
      if (prod.action === ProductResolutionAction.AUTO_MATCH || prod.action === ProductResolutionAction.LINK_EXISTING) {
        if (!prod.matchedProductId) {
          unresolvedCount++;
          errors.push({
            field: `productDecisions[${prod.sourceRowId}].matchedProductId`,
            code: 'MISSING_MATCHED_PRODUCT_ID',
            message: `الصنف في السطر ${prod.sourceRowId} محدد للربط ولكن لا يحتوي على معرف صنف صالح`,
            sourceRowId: prod.sourceRowId,
            severity: 'ERROR'
          });
        } else {
          const matchedProd = productsMapById.get(prod.matchedProductId);
          if (!matchedProd) {
            errors.push({
              field: `productDecisions[${prod.sourceRowId}].matchedProductId`,
              code: 'MATCHED_PRODUCT_NOT_FOUND',
              message: `الصنف المرتبط (${prod.matchedProductId}) غير موجود في سجل أصناف المؤسسة`,
              sourceRowId: prod.sourceRowId,
              severity: 'ERROR'
            });
          } else if (matchedProd.Is_Active === false) {
            errors.push({
              field: `productDecisions[${prod.sourceRowId}].matchedProductId`,
              code: 'MATCHED_PRODUCT_INACTIVE',
              message: `الصنف المرتبط (${matchedProd.Name || matchedProd.name}) معطل في النظام`,
              sourceRowId: prod.sourceRowId,
              severity: 'ERROR'
            });
          }
        }
      } else if (prod.action === ProductResolutionAction.CREATE_NEW) {
        const newName = (prod.newProductData?.name || prod.importedProductName || '').trim();
        const barcode = (prod.newProductData?.barcode || prod.barcode || '').trim();

        if (!newName) {
          errors.push({
            field: `productDecisions[${prod.sourceRowId}].newProductName`,
            code: 'PRODUCT_NAME_REQUIRED',
            message: `اسم الصنف الجديد مطلوب في السطر ${prod.sourceRowId}`,
            sourceRowId: prod.sourceRowId,
            severity: 'ERROR'
          });
        } else {
          const normNewName = newName.toLowerCase();
          
          // Check for duplicate creation within the same batch
          if (createdNamesInBatch.has(normNewName)) {
            // Note: If different batches/expiry, it might map to the same newly created product, which is resolved at batch apply.
            // But we check if the user is declaring multiple distinct new products with duplicate names.
          } else {
            createdNamesInBatch.add(normNewName);
          }

          if (barcode && createdBarcodesInBatch.has(barcode)) {
            warnings.push({
              field: `productDecisions[${prod.sourceRowId}].barcode`,
              code: 'DUPLICATE_BARCODE_IN_BATCH',
              message: `الباركود (${barcode}) مكرر في أكثر من صنف جديد في نفس الملف`,
              sourceRowId: prod.sourceRowId,
              severity: 'WARNING'
            });
          } else if (barcode) {
            createdBarcodesInBatch.add(barcode);
          }

          // Check if already exists in database
          const dbDuplicate = existingProducts.find(p => 
            (p.Name || p.name || '').trim().toLowerCase() === normNewName
          );
          if (dbDuplicate) {
            warnings.push({
              field: `productDecisions[${prod.sourceRowId}].newProductName`,
              code: 'DUPLICATE_PRODUCT_IN_DB',
              message: `يوجد صنف مسجل في النظام بنفس الاسم: "${newName}" (المعرف: ${dbDuplicate.id}). يفضل ربطه بدلاً من إنشاء مكرر.`,
              sourceRowId: prod.sourceRowId,
              severity: 'WARNING'
            });
          }
        }
      }
    }

    const isValid = errors.length === 0;
    const canApply = isValid && unresolvedCount === 0;

    return {
      isValid,
      canApply,
      unresolvedCount,
      errors,
      warnings
    };
  }
}
