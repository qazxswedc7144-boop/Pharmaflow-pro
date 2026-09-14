// server/services/reporting/financial-report.engine.ts
// Enterprise Financial Reporting Calculation & Aggregation Engine

import {
  BalanceSheetReport,
  ProfitLossReport,
  TrialBalanceReport,
  TrialBalanceItem,
  GeneralLedgerReport,
  GeneralLedgerAccountStatement,
  GeneralLedgerTransaction,
  InventoryValuationReport,
  InventoryValuationItem,
  CustomerReport,
  CustomerBalanceItem,
  SupplierReport,
  SupplierBalanceItem,
  TaxReport,
  CashFlowReport,
  CashFlowActivity,
  DashboardKPIsReport,
  ReportFilterParams,
  ReportHeaderMetadata,
  BalanceSheetItem
} from "./reporting.types";
import { ReportQueryService, QueriedJournalLine } from "./report-query.service";

export class FinancialReportEngine {
  /**
   * Helper to construct unified report header
   */
  private static createHeader(
    reportType: any,
    titleAr: string,
    titleEn: string,
    filters: ReportFilterParams,
    userId: string,
    syncMetadata: any,
    fromCache = false
  ): ReportHeaderMetadata {
    return {
      reportId: `REP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      reportType,
      reportTitleArabic: titleAr,
      reportTitleEnglish: titleEn,
      tenantId: filters.tenantId,
      branchId: filters.branchId || null,
      generatedByUserId: userId,
      generatedAt: new Date().toISOString(),
      periodStart: filters.startDate,
      periodEnd: filters.endDate || filters.asOfDate,
      currency: "SAR",
      syncMetadata,
      fromCache
    };
  }

  /**
   * 1. TRIAL BALANCE (ميزان المراجعة)
   */
  public static async generateTrialBalance(
    filters: ReportFilterParams,
    userId: string
  ): Promise<TrialBalanceReport> {
    const accounts = await ReportQueryService.getAccounts(filters);
    const allLines = await ReportQueryService.getJournalLines({
      tenantId: filters.tenantId,
      branchId: filters.branchId
    });

    const syncMetadata = ReportQueryService.evaluateSyncState(allLines);

    // Opening lines: lines before startDate
    const openingLines = filters.startDate
      ? allLines.filter(l => l.entryDate < filters.startDate!)
      : [];

    // Period lines: lines within [startDate, endDate]
    const periodLines = allLines.filter(l => {
      if (filters.startDate && l.entryDate < filters.startDate) return false;
      if (filters.endDate && l.entryDate > filters.endDate) return false;
      if (filters.asOfDate && l.entryDate > filters.asOfDate) return false;
      return true;
    });

    const items: TrialBalanceItem[] = accounts.map(acc => {
      // Opening
      const accOpeningLines = openingLines.filter(l => l.accountId === acc.id || l.accountCode === acc.code);
      const openingDebit = accOpeningLines.reduce((s, l) => s + l.debit, 0);
      const openingCredit = accOpeningLines.reduce((s, l) => s + l.credit, 0);

      // Period
      const accPeriodLines = periodLines.filter(l => l.accountId === acc.id || l.accountCode === acc.code);
      const periodDebit = accPeriodLines.reduce((s, l) => s + l.debit, 0);
      const periodCredit = accPeriodLines.reduce((s, l) => s + l.credit, 0);

      // Cumulative totals up to end
      const totalDebit = openingDebit + periodDebit;
      const totalCredit = openingCredit + periodCredit;

      let endingDebit = 0;
      let endingCredit = 0;
      let netBalance = 0;

      if (acc.type === "ASSET" || acc.type === "EXPENSE") {
        netBalance = totalDebit - totalCredit;
        if (netBalance >= 0) {
          endingDebit = netBalance;
        } else {
          endingCredit = Math.abs(netBalance);
        }
      } else {
        // LIABILITY, EQUITY, REVENUE (Normal Credit balance)
        netBalance = totalCredit - totalDebit;
        if (netBalance >= 0) {
          endingCredit = netBalance;
        } else {
          endingDebit = Math.abs(netBalance);
        }
      }

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        openingDebit,
        openingCredit,
        periodDebit,
        periodCredit,
        endingDebit,
        endingCredit,
        netBalance
      };
    });

    const openingDebitTotal = items.reduce((s, i) => s + i.openingDebit, 0);
    const openingCreditTotal = items.reduce((s, i) => s + i.openingCredit, 0);
    const periodDebitTotal = items.reduce((s, i) => s + i.periodDebit, 0);
    const periodCreditTotal = items.reduce((s, i) => s + i.periodCredit, 0);
    const endingDebitTotal = items.reduce((s, i) => s + i.endingDebit, 0);
    const endingCreditTotal = items.reduce((s, i) => s + i.endingCredit, 0);

    const difference = Math.abs(endingDebitTotal - endingCreditTotal);
    const isBalanced = difference < 0.01;

    const header = this.createHeader(
      "trial-balance",
      "ميزان المراجعة الشامل",
      "Comprehensive Trial Balance",
      filters,
      userId,
      syncMetadata
    );

    return {
      header,
      period: { start: filters.startDate, end: filters.endDate || filters.asOfDate },
      accounts: items,
      totals: {
        openingDebitTotal,
        openingCreditTotal,
        periodDebitTotal,
        periodCreditTotal,
        endingDebitTotal,
        endingCreditTotal,
        isBalanced,
        difference
      }
    };
  }

  /**
   * 2. PROFIT & LOSS STATEMENT (قائمة الأرباح والخسائر)
   */
  public static async generateProfitLoss(
    filters: ReportFilterParams,
    userId: string
  ): Promise<ProfitLossReport> {
    const trialBalance = await this.generateTrialBalance(filters, userId);

    // Revenue Accounts
    const revenueAccounts = trialBalance.accounts.filter(a => a.type === "REVENUE");
    const totalRevenue = revenueAccounts.reduce(
      (s, a) => s + (a.periodCredit - a.periodDebit),
      0
    );

    // Cost of Goods Sold (COGS) Accounts (e.g. ACC-501 or containing 'تكلفة' / COGS)
    const cogsAccounts = trialBalance.accounts.filter(
      a =>
        (a.type === "EXPENSE" && a.code.includes("501")) ||
        a.name.includes("تكلفة المبيعات") ||
        a.name.toLowerCase().includes("cost of goods")
    );
    const totalCogs = cogsAccounts.reduce(
      (s, a) => s + (a.periodDebit - a.periodCredit),
      0
    );

    // Operating Expenses Accounts
    const expenseAccounts = trialBalance.accounts.filter(
      a =>
        a.type === "EXPENSE" &&
        !cogsAccounts.some(c => c.id === a.id)
    );
    const totalOperatingExpenses = expenseAccounts.reduce(
      (s, a) => s + (a.periodDebit - a.periodCredit),
      0
    );

    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPercentage = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const operatingProfit = grossProfit - totalOperatingExpenses;
    const netProfit = operatingProfit;
    const netMarginPercentage = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const header = this.createHeader(
      "profit-loss",
      "قائمة الأرباح والخسائر (الدخل)",
      "Profit & Loss (Income Statement)",
      filters,
      userId,
      trialBalance.header.syncMetadata
    );

    return {
      header,
      period: {
        start: filters.startDate || "البداية",
        end: filters.endDate || filters.asOfDate || new Date().toISOString().split("T")[0]!
      },
      revenue: {
        salesRevenue: totalRevenue,
        returnsAndDiscounts: 0,
        netSalesRevenue: totalRevenue,
        otherIncome: 0,
        totalRevenue,
        items: revenueAccounts.map(r => ({
          id: r.id,
          code: r.code,
          name: r.name,
          amount: r.periodCredit - r.periodDebit
        }))
      },
      costOfGoodsSold: {
        beginningInventory: 0,
        purchases: totalCogs,
        endingInventory: 0,
        cogsAmount: totalCogs,
        items: cogsAccounts.map(c => ({
          id: c.id,
          code: c.code,
          name: c.name,
          amount: c.periodDebit - c.periodCredit
        }))
      },
      grossProfit,
      grossMarginPercentage,
      operatingExpenses: {
        salariesAndWages: 0,
        rentAndUtilities: 0,
        administrative: 0,
        depreciation: 0,
        otherExpenses: totalOperatingExpenses,
        totalExpenses: totalOperatingExpenses,
        items: expenseAccounts.map(e => ({
          id: e.id,
          code: e.code,
          name: e.name,
          amount: e.periodDebit - e.periodCredit
        }))
      },
      operatingProfit,
      netProfit,
      netMarginPercentage
    };
  }

  /**
   * 3. BALANCE SHEET (الميزانية العمومية والمركز المالي)
   */
  public static async generateBalanceSheet(
    filters: ReportFilterParams,
    userId: string
  ): Promise<BalanceSheetReport> {
    const asOfDate = filters.asOfDate || filters.endDate || new Date().toISOString().split("T")[0]!;

    // Compile trial balance up to the asOfDate
    const trialBalance = await this.generateTrialBalance(
      { tenantId: filters.tenantId, branchId: filters.branchId, asOfDate },
      userId
    );

    // Compute cumulative Profit & Loss up to asOfDate for Retained Earnings / Current Period
    const pl = await this.generateProfitLoss(
      { tenantId: filters.tenantId, branchId: filters.branchId, asOfDate },
      userId
    );
    const currentPeriodProfit = pl.netProfit;

    const assets = trialBalance.accounts.filter(a => a.type === "ASSET");
    const liabilities = trialBalance.accounts.filter(a => a.type === "LIABILITY");
    const equities = trialBalance.accounts.filter(a => a.type === "EQUITY");

    const cashAndEquivalents: BalanceSheetItem[] = [];
    const accountsReceivable: BalanceSheetItem[] = [];
    const inventoryValuation: BalanceSheetItem[] = [];
    const otherAssets: BalanceSheetItem[] = [];

    assets.forEach(a => {
      const balance = a.endingDebit - a.endingCredit;
      const item: BalanceSheetItem = {
        id: a.id,
        code: a.code,
        name: a.name,
        category: "ASSET",
        amount: balance
      };

      if (a.code.includes("101") || a.code.includes("104") || a.name.includes("نقد") || a.name.includes("صندوق") || a.name.includes("بنك")) {
        cashAndEquivalents.push(item);
      } else if (a.code.includes("102") || a.name.includes("عملاء") || a.name.includes("مدين")) {
        accountsReceivable.push(item);
      } else if (a.code.includes("103") || a.name.includes("مخزون") || a.name.includes("بضائع")) {
        inventoryValuation.push(item);
      } else {
        otherAssets.push(item);
      }
    });

    const accountsPayable: BalanceSheetItem[] = [];
    const otherLiabilities: BalanceSheetItem[] = [];

    liabilities.forEach(l => {
      const balance = l.endingCredit - l.endingDebit;
      const item: BalanceSheetItem = {
        id: l.id,
        code: l.code,
        name: l.name,
        category: "LIABILITY",
        amount: balance
      };

      if (l.code.includes("201") || l.name.includes("مورد") || l.name.includes("دائن")) {
        accountsPayable.push(item);
      } else {
        otherLiabilities.push(item);
      }
    });

    const capitalItems: BalanceSheetItem[] = equities.map(e => ({
      id: e.id,
      code: e.code,
      name: e.name,
      category: "EQUITY",
      amount: e.endingCredit - e.endingDebit
    }));

    const totalCashAndBank = cashAndEquivalents.reduce((s, i) => s + i.amount, 0);
    const totalReceivables = accountsReceivable.reduce((s, i) => s + i.amount, 0);
    const totalInventory = inventoryValuation.reduce((s, i) => s + i.amount, 0);
    const totalOtherAssets = otherAssets.reduce((s, i) => s + i.amount, 0);
    const totalAssets = totalCashAndBank + totalReceivables + totalInventory + totalOtherAssets;

    const totalPayables = accountsPayable.reduce((s, i) => s + i.amount, 0);
    const totalOtherLiabilities = otherLiabilities.reduce((s, i) => s + i.amount, 0);
    const totalLiabilities = totalPayables + totalOtherLiabilities;

    const totalCapital = capitalItems.reduce((s, i) => s + i.amount, 0);
    const retainedEarnings = 0; // accumulated previous years
    const totalEquity = totalCapital + retainedEarnings + currentPeriodProfit;

    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    const discrepancy = Math.abs(totalAssets - totalLiabilitiesAndEquity);
    const isBalanced = discrepancy < 0.01;

    const header = this.createHeader(
      "balance-sheet",
      "الميزانية العمومية والمركز المالي",
      "Balance Sheet & Financial Position",
      filters,
      userId,
      trialBalance.header.syncMetadata
    );

    return {
      header,
      asOfDate,
      assets: {
        cashAndEquivalents,
        accountsReceivable,
        inventoryValuation,
        otherAssets,
        totalCashAndBank,
        totalReceivables,
        totalInventory,
        totalAssets
      },
      liabilities: {
        accountsPayable,
        shortTermLiabilities: otherLiabilities,
        longTermLiabilities: [],
        totalPayables,
        totalLiabilities
      },
      equity: {
        capital: capitalItems,
        retainedEarnings,
        currentPeriodProfit,
        totalEquity
      },
      totalLiabilitiesAndEquity,
      isBalanced,
      discrepancy
    };
  }

  /**
   * 4. GENERAL LEDGER (دفتر الأستاذ العام)
   */
  public static async generateGeneralLedger(
    filters: ReportFilterParams,
    userId: string
  ): Promise<GeneralLedgerReport> {
    const accounts = await ReportQueryService.getAccounts(filters);
    const allLines = await ReportQueryService.getJournalLines({
      tenantId: filters.tenantId,
      branchId: filters.branchId,
      accountId: filters.accountId
    });

    const syncMetadata = ReportQueryService.evaluateSyncState(allLines);

    let filteredAccounts = accounts;
    if (filters.accountId) {
      filteredAccounts = accounts.filter(a => a.id === filters.accountId || a.code === filters.accountId);
    }

    let overallDebits = 0;
    let overallCredits = 0;

    const statements: GeneralLedgerAccountStatement[] = filteredAccounts.map(acc => {
      const accLines = allLines.filter(l => l.accountId === acc.id || l.accountCode === acc.code);

      // Prior lines before startDate
      const priorLines = filters.startDate
        ? accLines.filter(l => l.entryDate < filters.startDate!)
        : [];

      // Opening balance
      let openingBalance = 0;
      if (acc.type === "ASSET" || acc.type === "EXPENSE") {
        openingBalance = priorLines.reduce((s, l) => s + (l.debit - l.credit), 0);
      } else {
        openingBalance = priorLines.reduce((s, l) => s + (l.credit - l.debit), 0);
      }

      // Period lines
      const periodLines = accLines.filter(l => {
        if (filters.startDate && l.entryDate < filters.startDate) return false;
        if (filters.endDate && l.entryDate > filters.endDate) return false;
        return true;
      });

      let currentRunningBalance = openingBalance;
      const transactions: GeneralLedgerTransaction[] = periodLines.map(l => {
        if (acc.type === "ASSET" || acc.type === "EXPENSE") {
          currentRunningBalance += l.debit - l.credit;
        } else {
          currentRunningBalance += l.credit - l.debit;
        }

        overallDebits += l.debit;
        overallCredits += l.credit;

        return {
          id: l.id,
          date: l.entryDate,
          entryNumber: l.entryNumber,
          sourceType: l.sourceType,
          sourceId: l.sourceId,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
          runningBalance: currentRunningBalance,
          branchId: l.branchId
        };
      });

      const totalDebits = periodLines.reduce((s, l) => s + l.debit, 0);
      const totalCredits = periodLines.reduce((s, l) => s + l.credit, 0);

      return {
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        openingBalance,
        totalDebits,
        totalCredits,
        closingBalance: currentRunningBalance,
        transactions
      };
    });

    const header = this.createHeader(
      "general-ledger",
      "دفتر الأستاذ العام وحركة الحسابات",
      "General Ledger Account Statement",
      filters,
      userId,
      syncMetadata
    );

    return {
      header,
      period: { start: filters.startDate, end: filters.endDate },
      accounts: statements,
      summary: {
        totalAccounts: statements.length,
        overallDebits,
        overallCredits
      }
    };
  }

  /**
   * 5. INVENTORY VALUATION (تقييم المخزون والركود والصلاحية)
   */
  public static async generateInventoryValuation(
    filters: ReportFilterParams,
    userId: string
  ): Promise<InventoryValuationReport> {
    const products = await ReportQueryService.getProducts(filters);
    const syncMetadata = ReportQueryService.evaluateSyncState(products);

    const today = new Date();
    let totalStockUnits = 0;
    let totalCostValuation = 0;
    let totalSalesPotential = 0;
    let nearExpiryValue = 0;
    let expiredValue = 0;

    const items: InventoryValuationItem[] = products.map(p => {
      const qty = p.stockQuantity;
      const cost = p.cost;
      const price = p.price;
      const totalCostValue = qty * cost;
      const totalSalesValue = qty * price;
      const unrealizedProfit = totalSalesValue - totalCostValue;
      const profitMarginPercent = totalSalesValue > 0 ? (unrealizedProfit / totalSalesValue) * 100 : 0;

      let expiryStatus: "VALID" | "NEAR_EXPIRY" | "EXPIRED" = "VALID";
      if (p.expiryDate) {
        const exp = new Date(p.expiryDate);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) {
          expiryStatus = "EXPIRED";
          expiredValue += totalCostValue;
        } else if (diffDays <= 90) {
          expiryStatus = "NEAR_EXPIRY";
          nearExpiryValue += totalCostValue;
        }
      }

      totalStockUnits += qty;
      totalCostValuation += totalCostValue;
      totalSalesPotential += totalSalesValue;

      return {
        id: p.id,
        productId: p.id,
        productName: p.name,
        barcode: p.barcode,
        sku: p.sku,
        category: p.category,
        stockQuantity: qty,
        unitCost: cost,
        unitPrice: price,
        totalCostValue,
        totalSalesValue,
        unrealizedProfit,
        profitMarginPercent,
        expiryStatus,
        nearestExpiryDate: p.expiryDate,
        branchId: p.branchId
      };
    });

    const header = this.createHeader(
      "inventory-valuation",
      "تقرير تقييم المخزون وصلاحية الأصناف",
      "Inventory Valuation & Stock Status",
      filters,
      userId,
      syncMetadata
    );

    return {
      header,
      valuationMethod: "FIFO",
      summary: {
        totalItemsCount: items.length,
        totalStockUnits,
        totalCostValuation,
        totalSalesPotential,
        totalUnrealizedProfit: totalSalesPotential - totalCostValuation,
        nearExpiryValue,
        expiredValue
      },
      items
    };
  }

  /**
   * 6. CUSTOMER BALANCES & AGING REPORT (أرصدة وتعمير ذمم العملاء)
   */
  public static async generateCustomerReport(
    filters: ReportFilterParams,
    userId: string
  ): Promise<CustomerReport> {
    const customers = await ReportQueryService.getPartners("CUSTOMER", filters);
    const invoices = await ReportQueryService.getInvoices({
      tenantId: filters.tenantId,
      branchId: filters.branchId,
      customerId: filters.customerId
    });

    const syncMetadata = ReportQueryService.evaluateSyncState([...customers, ...invoices]);
    const today = new Date();

    let totalReceivables = 0;
    const globalAging = { current: 0, days31to60: 0, days61to90: 0, daysOver90: 0 };

    const items: CustomerBalanceItem[] = customers.map(cust => {
      const custInvoices = invoices.filter(
        i => (i.partnerId === cust.id || (i.partnerType === "CUSTOMER" && i.partnerId === cust.id)) && i.type === "SALE"
      );

      const totalSales = custInvoices.reduce((s, i) => s + i.totalAmount, 0);
      const totalPaid = custInvoices.reduce((s, i) => s + i.paidAmount, 0);
      const balanceDue = totalSales - totalPaid;

      const custAging = { current: 0, days31to60: 0, days61to90: 0, daysOver90: 0 };

      custInvoices.forEach(inv => {
        const unpaid = inv.totalAmount - inv.paidAmount;
        if (unpaid > 0.01) {
          const invDate = new Date(inv.date);
          const days = Math.ceil((today.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));

          if (days <= 30) custAging.current += unpaid;
          else if (days <= 60) custAging.days31to60 += unpaid;
          else if (days <= 90) custAging.days61to90 += unpaid;
          else custAging.daysOver90 += unpaid;
        }
      });

      totalReceivables += balanceDue;
      globalAging.current += custAging.current;
      globalAging.days31to60 += custAging.days31to60;
      globalAging.days61to90 += custAging.days61to90;
      globalAging.daysOver90 += custAging.daysOver90;

      const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
        custAging.daysOver90 > 0 || balanceDue > 10000
          ? "HIGH"
          : custAging.days31to60 > 0 || balanceDue > 3000
          ? "MEDIUM"
          : "LOW";

      const lastInv = custInvoices.sort((a, b) => (b.date > a.date ? 1 : -1))[0];

      return {
        customerId: cust.id,
        customerName: cust.name,
        phone: cust.phone,
        email: cust.email,
        totalSales,
        totalPaid,
        balanceDue,
        aging: custAging,
        riskLevel,
        lastTransactionDate: lastInv?.date
      };
    });

    const header = this.createHeader(
      "customer-balances",
      "أرصدة وتعمير ذمم العملاء",
      "Customer Balances & Receivables Aging",
      filters,
      userId,
      syncMetadata
    );

    return {
      header,
      summary: {
        totalCustomers: items.length,
        totalReceivables,
        agingSummary: globalAging
      },
      customers: items
    };
  }

  /**
   * 7. SUPPLIER BALANCES & AGING REPORT (أرصدة وتعمير مستحقات الموردين)
   */
  public static async generateSupplierReport(
    filters: ReportFilterParams,
    userId: string
  ): Promise<SupplierReport> {
    const suppliers = await ReportQueryService.getPartners("SUPPLIER", filters);
    const purchases = await ReportQueryService.getInvoices({
      tenantId: filters.tenantId,
      branchId: filters.branchId,
      supplierId: filters.supplierId
    });

    const syncMetadata = ReportQueryService.evaluateSyncState([...suppliers, ...purchases]);
    const today = new Date();

    let totalPayables = 0;
    const globalAging = { current: 0, days31to60: 0, days61to90: 0, daysOver90: 0 };

    const items: SupplierBalanceItem[] = suppliers.map(sup => {
      const supInvoices = purchases.filter(
        i => (i.partnerId === sup.id || (i.partnerType === "SUPPLIER" && i.partnerId === sup.id)) && i.type === "PURCHASE"
      );

      const totalPurchases = supInvoices.reduce((s, i) => s + i.totalAmount, 0);
      const totalPaid = supInvoices.reduce((s, i) => s + i.paidAmount, 0);
      const balanceDue = totalPurchases - totalPaid;

      const supAging = { current: 0, days31to60: 0, days61to90: 0, daysOver90: 0 };

      supInvoices.forEach(inv => {
        const unpaid = inv.totalAmount - inv.paidAmount;
        if (unpaid > 0.01) {
          const invDate = new Date(inv.date);
          const days = Math.ceil((today.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));

          if (days <= 30) supAging.current += unpaid;
          else if (days <= 60) supAging.days31to60 += unpaid;
          else if (days <= 90) supAging.days61to90 += unpaid;
          else supAging.daysOver90 += unpaid;
        }
      });

      totalPayables += balanceDue;
      globalAging.current += supAging.current;
      globalAging.days31to60 += supAging.days31to60;
      globalAging.days61to90 += supAging.days61to90;
      globalAging.daysOver90 += supAging.daysOver90;

      const lastInv = supInvoices.sort((a, b) => (b.date > a.date ? 1 : -1))[0];

      return {
        supplierId: sup.id,
        supplierName: sup.name,
        phone: sup.phone,
        email: sup.email,
        totalPurchases,
        totalPaid,
        balanceDue,
        aging: supAging,
        lastPurchaseDate: lastInv?.date
      };
    });

    const header = this.createHeader(
      "supplier-balances",
      "أرصدة وتعمير مستحقات الموردين",
      "Supplier Balances & Payables Aging",
      filters,
      userId,
      syncMetadata
    );

    return {
      header,
      summary: {
        totalSuppliers: items.length,
        totalPayables,
        agingSummary: globalAging
      },
      suppliers: items
    };
  }

  /**
   * 8. TAX & VAT REPORT (إقرار ضريبة القيمة المضافة)
   */
  public static async generateTaxReport(
    filters: ReportFilterParams,
    userId: string
  ): Promise<TaxReport> {
    const invoices = await ReportQueryService.getInvoices(filters);
    const syncMetadata = ReportQueryService.evaluateSyncState(invoices);

    const sales = invoices.filter(i => i.type === "SALE");
    const purchases = invoices.filter(i => i.type === "PURCHASE");

    const taxableSalesAmount = sales.reduce((s, i) => s + i.subtotal, 0);
    const outputVatAmount = sales.reduce((s, i) => s + i.taxAmount, 0);
    const totalSalesWithVat = sales.reduce((s, i) => s + i.totalAmount, 0);

    const taxablePurchasesAmount = purchases.reduce((s, i) => s + i.subtotal, 0);
    const inputVatAmount = purchases.reduce((s, i) => s + i.taxAmount, 0);
    const totalPurchasesWithVat = purchases.reduce((s, i) => s + i.totalAmount, 0);

    const netVatPayableOrRefund = outputVatAmount - inputVatAmount;
    const status =
      netVatPayableOrRefund > 0.01
        ? "PAYABLE"
        : netVatPayableOrRefund < -0.01
        ? "REFUNDABLE"
        : "BALANCED";

    const header = this.createHeader(
      "tax-report",
      "إقرار ضريبة القيمة المضافة (VAT)",
      "Value Added Tax (VAT) Declaration",
      filters,
      userId,
      syncMetadata
    );

    return {
      header,
      period: {
        start: filters.startDate || "البداية",
        end: filters.endDate || filters.asOfDate || new Date().toISOString().split("T")[0]!
      },
      vatRatePercentage: 15.0,
      salesVat: {
        taxableSalesAmount,
        outputVatAmount,
        exemptSalesAmount: 0,
        zeroRatedSalesAmount: 0,
        totalSalesWithVat
      },
      purchasesVat: {
        taxablePurchasesAmount,
        inputVatAmount,
        exemptPurchasesAmount: 0,
        totalPurchasesWithVat
      },
      netVatPayableOrRefund,
      status
    };
  }

  /**
   * 9. CASH FLOW STATEMENT (قائمة التدفقات النقدية)
   */
  public static async generateCashFlow(
    filters: ReportFilterParams,
    userId: string
  ): Promise<CashFlowReport> {
    const allLines = await ReportQueryService.getJournalLines({
      tenantId: filters.tenantId,
      branchId: filters.branchId
    });

    const syncMetadata = ReportQueryService.evaluateSyncState(allLines);

    // Cash and Bank account codes
    const isCashOrBank = (l: QueriedJournalLine) =>
      l.accountCode.includes("101") ||
      l.accountCode.includes("104") ||
      l.accountName.includes("نقد") ||
      l.accountName.includes("صندوق") ||
      l.accountName.includes("بنك");

    // Starting cash before startDate
    const priorLines = filters.startDate
      ? allLines.filter(l => l.entryDate < filters.startDate! && isCashOrBank(l))
      : [];

    const startingCashAndBank = priorLines.reduce((s, l) => s + (l.debit - l.credit), 0);

    // Period lines
    const periodLines = allLines.filter(l => {
      if (!isCashOrBank(l)) return false;
      if (filters.startDate && l.entryDate < filters.startDate) return false;
      if (filters.endDate && l.entryDate > filters.endDate) return false;
      return true;
    });

    let customerCollections = 0;
    let otherInflows = 0;
    let supplierPayments = 0;
    let operatingExpensesPaid = 0;
    let taxPayments = 0;

    const recentFlows: CashFlowActivity[] = [];

    periodLines.forEach(l => {
      const net = l.debit - l.credit;
      if (net === 0) return;

      const type = net > 0 ? "INFLOW" : "OUTFLOW";
      const absAmount = Math.abs(net);

      if (type === "INFLOW") {
        if (l.sourceType === "SALE" || l.sourceType === "RECEIPT" || l.description.includes("تحصيل") || l.description.includes("عميل")) {
          customerCollections += absAmount;
        } else {
          otherInflows += absAmount;
        }
      } else {
        if (l.sourceType === "PURCHASE" || l.sourceType === "PAYMENT" || l.description.includes("مورد")) {
          supplierPayments += absAmount;
        } else if (l.description.includes("ضريبة") || l.description.includes("vat")) {
          taxPayments += absAmount;
        } else {
          operatingExpensesPaid += absAmount;
        }
      }

      recentFlows.push({
        date: l.entryDate,
        description: l.description,
        type,
        amount: absAmount,
        sourceType: l.sourceType,
        reference: l.entryNumber
      });
    });

    const totalOperatingInflows = customerCollections + otherInflows;
    const totalOperatingOutflows = supplierPayments + operatingExpensesPaid + taxPayments;
    const netOperatingCashFlow = totalOperatingInflows - totalOperatingOutflows;
    const netCashMovement = netOperatingCashFlow;
    const endingCashAndBank = startingCashAndBank + netCashMovement;

    const header = this.createHeader(
      "cash-flow",
      "قائمة التدفقات النقدية المباشرة",
      "Direct Method Statement of Cash Flows",
      filters,
      userId,
      syncMetadata
    );

    return {
      header,
      period: { start: filters.startDate, end: filters.endDate },
      startingCashAndBank,
      operatingInflows: {
        customerCollections,
        otherOperatingInflows: otherInflows,
        totalOperatingInflows
      },
      operatingOutflows: {
        supplierPayments,
        operatingExpensesPaid,
        taxPayments,
        totalOperatingOutflows
      },
      netOperatingCashFlow,
      endingCashAndBank,
      netCashMovement,
      recentFlows: recentFlows.slice(0, 50)
    };
  }

  /**
   * 10. DASHBOARD FINANCIAL KPIS & REAL-TIME INTELLIGENCE
   */
  public static async generateDashboardKPIs(
    filters: ReportFilterParams,
    userId: string
  ): Promise<DashboardKPIsReport> {
    const today = new Date().toISOString().split("T")[0]!;

    const plPeriod = await this.generateProfitLoss(
      { tenantId: filters.tenantId, branchId: filters.branchId, startDate: filters.startDate, endDate: filters.endDate },
      userId
    );

    const plToday = await this.generateProfitLoss(
      { tenantId: filters.tenantId, branchId: filters.branchId, startDate: today, endDate: today },
      userId
    );

    const bs = await this.generateBalanceSheet(
      { tenantId: filters.tenantId, branchId: filters.branchId, asOfDate: today },
      userId
    );

    const inv = await this.generateInventoryValuation(
      { tenantId: filters.tenantId, branchId: filters.branchId },
      userId
    );

    const cust = await this.generateCustomerReport(
      { tenantId: filters.tenantId, branchId: filters.branchId },
      userId
    );

    const sup = await this.generateSupplierReport(
      { tenantId: filters.tenantId, branchId: filters.branchId },
      userId
    );

    const cashOnHand = bs.assets.totalCashAndBank;
    const currentAssets = bs.assets.totalCashAndBank + bs.assets.totalReceivables + bs.assets.totalInventory;
    const currentLiabilities = bs.liabilities.totalLiabilities;
    const netWorkingCapital = currentAssets - currentLiabilities;

    const header = this.createHeader(
      "dashboard-kpis",
      "لوحة المؤشرات والتحليلات المالية المركزية",
      "Executive Financial Dashboard & KPIs",
      filters,
      userId,
      plPeriod.header.syncMetadata
    );

    return {
      header,
      kpis: {
        todayRevenue: plToday.revenue.totalRevenue,
        monthToDateRevenue: plPeriod.revenue.totalRevenue,
        grossProfit: plPeriod.grossProfit,
        netProfit: plPeriod.netProfit,
        totalOperatingExpenses: plPeriod.operatingExpenses.totalExpenses,
        totalInventoryValuation: inv.summary.totalCostValuation,
        totalOutstandingReceivables: cust.summary.totalReceivables,
        totalOutstandingPayables: sup.summary.totalPayables,
        cashOnHand,
        netWorkingCapital
      },
      trends: {
        revenueTrend: [
          { date: today, revenue: plToday.revenue.totalRevenue, profit: plToday.netProfit }
        ],
        expenseBreakdown: plPeriod.operatingExpenses.items.map(e => ({
          category: e.name,
          amount: e.amount,
          percentage:
            plPeriod.operatingExpenses.totalExpenses > 0
              ? (e.amount / plPeriod.operatingExpenses.totalExpenses) * 100
              : 0
        })),
        topSellingProducts: inv.items.slice(0, 5).map(i => ({
          id: i.productId,
          name: i.productName,
          quantity: i.stockQuantity,
          revenue: i.totalSalesValue
        }))
      }
    };
  }
}
