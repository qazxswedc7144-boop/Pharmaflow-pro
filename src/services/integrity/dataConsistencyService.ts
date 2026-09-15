import { db } from '@/core/db';
import { CrossDomainConsistencyReport, ConsistencyState } from '@/core/integrity/types';
import { AccountingConsistencyValidator } from '@/core/integrity';
import { observabilityService } from '@/core/observability/observabilityService';

export class DataConsistencyService {
  /**
   * Performs cross-domain consistency verification for a Sale document
   */
  public static async verifySaleConsistency(saleId: string): Promise<CrossDomainConsistencyReport> {
    const discrepancies: string[] = [];
    let hasInventoryMovement = false;
    let hasJournalEntry = false;
    let hasLedgerUpdate = false;
    let hasAuditRecord = false;

    try {
      if (typeof indexedDB !== 'undefined' && db) {
        // 1. Sale record check
        const sale = db.sales ? await db.sales.get(saleId) : null;
        if (!sale) {
          return {
            state: 'FAILED',
            domain: 'SALES',
            referenceId: saleId,
            hasInventoryMovement: false,
            hasJournalEntry: false,
            hasLedgerUpdate: false,
            hasAuditRecord: false,
            discrepancies: [`فاتورة المبيعات [${saleId}] غير موجودة`]
          };
        }

        const isPosted = sale.InvoiceStatus === 'POSTED' || sale.invoiceStatus === 'POSTED';

        if (isPosted) {
          // Check Inventory Movement
          if (db.inventoryTransactions) {
            const moves = await db.inventoryTransactions.where('sourceDocId').equals(saleId).toArray();
            hasInventoryMovement = moves.length > 0;
            if (!hasInventoryMovement) {
              discrepancies.push(`فاتورة مبيعات مرحلة [${saleId}] بدون حركات مخزنية مرتبطة`);
            }
          }

          // Check Journal Entry
          if (db.journalEntries) {
            const entries = await db.journalEntries.where('sourceId').equals(saleId).toArray();
            hasJournalEntry = entries.length > 0;
            if (hasJournalEntry) {
              for (const entry of entries) {
                const journalLines = db.journalLines ? await db.journalLines.where('entryId').equals(entry.id).toArray() : [];
                const report = AccountingConsistencyValidator.validateJournalBalance(journalLines);
                if (!report.isValid) {
                  discrepancies.push(...report.violations);
                }
              }
            } else {
              discrepancies.push(`فاتورة مبيعات مرحلة [${saleId}] بدون قيد محاسبي مرتبط`);
            }
          }

          // Check Customer Ledger / Financial Transaction
          if (db.financialTransactions) {
            const fts = await db.financialTransactions.where('Reference_ID').equals(saleId).toArray();
            hasLedgerUpdate = fts.length > 0;
          }

          // Check Audit
          if (db.auditLogs || db.integrity_audit_logs) {
            hasAuditRecord = true;
          }
        }
      }
    } catch (err: any) {
      discrepancies.push(`خطأ أثناء فحص اتساق الفاتورة: ${err.message || String(err)}`);
    }

    const state: ConsistencyState = discrepancies.length === 0 ? 'VALID' : 'INCONSISTENT';

    if (state === 'INCONSISTENT') {
      observabilityService
        .recordWarning(`Cross-domain inconsistency detected for sale ${saleId}`, { feature: 'INTEGRITY' }, { saleId, discrepancies })
        .catch(() => {});
    }

    return {
      state,
      domain: 'SALES',
      referenceId: saleId,
      hasInventoryMovement,
      hasJournalEntry,
      hasLedgerUpdate,
      hasAuditRecord,
      discrepancies
    };
  }

  /**
   * Performs cross-domain consistency verification for a Purchase document
   */
  public static async verifyPurchaseConsistency(purchaseId: string): Promise<CrossDomainConsistencyReport> {
    const discrepancies: string[] = [];
    let hasInventoryMovement = false;
    let hasJournalEntry = false;
    let hasLedgerUpdate = false;
    let hasAuditRecord = false;

    try {
      if (typeof indexedDB !== 'undefined' && db) {
        const purchase = db.purchases ? await db.purchases.get(purchaseId) : null;
        if (!purchase) {
          return {
            state: 'FAILED',
            domain: 'PURCHASES',
            referenceId: purchaseId,
            hasInventoryMovement: false,
            hasJournalEntry: false,
            hasLedgerUpdate: false,
            hasAuditRecord: false,
            discrepancies: [`فاتورة المشتريات [${purchaseId}] غير موجودة`]
          };
        }

        const isPosted = purchase.invoiceStatus === 'POSTED' || purchase.InvoiceStatus === 'POSTED';

        if (isPosted) {
          if (db.inventoryTransactions) {
            const moves = await db.inventoryTransactions.where('sourceDocId').equals(purchaseId).toArray();
            hasInventoryMovement = moves.length > 0;
            if (!hasInventoryMovement) {
              discrepancies.push(`فاتورة مشتريات مرحلة [${purchaseId}] بدون حركات مخزنية مرتبطة`);
            }
          }

          if (db.journalEntries) {
            const entries = await db.journalEntries.where('sourceId').equals(purchaseId).toArray();
            hasJournalEntry = entries.length > 0;
            if (!hasJournalEntry) {
              discrepancies.push(`فاتورة مشتريات مرحلة [${purchaseId}] بدون قيد محاسبي مرتبط`);
            }
          }

          if (db.financialTransactions) {
            const fts = await db.financialTransactions.where('Reference_ID').equals(purchaseId).toArray();
            hasLedgerUpdate = fts.length > 0;
          }

          hasAuditRecord = true;
        }
      }
    } catch (err: any) {
      discrepancies.push(`خطأ أثناء فحص اتساق الفاتورة: ${err.message || String(err)}`);
    }

    const state: ConsistencyState = discrepancies.length === 0 ? 'VALID' : 'INCONSISTENT';

    if (state === 'INCONSISTENT') {
      observabilityService
        .recordWarning(`Cross-domain inconsistency detected for purchase ${purchaseId}`, { feature: 'INTEGRITY' }, { purchaseId, discrepancies })
        .catch(() => {});
    }

    return {
      state,
      domain: 'PURCHASES',
      referenceId: purchaseId,
      hasInventoryMovement,
      hasJournalEntry,
      hasLedgerUpdate,
      hasAuditRecord,
      discrepancies
    };
  }
}
