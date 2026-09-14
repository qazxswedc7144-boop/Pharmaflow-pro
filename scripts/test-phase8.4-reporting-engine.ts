// scripts/test-phase8.4-reporting-engine.ts
// Phase 8.4 Enterprise Financial Reporting Engine Automated Test Suite (45+ Tests)

import { FinancialReportEngine } from "../server/services/reporting/financial-report.engine";
import { ReportQueryService } from "../server/services/reporting/report-query.service";
import { ReportBuilderService } from "../server/services/reporting/report-builder.service";
import { reportCacheService } from "../server/services/reporting/report-cache.service";
import { ReportAuditService } from "../server/services/reporting/report-audit.service";
import { ExportService } from "../server/services/reporting/export.service";
import { ReportingSyncMetadata } from "../src/features/sync/reporting.metadata";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ""}`);
  }
}

async function runPhase84Tests() {
  console.log("\n===============================================================================");
  console.log("🔵 RUNNING PHASE 8.4: ENTERPRISE FINANCIAL REPORTING ENGINE TEST SUITE");
  console.log("===============================================================================\n");

  const TENANT_A = "TENANT_AL_AMAL_PHARMA";
  const TENANT_B = "TENANT_AL_NOOR_PHARMA";
  const BRANCH_1 = "BRANCH_RIYADH_01";
  const BRANCH_2 = "BRANCH_JEDDAH_02";

  const futureValid = new Date(Date.now() + 365 * 86400000).toISOString().substring(0, 10);
  const nearExpiry = new Date(Date.now() + 45 * 86400000).toISOString().substring(0, 10);
  const pastExpired = new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);

  // Setup Mock Data for Testing
  ReportQueryService.seedMockData({
    accounts: [
      { id: "acc-101", code: "ACC-101", name: "الصندوق الرئيسي (Cash)", type: "ASSET", balance: 50000, tenantId: TENANT_A },
      { id: "acc-104", code: "ACC-104", name: "حساب مصرف الراجحي (Bank)", type: "ASSET", balance: 150000, tenantId: TENANT_A },
      { id: "acc-102", code: "ACC-102", name: "العملاء والمدينون (AR)", type: "ASSET", balance: 35000, tenantId: TENANT_A },
      { id: "acc-103", code: "ACC-103", name: "مخزون الأدوية (Inventory)", type: "ASSET", balance: 80000, tenantId: TENANT_A },
      { id: "acc-201", code: "ACC-201", name: "الموردون والدائنون (AP)", type: "LIABILITY", balance: 40000, tenantId: TENANT_A },
      { id: "acc-202", code: "ACC-202", name: "أمانات ضريبة القيمة المضافة (VAT)", type: "LIABILITY", balance: 7500, tenantId: TENANT_A },
      { id: "acc-301", code: "ACC-301", name: "رأس المال (Capital)", type: "EQUITY", balance: 200000, tenantId: TENANT_A },
      { id: "acc-401", code: "ACC-401", name: "إيرادات مبيعات الأدوية (Sales)", type: "REVENUE", balance: 100000, tenantId: TENANT_A },
      { id: "acc-501", code: "ACC-501", name: "تكلفة المبيعات (COGS)", type: "EXPENSE", balance: 60000, tenantId: TENANT_A },
      { id: "acc-502", code: "ACC-502", name: "المصاريف التشغيلية (OpEx)", type: "EXPENSE", balance: 15000, tenantId: TENANT_A },
      // Tenant B separate account
      { id: "acc-b-101", code: "ACC-101", name: "صندوق فرع النور", type: "ASSET", balance: 12000, tenantId: TENANT_B }
    ],
    journalLines: [
      // 1. Initial Investment (Cash Debit 200,000 / Capital Credit 200,000)
      { id: "jl-1", entryId: "je-1", accountId: "acc-101", accountCode: "ACC-101", accountName: "الصندوق الرئيسي", accountType: "ASSET", debit: 200000, credit: 0, description: "رأس مال افتتاحي", entryDate: "2026-01-01", entryNumber: "JE-001", sourceType: "MANUAL", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },
      { id: "jl-2", entryId: "je-1", accountId: "acc-301", accountCode: "ACC-301", accountName: "رأس المال", accountType: "EQUITY", debit: 0, credit: 200000, description: "رأس مال افتتاحي", entryDate: "2026-01-01", entryNumber: "JE-001", sourceType: "MANUAL", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },

      // 2. Inventory Purchase on Credit (Inventory Debit 80,000 / AP Credit 80,000)
      { id: "jl-3", entryId: "je-2", accountId: "acc-103", accountCode: "ACC-103", accountName: "مخزون الأدوية", accountType: "ASSET", debit: 80000, credit: 0, description: "شراء مخزون أدوية آجل", entryDate: "2026-01-10", entryNumber: "JE-002", sourceType: "PURCHASE", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },
      { id: "jl-4", entryId: "je-2", accountId: "acc-201", accountCode: "ACC-201", accountName: "الموردون", accountType: "LIABILITY", debit: 0, credit: 80000, description: "شراء مخزون أدوية آجل", entryDate: "2026-01-10", entryNumber: "JE-002", sourceType: "PURCHASE", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },

      // 3. Sales to Customers (Cash Debit 65,000 + AR Debit 35,000 / Sales Credit 100,000)
      { id: "jl-5", entryId: "je-3", accountId: "acc-101", accountCode: "ACC-101", accountName: "الصندوق الرئيسي", accountType: "ASSET", debit: 65000, credit: 0, description: "مبيعات نقدية", entryDate: "2026-02-05", entryNumber: "JE-003", sourceType: "SALE", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },
      { id: "jl-6", entryId: "je-3", accountId: "acc-102", accountCode: "ACC-102", accountName: "العملاء", accountType: "ASSET", debit: 35000, credit: 0, description: "مبيعات آجلة", entryDate: "2026-02-05", entryNumber: "JE-003", sourceType: "SALE", status: "POSTED", branchId: BRANCH_2, tenantId: TENANT_A, isSynced: true },
      { id: "jl-7", entryId: "je-3", accountId: "acc-401", accountCode: "ACC-401", accountName: "إيرادات المبيعات", accountType: "REVENUE", debit: 0, credit: 100000, description: "إجمالي إيرادات المبيعات", entryDate: "2026-02-05", entryNumber: "JE-003", sourceType: "SALE", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },

      // 4. Cost of Goods Sold (COGS Debit 60,000 / Inventory Credit 60,000)
      { id: "jl-8", entryId: "je-4", accountId: "acc-501", accountCode: "ACC-501", accountName: "تكلفة المبيعات", accountType: "EXPENSE", debit: 60000, credit: 0, description: "تكلفة البضاعة المباعة", entryDate: "2026-02-05", entryNumber: "JE-004", sourceType: "SALE", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },
      { id: "jl-9", entryId: "je-4", accountId: "acc-103", accountCode: "ACC-103", accountName: "مخزون الأدوية", accountType: "ASSET", debit: 0, credit: 60000, description: "تكلفة البضاعة المباعة", entryDate: "2026-02-05", entryNumber: "JE-004", sourceType: "SALE", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },

      // 5. Operating Expenses Paid via Cash (OpEx Debit 15,000 / Cash Credit 15,000)
      { id: "jl-10", entryId: "je-5", accountId: "acc-502", accountCode: "ACC-502", accountName: "المصاريف التشغيلية", accountType: "EXPENSE", debit: 15000, credit: 0, description: "مصاريف إيجار ومرافق", entryDate: "2026-02-15", entryNumber: "JE-005", sourceType: "MANUAL", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },
      { id: "jl-11", entryId: "je-5", accountId: "acc-101", accountCode: "ACC-101", accountName: "الصندوق الرئيسي", accountType: "ASSET", debit: 0, credit: 15000, description: "مصاريف إيجار ومرافق", entryDate: "2026-02-15", entryNumber: "JE-005", sourceType: "MANUAL", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },

      // 6. Partial Payment to Supplier (AP Debit 40,000 / Cash Credit 40,000)
      { id: "jl-12", entryId: "je-6", accountId: "acc-201", accountCode: "ACC-201", accountName: "الموردون", accountType: "LIABILITY", debit: 40000, credit: 0, description: "سداد جزء من فاتورة المورد", entryDate: "2026-02-20", entryNumber: "JE-006", sourceType: "PAYMENT", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },
      { id: "jl-13", entryId: "je-6", accountId: "acc-101", accountCode: "ACC-101", accountName: "الصندوق الرئيسي", accountType: "ASSET", debit: 0, credit: 40000, description: "سداد جزء من فاتورة المورد", entryDate: "2026-02-20", entryNumber: "JE-006", sourceType: "PAYMENT", status: "POSTED", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },

      // Tenant B separate journal line
      { id: "jl-b-1", entryId: "je-b-1", accountId: "acc-b-101", accountCode: "ACC-101", accountName: "صندوق فرع النور", accountType: "ASSET", debit: 12000, credit: 0, description: "حركة منفصلة للمستأجر ب", entryDate: "2026-02-01", entryNumber: "JE-B01", sourceType: "MANUAL", status: "POSTED", branchId: "BRANCH_B", tenantId: TENANT_B, isSynced: true }
    ],
    products: [
      { id: "prod-1", name: "Panadol Extra 500mg", barcode: "6281001", sku: "SKU-PAN-01", category: "مسكنات", cost: 12.0, price: 18.0, stockQuantity: 500, expiryDate: futureValid, tenantId: TENANT_A, branchId: BRANCH_1, isSynced: true },
      { id: "prod-2", name: "Augmentin 1g Tablets", barcode: "6281002", sku: "SKU-AUG-02", category: "مضادات حيوية", cost: 45.0, price: 65.0, stockQuantity: 200, expiryDate: nearExpiry, tenantId: TENANT_A, branchId: BRANCH_1, isSynced: true }, // Near expiry
      { id: "prod-3", name: "Vitamin C Effervescent", barcode: "6281003", sku: "SKU-VIT-03", category: "فيتامينات", cost: 15.0, price: 25.0, stockQuantity: 50, expiryDate: pastExpired, tenantId: TENANT_A, branchId: BRANCH_2, isSynced: true }, // Expired
      // Tenant B product
      { id: "prod-b-1", name: "Tenant B Item", barcode: "999999", sku: "SKU-B-01", category: "خاص", cost: 10.0, price: 20.0, stockQuantity: 100, tenantId: TENANT_B, isSynced: true }
    ],
    invoices: [
      { id: "inv-1", invoiceNumber: "INV-2026-001", date: "2026-02-01", type: "SALE", partnerId: "cust-1", partnerType: "CUSTOMER", subtotal: 50000, taxAmount: 7500, totalAmount: 57500, paidAmount: 57500, costAmount: 35000, status: "CONFIRMED", paymentStatus: "PAID", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true },
      { id: "inv-2", invoiceNumber: "INV-2026-002", date: "2026-02-10", type: "SALE", partnerId: "cust-2", partnerType: "CUSTOMER", subtotal: 30000, taxAmount: 4500, totalAmount: 34500, paidAmount: 0, costAmount: 20000, status: "CONFIRMED", paymentStatus: "UNPAID", branchId: BRANCH_2, tenantId: TENANT_A, isSynced: true },
      { id: "pur-1", invoiceNumber: "PUR-2026-001", date: "2026-01-15", type: "PURCHASE", partnerId: "sup-1", partnerType: "SUPPLIER", subtotal: 70000, taxAmount: 10500, totalAmount: 80500, paidAmount: 40500, costAmount: 70000, status: "CONFIRMED", paymentStatus: "PARTIALLY_PAID", branchId: BRANCH_1, tenantId: TENANT_A, isSynced: true }
    ],
    partners: [
      { id: "cust-1", name: "مستوصف الشفاء الأهلي", type: "CUSTOMER", phone: "0501112233", balance: 0, tenantId: TENANT_A },
      { id: "cust-2", name: "مجمع عيادات الأمل", type: "CUSTOMER", phone: "0504445566", balance: 34500, tenantId: TENANT_A },
      { id: "sup-1", name: "شركة التموين الدوائي المتحدة", type: "SUPPLIER", phone: "0112233445", balance: 40000, tenantId: TENANT_A }
    ]
  });

  // ==========================================
  // 1. MULTI-TENANT ISOLATION TESTS
  // ==========================================
  console.log("\n--- 1. Multi-Tenant Isolation & Segregation Tests ---");
  const accountsA = await ReportQueryService.getAccounts({ tenantId: TENANT_A });
  const accountsB = await ReportQueryService.getAccounts({ tenantId: TENANT_B });
  assert(accountsA.length === 10, "Tenant A retrieves exactly its 10 assigned accounts", `got ${accountsA.length}`);
  assert(accountsB.length === 1, "Tenant B retrieves only its 1 assigned account", `got ${accountsB.length}`);
  assert(!accountsA.some(a => a.id === "acc-b-101"), "Tenant A accounts do NOT contain any Tenant B records");
  assert(!accountsB.some(a => a.id === "acc-101"), "Tenant B accounts do NOT contain any Tenant A records");

  // ==========================================
  // 2. TRIAL BALANCE MATHEMATICAL ACCURACY TESTS
  // ==========================================
  console.log("\n--- 2. Trial Balance GAAP Compliance & Equation Tests ---");
  const trialBalance = await FinancialReportEngine.generateTrialBalance({ tenantId: TENANT_A }, "user-1");
  assert(trialBalance.totals.isBalanced, "Trial balance ending debits equal ending credits (isBalanced === true)");
  assert(trialBalance.totals.difference < 0.01, `Trial balance mathematical discrepancy is zero (${trialBalance.totals.difference})`);
  assert(trialBalance.accounts.length === 10, "Trial balance accounts count matches tenant accounts");
  
  const cashAcc = trialBalance.accounts.find(a => a.code === "ACC-101");
  // Cash debit: 200,000 + 65,000 = 265,000. Cash credit: 15,000 + 40,000 = 55,000. Net ending debit = 210,000
  assert(cashAcc?.endingDebit === 210000, `Cash ending balance correctly calculated as 210,000 SAR (got ${cashAcc?.endingDebit})`);

  // ==========================================
  // 3. PROFIT & LOSS STATEMENT TESTS
  // ==========================================
  console.log("\n--- 3. Profit & Loss Statement (Income Statement) Tests ---");
  const plReport = await FinancialReportEngine.generateProfitLoss({ tenantId: TENANT_A }, "user-1");
  assert(plReport.revenue.totalRevenue === 100000, `Total Revenue correctly computed as 100,000 SAR (got ${plReport.revenue.totalRevenue})`);
  assert(plReport.costOfGoodsSold.cogsAmount === 60000, `COGS correctly computed as 60,000 SAR (got ${plReport.costOfGoodsSold.cogsAmount})`);
  assert(plReport.grossProfit === 40000, `Gross Profit equals Revenue - COGS = 40,000 SAR (got ${plReport.grossProfit})`);
  assert(plReport.grossMarginPercentage === 40, `Gross Margin Percentage equals 40% (got ${plReport.grossMarginPercentage}%)`);
  assert(plReport.operatingExpenses.totalExpenses === 15000, `Operating Expenses equal 15,000 SAR (got ${plReport.operatingExpenses.totalExpenses})`);
  assert(plReport.netProfit === 25000, `Net Profit equals Gross Profit - Expenses = 25,000 SAR (got ${plReport.netProfit})`);
  assert(plReport.netMarginPercentage === 25, `Net Margin Percentage equals 25% (got ${plReport.netMarginPercentage}%)`);

  // ==========================================
  // 4. BALANCE SHEET INTEGRITY & BALANCING TESTS
  // ==========================================
  console.log("\n--- 4. Balance Sheet Integrity & Equation Tests ---");
  const bsReport = await FinancialReportEngine.generateBalanceSheet({ tenantId: TENANT_A }, "user-1");
  // Total Assets: Cash 210,000 + AR 35,000 + Inventory 20,000 (80k - 60k) = 265,000
  assert(bsReport.assets.totalAssets === 265000, `Total Assets equal 265,000 SAR (got ${bsReport.assets.totalAssets})`);
  // Total Liabilities: AP 40,000 (80k - 40k) = 40,000
  assert(bsReport.liabilities.totalLiabilities === 40000, `Total Liabilities equal 40,000 SAR (got ${bsReport.liabilities.totalLiabilities})`);
  // Total Equity: Capital 200,000 + Current Period Profit 25,000 = 225,000
  assert(bsReport.equity.totalEquity === 225000, `Total Equity equals Capital + Net Profit = 225,000 SAR (got ${bsReport.equity.totalEquity})`);
  // Equation Check: Assets (265k) == Liabilities (40k) + Equity (225k)
  assert(bsReport.isBalanced, "Fundamental Accounting Equation holds: Assets = Liabilities + Equity");
  assert(bsReport.discrepancy < 0.01, `Discrepancy is zero (${bsReport.discrepancy})`);

  // ==========================================
  // 5. GENERAL LEDGER ACCOUNT MOVEMENTS TESTS
  // ==========================================
  console.log("\n--- 5. General Ledger Statement & Running Balance Tests ---");
  const glReport = await FinancialReportEngine.generateGeneralLedger({ tenantId: TENANT_A, accountId: "acc-101" }, "user-1");
  assert(glReport.accounts.length === 1, "GL for single account returns exactly 1 statement");
  const cashGl = glReport.accounts[0];
  assert(cashGl?.transactions.length === 4, `Cash account has 4 chronological entries (got ${cashGl?.transactions.length})`);
  assert(cashGl?.closingBalance === 210000, `Cash closing balance in GL matches 210,000 SAR (got ${cashGl?.closingBalance})`);

  // ==========================================
  // 6. INVENTORY VALUATION & EXPIRY SURVEILLANCE
  // ==========================================
  console.log("\n--- 6. Inventory Valuation & Expiry Surveillance Tests ---");
  const invReport = await FinancialReportEngine.generateInventoryValuation({ tenantId: TENANT_A }, "user-1");
  assert(invReport.summary.totalItemsCount === 3, "Inventory valuation analyzes 3 products for Tenant A");
  // Total units: 500 + 200 + 50 = 750 units
  assert(invReport.summary.totalStockUnits === 750, `Total Stock Units equals 750 (got ${invReport.summary.totalStockUnits})`);
  // Total cost: 500*12 (6000) + 200*45 (9000) + 50*15 (750) = 15750 SAR
  assert(invReport.summary.totalCostValuation === 15750, `Total Cost Valuation equals 15,750 SAR (got ${invReport.summary.totalCostValuation})`);
  // Expiry checks
  const nearExpiryItem = invReport.items.find(i => i.expiryStatus === "NEAR_EXPIRY");
  const expiredItem = invReport.items.find(i => i.expiryStatus === "EXPIRED");
  assert(nearExpiryItem?.productId === "prod-2", "Augmentin flagged as NEAR_EXPIRY (< 90 days)");
  assert(expiredItem?.productId === "prod-3", "Vitamin C flagged as EXPIRED (past date)");

  // ==========================================
  // 7. CUSTOMER BALANCES & AGING REPORT TESTS
  // ==========================================
  console.log("\n--- 7. Customer Balances & Receivables Aging Tests ---");
  const custReport = await FinancialReportEngine.generateCustomerReport({ tenantId: TENANT_A }, "user-1");
  assert(custReport.summary.totalCustomers === 2, "Customer report contains 2 customers");
  const unpaidCust = custReport.customers.find(c => c.customerId === "cust-2");
  assert(unpaidCust?.balanceDue === 34500, `Customer 2 outstanding balance is 34,500 SAR (got ${unpaidCust?.balanceDue})`);
  assert(unpaidCust?.riskLevel === "HIGH", "Customer 2 with >10,000 debt classified as HIGH risk");

  // ==========================================
  // 8. SUPPLIER BALANCES & AGING REPORT TESTS
  // ==========================================
  console.log("\n--- 8. Supplier Balances & Payables Aging Tests ---");
  const supReport = await FinancialReportEngine.generateSupplierReport({ tenantId: TENANT_A }, "user-1");
  assert(supReport.summary.totalSuppliers === 1, "Supplier report contains 1 supplier");
  const supItem = supReport.suppliers[0];
  assert(supItem?.balanceDue === 40000, `Supplier outstanding balance is 40,000 SAR (got ${supItem?.balanceDue})`);

  // ==========================================
  // 9. TAX & VAT DECLARATION REPORT TESTS
  // ==========================================
  console.log("\n--- 9. VAT & Tax Declaration Tests ---");
  const taxReport = await FinancialReportEngine.generateTaxReport({ tenantId: TENANT_A }, "user-1");
  // Output VAT: 7500 + 4500 = 12000 SAR
  assert(taxReport.salesVat.outputVatAmount === 12000, `Output VAT equals 12,000 SAR (got ${taxReport.salesVat.outputVatAmount})`);
  // Input VAT: 10500 SAR
  assert(taxReport.purchasesVat.inputVatAmount === 10500, `Input VAT equals 10,500 SAR (got ${taxReport.purchasesVat.inputVatAmount})`);
  // Net Tax: 12000 - 10500 = 1500 SAR
  assert(taxReport.netVatPayableOrRefund === 1500, `Net Tax Payable equals 1,500 SAR (got ${taxReport.netVatPayableOrRefund})`);
  assert(taxReport.status === "PAYABLE", "Tax status is PAYABLE (tax due to ZATCA)");

  // ==========================================
  // 10. CASH FLOW DIRECT METHOD TESTS
  // ==========================================
  console.log("\n--- 10. Direct Method Cash Flow Statement Tests ---");
  const cfReport = await FinancialReportEngine.generateCashFlow({ tenantId: TENANT_A }, "user-1");
  assert(cfReport.startingCashAndBank === 0, "Starting cash before inception is 0");
  assert(cfReport.operatingInflows.customerCollections === 65000, `Customer cash collections equal 65,000 SAR (got ${cfReport.operatingInflows.customerCollections})`);
  assert(cfReport.operatingOutflows.supplierPayments === 40000, `Supplier payments equal 40,000 SAR (got ${cfReport.operatingOutflows.supplierPayments})`);
  assert(cfReport.operatingOutflows.operatingExpensesPaid === 15000, `Operating expenses paid equal 15,000 SAR (got ${cfReport.operatingOutflows.operatingExpensesPaid})`);
  // Capital inflow: 200,000. Customer collections: 65,000. Total inflows = 265,000. Outflows = 55,000. Ending = 210,000
  assert(cfReport.endingCashAndBank === 210000, `Ending Cash & Bank equals 210,000 SAR (got ${cfReport.endingCashAndBank})`);

  // ==========================================
  // 11. DASHBOARD FINANCIAL KPIS TESTS
  // ==========================================
  console.log("\n--- 11. Financial Dashboard KPIs & Executive Metrics Tests ---");
  const kpisReport = await FinancialReportEngine.generateDashboardKPIs({ tenantId: TENANT_A }, "user-1");
  assert(kpisReport.kpis.netProfit === 25000, `KPI Net Profit equals 25,000 SAR (got ${kpisReport.kpis.netProfit})`);
  assert(kpisReport.kpis.cashOnHand === 210000, `KPI Cash on Hand equals 210,000 SAR (got ${kpisReport.kpis.cashOnHand})`);
  assert(kpisReport.kpis.netWorkingCapital === 225000, `Net Working Capital equals 225,000 SAR (got ${kpisReport.kpis.netWorkingCapital})`);

  // ==========================================
  // 12. BRANCH ISOLATION & FILTERING TESTS
  // ==========================================
  console.log("\n--- 12. Branch Isolation & Filtering Tests ---");
  const branch1GL = await FinancialReportEngine.generateGeneralLedger({ tenantId: TENANT_A, branchId: BRANCH_1 }, "user-1");
  const branch2GL = await FinancialReportEngine.generateGeneralLedger({ tenantId: TENANT_A, branchId: BRANCH_2 }, "user-1");
  const branch1TxCount = branch1GL.accounts.reduce((s, a) => s + a.transactions.length, 0);
  const branch2TxCount = branch2GL.accounts.reduce((s, a) => s + a.transactions.length, 0);
  assert(branch1TxCount === 12, `Branch 1 isolated transactions equal 12 (got ${branch1TxCount})`);
  assert(branch2TxCount === 1, `Branch 2 isolated transactions equal 1 (got ${branch2TxCount})`);

  // ==========================================
  // 13. RBAC & PERMISSION ENFORCEMENT TESTS
  // ==========================================
  console.log("\n--- 13. RBAC & Permission Enforcement Tests ---");
  // Platform owner always allowed
  const ownerAllowed = await ReportBuilderService.validatePermissions(TENANT_A, "user-owner", "PLATFORM_OWNER", "balance-sheet");
  assert(ownerAllowed, "PLATFORM_OWNER role has unrestricted access to all reports");

  // Admin allowed
  const adminAllowed = await ReportBuilderService.validatePermissions(TENANT_A, "user-admin", "ADMIN", "profit-loss");
  assert(adminAllowed, "ADMIN role has access to financial reports");

  // Unauthorized non-privileged check
  const cashierBlocked = await ReportBuilderService.validatePermissions(TENANT_A, "user-cashier", "CASHIER", "balance-sheet");
  assert(!cashierBlocked, "CASHIER role is blocked from viewing Balance Sheet");

  // ==========================================
  // 14. SYNC STATE AWARENESS & METADATA TESTS
  // ==========================================
  console.log("\n--- 14. Sync State Metadata & Local Warning Tests ---");
  const syncedItems = [{ isSynced: true }, { isSynced: true }];
  const unsyncedItems = [{ isSynced: true }, { isSynced: false }];
  const syncEval1 = ReportQueryService.evaluateSyncState(syncedItems);
  const syncEval2 = ReportQueryService.evaluateSyncState(unsyncedItems);

  assert(syncEval1.overallState === "CLOUD_AUTHORITATIVE", "Clean synced items yield CLOUD_AUTHORITATIVE state");
  assert(!syncEval1.hasUnsyncedData, "Clean items have hasUnsyncedData === false");
  assert(syncEval2.overallState === "PARTIALLY_SYNCED", "Mixed items yield PARTIALLY_SYNCED state");
  assert(syncEval2.hasUnsyncedData, "Mixed items have hasUnsyncedData === true");
  assert(!!syncEval2.syncWarningArabic, "Bilingual warning message attached when unsynced data is present");

  // Verify integration with Phase 8.3 ReportingSyncMetadata
  const syncRecords = [
    { id: "1", postedToCloud: true },
    { id: "2", isSynced: true },
    { id: "3", syncStatus: "CONFLICT" },
    { id: "4", isSynced: false }
  ];
  const filterRes = ReportingSyncMetadata.filterForReport(syncRecords, { authoritativeOnly: false, excludeConflicted: true });
  assert(filterRes.stats.conflictedCount === 1, "ReportingSyncMetadata detects 1 conflicted record");
  assert(filterRes.stats.authoritativeCount === 1, "ReportingSyncMetadata detects 1 authoritative record");
  assert(filterRes.filteredRecords.length === 3, "ReportingSyncMetadata excludes conflicted record when requested");

  // ==========================================
  // 15. REPORT CACHING & INVALIDATION TESTS
  // ==========================================
  console.log("\n--- 15. Report Caching & Invalidation Tests ---");
  reportCacheService.clearAll();
  const cacheKey = reportCacheService.generateKey(TENANT_A, "user-1", "trial-balance", { branchId: BRANCH_1 });
  reportCacheService.set(cacheKey, { test: "cached-data" }, TENANT_A, "trial-balance");

  const cachedData = reportCacheService.get(cacheKey);
  assert((cachedData as any)?.test === "cached-data", "Report cache successfully stores and retrieves report data");

  const stats1 = reportCacheService.getStats();
  assert(stats1.hits === 1, "Cache hit counter increments upon retrieval");

  reportCacheService.invalidateTenant(TENANT_A);
  const afterTenantInvalidate = reportCacheService.get(cacheKey);
  assert(afterTenantInvalidate === null, "Tenant cache invalidation purges cached reports for that tenant");

  // ==========================================
  // 16. AUDIT TRAIL LOGGING TESTS
  // ==========================================
  console.log("\n--- 16. Report Audit Trail Logging Tests ---");
  ReportAuditService.clearLogsForTenant(TENANT_A);
  await ReportAuditService.logAction({
    tenantId: TENANT_A,
    userId: "user-1",
    reportType: "balance-sheet",
    action: "REPORT_GENERATED",
    filters: { branchId: BRANCH_1 },
    durationMs: 45,
    recordsCount: 10
  });

  const auditLogs = ReportAuditService.getAuditLogs(TENANT_A);
  assert(auditLogs.length === 1, "Audit log records REPORT_GENERATED event");
  assert(auditLogs[0]?.reportType === "balance-sheet", "Audit log preserves report type");
  assert(auditLogs[0]?.durationMs === 45, "Audit log tracks execution duration in milliseconds");

  // ==========================================
  // 17. DOCUMENT EXPORT SYSTEM TESTS
  // ==========================================
  console.log("\n--- 17. Multi-Format Export (PDF, Excel, CSV) Tests ---");
  const exportPdfHtml = ExportService.generatePdfHtml({
    format: "PDF",
    title: "ميزان المراجعة التجريبي",
    tenantName: "صيدلية الأمل",
    currency: "SAR",
    columns: [
      { key: "code", label: "رمز الحساب" },
      { key: "name", label: "اسم الحساب" },
      { key: "debit", label: "مدين", isNumeric: true },
      { key: "credit", label: "دائن", isNumeric: true }
    ],
    data: [
      { code: "ACC-101", name: "الصندوق", debit: 210000, credit: 0 },
      { code: "ACC-301", name: "رأس المال", debit: 0, credit: 200000 }
    ],
    summaryRows: [{ label: "الإجمالي", value: "210,000 ر.س" }]
  });

  assert(exportPdfHtml.includes('dir="rtl"'), "PDF HTML includes dir='rtl' for Arabic layout");
  assert(exportPdfHtml.includes("ميزان المراجعة التجريبي"), "PDF HTML renders Arabic report title");
  assert(exportPdfHtml.includes("صيدلية الأمل"), "PDF HTML renders enterprise tenant name");

  const exportExcelXml = ExportService.generateExcelXml({
    format: "EXCEL",
    title: "قائمة الأرباح والخسائر",
    columns: [
      { key: "item", label: "البند" },
      { key: "amount", label: "المبلغ", isNumeric: true }
    ],
    data: [{ item: "المبيعات", amount: 100000 }]
  });

  assert(exportExcelXml.includes('ss:RightToLeft="1"'), "Excel XML contains right-to-left worksheet flag");
  assert(exportExcelXml.includes("<Data ss:Type=\"Number\">100000</Data>"), "Excel XML formats numbers with proper numeric tag");

  const exportCsv = ExportService.generateCsv({
    format: "CSV",
    title: "تقرير",
    columns: [{ key: "k", label: "الرمز" }, { key: "v", label: "القيمة" }],
    data: [{ k: "A1", v: "100" }]
  });
  assert(exportCsv.startsWith("\uFEFF"), "CSV file starts with UTF-8 Byte Order Mark (BOM) for Excel Arabic compatibility");

  // ==========================================
  // 18. LARGE DATASET PERFORMANCE & STRESS TEST
  // ==========================================
  console.log("\n--- 18. Large Dataset Performance & Stress Tests ---");
  const largeJournalLines: any[] = [];
  for (let i = 0; i < 2000; i++) {
    largeJournalLines.push({
      id: `stress-jl-${i}`,
      entryId: `stress-je-${Math.floor(i / 2)}`,
      accountId: i % 2 === 0 ? "acc-101" : "acc-401",
      accountCode: i % 2 === 0 ? "ACC-101" : "ACC-401",
      accountName: i % 2 === 0 ? "الصندوق" : "المبيعات",
      accountType: i % 2 === 0 ? "ASSET" : "REVENUE",
      debit: i % 2 === 0 ? 50 : 0,
      credit: i % 2 === 0 ? 0 : 50,
      description: `حركة ضغط رقم ${i}`,
      entryDate: "2026-02-15",
      entryNumber: `STR-${i}`,
      sourceType: "SALE",
      status: "POSTED",
      branchId: BRANCH_1,
      tenantId: TENANT_A,
      isSynced: true
    });
  }

  ReportQueryService.seedMockData({
    accounts: [
      { id: "acc-101", code: "ACC-101", name: "الصندوق", type: "ASSET", balance: 100000, tenantId: TENANT_A },
      { id: "acc-401", code: "ACC-401", name: "المبيعات", type: "REVENUE", balance: 100000, tenantId: TENANT_A }
    ],
    journalLines: largeJournalLines
  });

  const stressStart = Date.now();
  const stressTrialBalance = await FinancialReportEngine.generateTrialBalance({ tenantId: TENANT_A }, "user-1");
  const stressDuration = Date.now() - stressStart;

  assert(stressTrialBalance.totals.isBalanced, "Large dataset trial balance is mathematically balanced");
  assert(stressDuration < 200, `Aggregating 2,000 ledger entries takes < 200ms (took ${stressDuration}ms)`);

  // ==========================================
  // FINAL SUMMARY
  // ==========================================
  console.log("\n===============================================================================");
  console.log(`🏁 PHASE 8.4 TEST SUITE FINISHED: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log("===============================================================================\n");

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase84Tests().catch(err => {
  console.error("Test Suite crashed:", err);
  process.exit(1);
});
