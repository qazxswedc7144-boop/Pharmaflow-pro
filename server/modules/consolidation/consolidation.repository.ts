// server/modules/consolidation/consolidation.repository.ts

import { prisma } from "../../database/prisma";
import { Branch, Product, InventoryMovement } from "@prisma/client";
import { ConsolidationLogger } from "./consolidation.logger";

export class ConsolidationRepository {
  /**
   * Enforces Zero Data Leak Policy by validating tenantId on every operation
   */
  public static assertValidTenantId(tenantId: string): string {
    if (!tenantId || typeof tenantId !== "string" || !tenantId.trim()) {
      throw new Error("[ConsolidationRepository] Zero Data Leak Policy Violation: A valid non-empty tenantId is strictly required for this operation.");
    }
    return tenantId.trim();
  }

  /**
   * Fetches active billing/operational branches scoped strictly by tenantId.
   * Never falls back to fake or hardcoded branches from other tenants.
   */
  static async getBranches(tenantId: string): Promise<Branch[]> {
    const validTenantId = this.assertValidTenantId(tenantId);
    return prisma.branch.findMany({
      where: {
        tenantId: validTenantId,
        isActive: true
      },
      orderBy: { code: "asc" }
    });
  }

  /**
   * Retrieves paginated journal entries with lines and accounts, strictly scoped by tenantId.
   */
  static async getJournalEntries(
    tenantId: string,
    page = 1,
    limit = 1000,
    options?: { startDate?: Date; endDate?: Date; branchId?: string }
  ): Promise<{ entries: any[]; total: number }> {
    const validTenantId = this.assertValidTenantId(tenantId);
    const boundedLimit = Math.min(Math.max(1, limit), 1000);
    const skip = (page - 1) * boundedLimit;

    const whereClause: any = {
      tenantId: validTenantId,
      status: "POSTED",
      ...(options?.branchId ? { branchId: options.branchId } : {}),
      ...(options?.startDate || options?.endDate
        ? {
            date: {
              ...(options.startDate ? { gte: options.startDate } : {}),
              ...(options.endDate ? { lte: options.endDate } : {})
            }
          }
        : {})
    };

    const [total, entries] = await Promise.all([
      prisma.journalEntry.count({ where: whereClause }),
      prisma.journalEntry.findMany({
        where: whereClause,
        select: {
          id: true,
          date: true,
          referenceId: true,
          sourceType: true,
          status: true,
          branchId: true,
          tenantId: true,
          debitTotal: true,
          creditTotal: true,
          description: true,
          lines: {
            select: {
              id: true,
              accountId: true,
              debit: true,
              credit: true,
              description: true,
              account: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  type: true
                }
              }
            }
          }
        },
        orderBy: { date: "desc" },
        skip,
        take: boundedLimit
      })
    ]);

    return { entries, total };
  }

  /**
   * Reads posted journal lines scoped strictly by tenantId with targeted select and bounded limit.
   */
  static async getAllPostedJournalLines(
    tenantId: string,
    options?: { startDate?: Date; endDate?: Date; branchId?: string; limit?: number }
  ) {
    const validTenantId = this.assertValidTenantId(tenantId);
    const boundedLimit = options?.limit ? Math.min(Math.max(1, options.limit), 50000) : 50000;

    return prisma.journalLine.findMany({
      where: {
        entry: {
          tenantId: validTenantId,
          status: "POSTED",
          ...(options?.branchId ? { branchId: options.branchId } : {}),
          ...(options?.startDate || options?.endDate
            ? {
                date: {
                  ...(options.startDate ? { gte: options.startDate } : {}),
                  ...(options.endDate ? { lte: options.endDate } : {})
                }
              }
            : {})
        }
      },
      select: {
        id: true,
        debit: true,
        credit: true,
        description: true,
        account: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true
          }
        },
        entry: {
          select: {
            id: true,
            branchId: true,
            date: true,
            referenceId: true
          }
        }
      },
      take: boundedLimit
    });
  }

  /**
   * Fetches finished inter-branch stock transfers for eliminations, strictly scoped by tenantId.
   */
  static async getCompletedBranchTransfers(tenantId: string): Promise<any[]> {
    const validTenantId = this.assertValidTenantId(tenantId);
    return prisma.branchTransfer.findMany({
      where: {
        tenantId: validTenantId,
        status: {
          in: ["RECEIVED", "IN_TRANSIT", "APPROVED"]
        }
      },
      select: {
        id: true,
        transferNumber: true,
        sourceBranchId: true,
        targetBranchId: true,
        status: true,
        reason: true,
        createdAt: true,
        sourceBranch: {
          select: { id: true, code: true, name: true }
        },
        targetBranch: {
          select: { id: true, code: true, name: true }
        },
        items: {
          select: {
            id: true,
            productId: true,
            qty: true,
            receivedQty: true,
            batchNumber: true,
            expiryDate: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 1000
    });
  }

  /**
   * Fetches confirmed invoices scoped strictly by tenantId with bounded take and targeted select.
   * Prevents loading 10,000 unbounded invoices into Node.js heap.
   */
  static async getInvoices(
    tenantId: string,
    page = 1,
    limit = 500,
    options?: { startDate?: Date; endDate?: Date; branchId?: string; type?: "SALE" | "PURCHASE" | "RETURN_SALE" | "RETURN_PURCHASE" }
  ): Promise<any[]> {
    const validTenantId = this.assertValidTenantId(tenantId);
    const boundedLimit = Math.min(Math.max(1, limit), 1000);
    const skip = (page - 1) * boundedLimit;

    return prisma.invoice.findMany({
      where: {
        tenantId: validTenantId,
        status: "CONFIRMED",
        ...(options?.type ? { type: options.type } : {}),
        ...(options?.branchId ? { branchId: options.branchId } : {}),
        ...(options?.startDate || options?.endDate
          ? {
              date: {
                ...(options.startDate ? { gte: options.startDate } : {}),
                ...(options.endDate ? { lte: options.endDate } : {})
              }
            }
          : {})
      },
      select: {
        id: true,
        invoiceNumber: true,
        date: true,
        type: true,
        partnerId: true,
        partnerType: true,
        totalAmount: true,
        status: true,
        paymentStatus: true,
        branchId: true,
        tenantId: true,
        items: {
          select: {
            id: true,
            productId: true,
            qty: true,
            price: true,
            cost: true,
            total: true,
            product: {
              select: {
                id: true,
                name: true,
                cost: true,
                price: true
              }
            }
          }
        }
      },
      orderBy: { date: "desc" },
      skip,
      take: boundedLimit
    });
  }

  /**
   * Database-side aggregation for invoices by type and branch
   */
  static async getInvoiceAggregates(
    tenantId: string,
    options?: { startDate?: Date; endDate?: Date; branchId?: string }
  ) {
    const validTenantId = this.assertValidTenantId(tenantId);
    return prisma.invoice.groupBy({
      by: ["type", "branchId"],
      where: {
        tenantId: validTenantId,
        status: "CONFIRMED",
        ...(options?.branchId ? { branchId: options.branchId } : {}),
        ...(options?.startDate || options?.endDate
          ? {
              date: {
                ...(options.startDate ? { gte: options.startDate } : {}),
                ...(options.endDate ? { lte: options.endDate } : {})
              }
            }
          : {})
      },
      _sum: {
        totalAmount: true
      },
      _count: {
        id: true
      }
    });
  }

  /**
   * Returns complete inventory quantities per branch and product scoped strictly by tenantId.
   */
  static async getBranchInventoryLevels(tenantId: string): Promise<any[]> {
    const validTenantId = this.assertValidTenantId(tenantId);
    return prisma.branchInventory.findMany({
      where: {
        branch: {
          tenantId: validTenantId
        }
      },
      select: {
        id: true,
        branchId: true,
        productId: true,
        stockQuantity: true,
        reorderPoint: true,
        reorderQuantity: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    });
  }

  /**
   * Returns list of products with catalog pricing and real costs, scoped strictly by tenantId.
   */
  static async getProductCatalog(tenantId: string): Promise<Product[]> {
    const validTenantId = this.assertValidTenantId(tenantId);
    return prisma.product.findMany({
      where: {
        tenantId: validTenantId,
        isActive: true,
        deletedAt: null
      }
    });
  }

  /**
   * Returns inventory batches with true FIFO cost and remaining quantities, scoped strictly by tenantId.
   */
  static async getInventoryBatches(tenantId: string): Promise<any[]> {
    const validTenantId = this.assertValidTenantId(tenantId);
    return prisma.inventoryBatch.findMany({
      where: {
        tenantId: validTenantId,
        stockQuantity: { gt: 0 }
      },
      select: {
        id: true,
        productId: true,
        batchNumber: true,
        initialQty: true,
        stockQuantity: true,
        cost: true,
        expiryDate: true
      },
      orderBy: { createdAt: "asc" }
    });
  }

  /**
   * Returns inventory movements in recent period for velocity analysis, scoped strictly by tenantId.
   */
  static async getHistoricalMovements(tenantId: string, since: Date, limit = 2000): Promise<InventoryMovement[]> {
    const validTenantId = this.assertValidTenantId(tenantId);
    const boundedLimit = Math.min(Math.max(1, limit), 5000);
    return prisma.inventoryMovement.findMany({
      where: {
        tenantId: validTenantId,
        createdAt: {
          gte: since
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: boundedLimit
    });
  }

  /**
   * Fetches confirmed sales items with actual cost, price and quantity, scoped strictly by tenantId.
   */
  static async getSalesItems(tenantId: string, since: Date, limit = 2000): Promise<any[]> {
    const validTenantId = this.assertValidTenantId(tenantId);
    const boundedLimit = Math.min(Math.max(1, limit), 5000);
    return prisma.invoiceItem.findMany({
      where: {
        invoice: {
          tenantId: validTenantId,
          type: "SALE",
          status: "CONFIRMED",
          date: { gte: since }
        }
      },
      select: {
        id: true,
        invoiceId: true,
        productId: true,
        qty: true,
        price: true,
        cost: true,
        total: true,
        createdAt: true,
        invoice: {
          select: {
            id: true,
            date: true,
            branchId: true,
            totalAmount: true
          }
        },
        product: {
          select: {
            id: true,
            name: true,
            cost: true,
            price: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: boundedLimit
    });
  }

  /**
   * Creates event records for audit traceability with mandatory tenantId.
   */
  static async writeAuditLog(
    tenantId: string,
    userId: string | null,
    action: string,
    entityId: string,
    payload: any,
    ipAddress?: string
  ) {
    const validTenantId = this.assertValidTenantId(tenantId);
    try {
      return await prisma.auditLog.create({
        data: {
          tenantId: validTenantId,
          userId,
          action,
          entity: "FinancialConsolidation",
          entityId,
          before: null,
          after: JSON.stringify(payload),
          ipAddress: ipAddress || "SYSTEM",
          requestId: payload?.requestId || null,
          branchId: "CONSOLIDATED"
        }
      });
    } catch (err) {
      ConsolidationLogger.warn("[ConsolidationRepo] Failed writing audit log, continuing", {
        tenantId: validTenantId,
        component: "ConsolidationRepository",
        context: { error: err instanceof Error ? err.message : String(err) }
      });
      return null;
    }
  }

  /**
   * Creates sync events inside the global event-sourced pipeline with tenantId.
   */
  static async publishSyncEvent(
    tenantId: string,
    eventId: string,
    eventType: string,
    entityId: string,
    payload: any,
    userId: string | null
  ) {
    const validTenantId = this.assertValidTenantId(tenantId);
    try {
      return await prisma.syncEvent.create({
        data: {
          eventId,
          clientTime: new Date(),
          userId,
          eventType,
          entityType: "CONSOLIDATION",
          entityId,
          payload: { ...payload, tenantId: validTenantId },
          branchId: "CONSOLIDATED",
          vectorClock: { value: 1 }
        }
      });
    } catch (err) {
      ConsolidationLogger.warn("[ConsolidationRepo] Failed publishing sync event, continuing", {
        tenantId: validTenantId,
        component: "ConsolidationRepository",
        context: { error: err instanceof Error ? err.message : String(err) }
      });
      return null;
    }
  }
}

