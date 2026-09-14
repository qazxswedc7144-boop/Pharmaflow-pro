// server/services/reporting/reporting.types.ts
// Phase 8.4 Enterprise Financial Reporting Engine Type Definitions

export type ReportType =
  | "balance-sheet"
  | "profit-loss"
  | "trial-balance"
  | "general-ledger"
  | "inventory-valuation"
  | "customer-balances"
  | "supplier-balances"
  | "tax-report"
  | "cash-flow"
  | "aging-customer"
  | "aging-supplier"
  | "branch-consolidation"
  | "dashboard-kpis";

export type ExportFormat = "PDF" | "EXCEL" | "CSV" | "PRINT";

export type ReportingSyncTag =
  | "CLOUD_AUTHORITATIVE"
  | "SYNCED"
  | "LOCAL_UNSYNCED"
  | "PARTIALLY_SYNCED"
  | "CONFLICTED";

export interface ReportFilterParams {
  tenantId: string;
  branchId?: string | null;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  accountId?: string;
  customerId?: string;
  supplierId?: string;
  productId?: string;
  category?: string;
  status?: string;
  includeUnsynced?: boolean;
  authoritativeOnly?: boolean;
  excludeConflicted?: boolean;
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface ReportSyncMetadata {
  overallState: ReportingSyncTag;
  hasUnsyncedData: boolean;
  hasConflictedData: boolean;
  syncWarningArabic?: string;
  syncWarningEnglish?: string;
  authoritativeRecordsCount: number;
  syncedRecordsCount: number;
  unsyncedRecordsCount: number;
  conflictedRecordsCount: number;
  asOfServerTimestamp: number;
}

export interface ReportHeaderMetadata {
  reportId: string;
  reportType: ReportType;
  reportTitleArabic: string;
  reportTitleEnglish: string;
  tenantId: string;
  tenantName?: string;
  branchId?: string | null;
  branchName?: string;
  generatedByUserId: string;
  generatedByUserName?: string;
  generatedAt: string;
  periodStart?: string;
  periodEnd?: string;
  currency: string;
  syncMetadata: ReportSyncMetadata;
  fromCache?: boolean;
}

// 1. BALANCE SHEET
export interface BalanceSheetItem {
  id: string;
  code: string;
  name: string;
  category: "ASSET" | "LIABILITY" | "EQUITY";
  subcategory?: string;
  amount: number;
}

export interface BalanceSheetReport {
  header: ReportHeaderMetadata;
  asOfDate: string;
  assets: {
    cashAndEquivalents: BalanceSheetItem[];
    accountsReceivable: BalanceSheetItem[];
    inventoryValuation: BalanceSheetItem[];
    otherAssets: BalanceSheetItem[];
    totalCashAndBank: number;
    totalReceivables: number;
    totalInventory: number;
    totalAssets: number;
  };
  liabilities: {
    accountsPayable: BalanceSheetItem[];
    shortTermLiabilities: BalanceSheetItem[];
    longTermLiabilities: BalanceSheetItem[];
    totalPayables: number;
    totalLiabilities: number;
  };
  equity: {
    capital: BalanceSheetItem[];
    retainedEarnings: number;
    currentPeriodProfit: number;
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  discrepancy: number;
}

// 2. PROFIT & LOSS STATEMENT
export interface ProfitLossReport {
  header: ReportHeaderMetadata;
  period: { start: string; end: string };
  revenue: {
    salesRevenue: number;
    returnsAndDiscounts: number;
    netSalesRevenue: number;
    otherIncome: number;
    totalRevenue: number;
    items: { id: string; code: string; name: string; amount: number }[];
  };
  costOfGoodsSold: {
    beginningInventory: number;
    purchases: number;
    endingInventory: number;
    cogsAmount: number;
    items: { id: string; code: string; name: string; amount: number }[];
  };
  grossProfit: number;
  grossMarginPercentage: number;
  operatingExpenses: {
    salariesAndWages: number;
    rentAndUtilities: number;
    administrative: number;
    depreciation: number;
    otherExpenses: number;
    totalExpenses: number;
    items: { id: string; code: string; name: string; amount: number }[];
  };
  operatingProfit: number;
  netProfit: number;
  netMarginPercentage: number;
}

// 3. TRIAL BALANCE
export interface TrialBalanceItem {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  endingDebit: number;
  endingCredit: number;
  netBalance: number;
}

export interface TrialBalanceReport {
  header: ReportHeaderMetadata;
  period: { start?: string; end?: string };
  accounts: TrialBalanceItem[];
  totals: {
    openingDebitTotal: number;
    openingCreditTotal: number;
    periodDebitTotal: number;
    periodCreditTotal: number;
    endingDebitTotal: number;
    endingCreditTotal: number;
    isBalanced: boolean;
    difference: number;
  };
}

// 4. GENERAL LEDGER
export interface GeneralLedgerTransaction {
  id: string;
  date: string;
  entryNumber: string;
  sourceType: string;
  sourceId?: string;
  reference?: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  branchId?: string | null;
  branchName?: string;
}

export interface GeneralLedgerAccountStatement {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
  transactions: GeneralLedgerTransaction[];
}

export interface GeneralLedgerReport {
  header: ReportHeaderMetadata;
  period: { start?: string; end?: string };
  accounts: GeneralLedgerAccountStatement[];
  summary: {
    totalAccounts: number;
    overallDebits: number;
    overallCredits: number;
  };
}

// 5. INVENTORY VALUATION
export interface InventoryValuationItem {
  id: string;
  productId: string;
  productName: string;
  barcode: string;
  sku: string;
  category: string;
  stockQuantity: number;
  unitCost: number;
  unitPrice: number;
  totalCostValue: number;
  totalSalesValue: number;
  unrealizedProfit: number;
  profitMarginPercent: number;
  expiryStatus: "VALID" | "NEAR_EXPIRY" | "EXPIRED";
  nearestExpiryDate?: string;
  branchId?: string | null;
}

export interface InventoryValuationReport {
  header: ReportHeaderMetadata;
  valuationMethod: "FIFO" | "WEIGHTED_AVERAGE";
  summary: {
    totalItemsCount: number;
    totalStockUnits: number;
    totalCostValuation: number;
    totalSalesPotential: number;
    totalUnrealizedProfit: number;
    nearExpiryValue: number;
    expiredValue: number;
  };
  items: InventoryValuationItem[];
}

// 6. CUSTOMER REPORT & AGING
export interface CustomerBalanceItem {
  customerId: string;
  customerName: string;
  phone?: string;
  email?: string;
  totalSales: number;
  totalPaid: number;
  balanceDue: number;
  aging: {
    current: number; // 0-30 days
    days31to60: number;
    days61to90: number;
    daysOver90: number;
  };
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  lastTransactionDate?: string;
}

export interface CustomerReport {
  header: ReportHeaderMetadata;
  summary: {
    totalCustomers: number;
    totalReceivables: number;
    agingSummary: {
      current: number;
      days31to60: number;
      days61to90: number;
      daysOver90: number;
    };
  };
  customers: CustomerBalanceItem[];
}

// 7. SUPPLIER REPORT & AGING
export interface SupplierBalanceItem {
  supplierId: string;
  supplierName: string;
  phone?: string;
  email?: string;
  totalPurchases: number;
  totalPaid: number;
  balanceDue: number;
  aging: {
    current: number;
    days31to60: number;
    days61to90: number;
    daysOver90: number;
  };
  lastPurchaseDate?: string;
}

export interface SupplierReport {
  header: ReportHeaderMetadata;
  summary: {
    totalSuppliers: number;
    totalPayables: number;
    agingSummary: {
      current: number;
      days31to60: number;
      days61to90: number;
      daysOver90: number;
    };
  };
  suppliers: SupplierBalanceItem[];
}

// 8. TAX & VAT REPORT
export interface TaxReport {
  header: ReportHeaderMetadata;
  period: { start: string; end: string };
  vatRatePercentage: number;
  salesVat: {
    taxableSalesAmount: number;
    outputVatAmount: number;
    exemptSalesAmount: number;
    zeroRatedSalesAmount: number;
    totalSalesWithVat: number;
  };
  purchasesVat: {
    taxablePurchasesAmount: number;
    inputVatAmount: number;
    exemptPurchasesAmount: number;
    totalPurchasesWithVat: number;
  };
  netVatPayableOrRefund: number; // Positive = Due to ZATCA / Tax authority, Negative = Refundable
  status: "PAYABLE" | "REFUNDABLE" | "BALANCED";
}

// 9. CASH FLOW STATEMENT
export interface CashFlowActivity {
  date: string;
  description: string;
  type: "INFLOW" | "OUTFLOW";
  amount: number;
  sourceType: string;
  reference?: string;
}

export interface CashFlowReport {
  header: ReportHeaderMetadata;
  period: { start?: string; end?: string };
  startingCashAndBank: number;
  operatingInflows: {
    customerCollections: number;
    otherOperatingInflows: number;
    totalOperatingInflows: number;
  };
  operatingOutflows: {
    supplierPayments: number;
    operatingExpensesPaid: number;
    taxPayments: number;
    totalOperatingOutflows: number;
  };
  netOperatingCashFlow: number;
  endingCashAndBank: number;
  netCashMovement: number;
  recentFlows: CashFlowActivity[];
}

// 10. FINANCIAL DASHBOARD KPIS
export interface DashboardKPIsReport {
  header: ReportHeaderMetadata;
  kpis: {
    todayRevenue: number;
    monthToDateRevenue: number;
    grossProfit: number;
    netProfit: number;
    totalOperatingExpenses: number;
    totalInventoryValuation: number;
    totalOutstandingReceivables: number;
    totalOutstandingPayables: number;
    cashOnHand: number;
    netWorkingCapital: number;
  };
  trends: {
    revenueTrend: { date: string; revenue: number; profit: number }[];
    expenseBreakdown: { category: string; amount: number; percentage: number }[];
    topSellingProducts: { id: string; name: string; quantity: number; revenue: number }[];
  };
}
