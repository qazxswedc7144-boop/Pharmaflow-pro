// scripts/test-phase2-consolidation-engine.ts
// Automated Verification Suite for Phase 2 Financial Consolidation Engine

import { FinancialMath } from "../server/modules/consolidation/financial-math";
import { LedgerBalanceCalculator } from "../server/modules/consolidation/calculators/ledger-balance.calculator";
import { FinancialStatementCalculator } from "../server/modules/consolidation/calculators/financial-statement.calculator";
import { TrialBalanceCalculator } from "../server/modules/consolidation/calculators/trial-balance.calculator";
import { InventoryValuationCalculator } from "../server/modules/consolidation/calculators/inventory-valuation.calculator";
import { CashFlowCalculator } from "../server/modules/consolidation/calculators/cash-flow.calculator";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runTests() {
  console.log("=================================================");
  console.log("🏛️ PHARMAFLOW CONSOLIDATION ENGINE: PHASE 2 TEST");
  console.log("=================================================");

  // TEST 1: FinancialMath Precision
  console.log("\n[TEST 1] FinancialMath Determinism & Safe Numeric Parsing");
  assert(FinancialMath.add(0.1, 0.2) === 0.3, "0.1 + 0.2 == 0.3 without floating-point error");
  assert(FinancialMath.sub(1.0, 0.9) === 0.1, "1.0 - 0.9 == 0.1 exact subtraction");
  assert(FinancialMath.mul(10.55, 3) === 31.65, "10.55 * 3 == 31.65 deterministic product");
  assert(FinancialMath.div(100, 3) === 33.33, "100 / 3 == 33.33 rounded to 2 decimals");
  assert(FinancialMath.div(50, 0) === 0, "Division by zero returns safe fallback 0");
  assert(FinancialMath.safeNum(null) === 0, "safeNum(null) returns 0");
  assert(FinancialMath.safeNum(undefined) === 0, "safeNum(undefined) returns 0");
  assert(FinancialMath.safeNum(" 1250.75 ") === 1250.75, "safeNum parses strings correctly");

  // TEST 2: LedgerBalanceCalculator Aggregation & Classification
  console.log("\n[TEST 2] LedgerBalanceCalculator & Account Classification");
  const branches = [
    { id: "BR-01", name: "Main Pharmacy" },
    { id: "BR-02", name: "Downtown Branch" },
  ];

  const mockJournalLines = [
    // Branch 1: Cash sale 1000 (Debit Cash 1000, Credit Revenue 1000)
    {
      debit: 1000,
      credit: 0,
      account: { id: "ACC-CASH-1", code: "1010", name: "Cash on Hand", type: "ASSET" },
      entry: { branchId: "BR-01" },
    },
    {
      debit: 0,
      credit: 1000,
      account: { id: "ACC-REV-1", code: "4010", name: "Sales Revenue", type: "REVENUE" },
      entry: { branchId: "BR-01" },
    },
    // Branch 1: COGS 600 (Debit COGS 600, Credit Inventory 600)
    {
      debit: 600,
      credit: 0,
      account: { id: "ACC-COGS-1", code: "5010", name: "Cost of Goods Sold", type: "EXPENSE" },
      entry: { branchId: "BR-01" },
    },
    {
      debit: 0,
      credit: 600,
      account: { id: "ACC-INV-1", code: "1200", name: "Merchandise Inventory", type: "ASSET" },
      entry: { branchId: "BR-01" },
    },
    // Branch 2: Rent expense 200 (Debit Rent 200, Credit Cash 200)
    {
      debit: 200,
      credit: 0,
      account: { id: "ACC-RENT-1", code: "5200", name: "Store Rent", type: "EXPENSE" },
      entry: { branchId: "BR-02" },
    },
    {
      debit: 0,
      credit: 200,
      account: { id: "ACC-CASH-1", code: "1010", name: "Cash on Hand", type: "ASSET" },
      entry: { branchId: "BR-02" },
    },
    // Equity: Capital 5000 (Debit Cash 5000, Credit Capital 5000)
    {
      debit: 5000,
      credit: 0,
      account: { id: "ACC-CASH-1", code: "1010", name: "Cash on Hand", type: "ASSET" },
      entry: { branchId: "BR-01", description: "Capital Injection" },
      description: "Capital injection by founder",
    },
    {
      debit: 0,
      credit: 5000,
      account: { id: "ACC-CAP-1", code: "3010", name: "Share Capital", type: "EQUITY" },
      entry: { branchId: "BR-01", description: "Capital Injection" },
      description: "Capital injection by founder",
    },
  ];

  const ledgerState = LedgerBalanceCalculator.calculateAggregatedLedger(mockJournalLines, branches);
  assert(ledgerState.totalDebit === 6800, `Total debits aggregated: ${ledgerState.totalDebit} == 6800`);
  assert(ledgerState.totalCredit === 6800, `Total credits aggregated: ${ledgerState.totalCredit} == 6800`);
  assert(ledgerState.isTrialBalanceBalanced === true, "Trial Balance invariant is balanced (Debit == Credit)");
  assert(ledgerState.rawRevenue === 1000, `Raw revenue: ${ledgerState.rawRevenue} == 1000`);
  assert(ledgerState.rawCOGS === 600, `Raw COGS: ${ledgerState.rawCOGS} == 600`);
  assert(ledgerState.rentExpense === 200, `Rent expense: ${ledgerState.rentExpense} == 200`);
  assert(ledgerState.rawNetIncome === 200, `Raw Net Income: ${ledgerState.rawNetIncome} == 200 (1000 - 600 - 200)`);
  assert(ledgerState.shareCapital === 5000, `Share capital: ${ledgerState.shareCapital} == 5000`);

  // TEST 3: TrialBalanceCalculator
  console.log("\n[TEST 3] TrialBalanceCalculator Invariants");
  const tb = TrialBalanceCalculator.calculate(ledgerState, branches);
  assert(tb.isBalanced === true, "TB statement is balanced");
  assert(tb.totalDebit === 6800 && tb.totalCredit === 6800, "TB exact debit/credit match");
  assert(tb.rows.length === 6, `TB has exactly 6 unique accounts (got ${tb.rows.length})`);

  // TEST 4: FinancialStatementCalculator (Income Statement & Zero Plug Balance Sheet)
  console.log("\n[TEST 4] Financial Statements (Zero Fake Multipliers, Zero Plugs)");
  const incomeStatement = FinancialStatementCalculator.calculateIncomeStatement(
    ledgerState,
    branches,
    [], // No intercompany invoices in this test
    []
  );
  assert(incomeStatement.revenue === 1000, `Consolidated Revenue: ${incomeStatement.revenue} == 1000`);
  assert(incomeStatement.costOfGoodsSold === 600, `Consolidated COGS: ${incomeStatement.costOfGoodsSold} == 600`);
  assert(incomeStatement.grossProfit === 400, `Gross Profit: ${incomeStatement.grossProfit} == 400`);
  assert(incomeStatement.operatingExpenses.rent === 200, `Rent OPEX: ${incomeStatement.operatingExpenses.rent} == 200`);
  assert(incomeStatement.netIncome === 200, `Net Income: ${incomeStatement.netIncome} == 200`);

  // Balance Sheet verification
  // Cash = 1000 - 200 + 5000 = 5800
  // Inventory = -600 (or physical valuation)
  // Assets = Cash (5800) + Inventory (-600) = 5200
  // Liabilities = 0
  // Equity = Capital (5000) + Net Income (200) = 5200
  // Total Assets (5200) == Total Liabilities (0) + Total Equity (5200)!
  const balanceSheet = FinancialStatementCalculator.calculateBalanceSheet(
    ledgerState,
    0,
    branches,
    [],
    [],
    incomeStatement.netIncome
  );
  assert(balanceSheet.assets.totalAssets === 5200, `Total Assets: ${balanceSheet.assets.totalAssets} == 5200`);
  assert(balanceSheet.liabilities.totalLiabilities === 0, `Total Liabilities: ${balanceSheet.liabilities.totalLiabilities} == 0`);
  assert(balanceSheet.equity.totalEquity === 5200, `Total Equity: ${balanceSheet.equity.totalEquity} == 5200 (5000 capital + 200 net income)`);
  assert(balanceSheet.isBalanced === true, "Balance Sheet is mathematically balanced WITHOUT any plug!");

  // TEST 5: InventoryValuationCalculator (FIFO Costing, Zero Random Multipliers)
  console.log("\n[TEST 5] InventoryValuationCalculator FIFO Determinism");
  const products = [
    { id: "P-01", sku: "SKU-AMOX", name: "Amoxicillin 500mg", cost: 10, stockQuantity: 50 },
    { id: "P-02", sku: "SKU-PARA", name: "Paracetamol 500mg", cost: 5, stockQuantity: 100 },
  ];
  const batches = [
    {
      id: "B-01",
      productId: "P-01",
      branchId: "BR-01",
      batchNumber: "LOT-100",
      initialQuantity: 30,
      remainingQuantity: 30,
      costPrice: 8, // Old batch cheaper
      salePrice: 15,
      createdAt: new Date("2025-01-01"),
    },
    {
      id: "B-02",
      productId: "P-01",
      branchId: "BR-01",
      batchNumber: "LOT-101",
      initialQuantity: 30,
      remainingQuantity: 20,
      costPrice: 10, // Newer batch
      salePrice: 15,
      createdAt: new Date("2025-02-01"),
    },
  ];
  const invLevels = [
    { productId: "P-01", branchId: "BR-01", stockQuantity: 50 },
    { productId: "P-02", branchId: "BR-01", stockQuantity: 100 },
  ];
  const valuation = InventoryValuationCalculator.calculate(
    invLevels,
    products,
    batches,
    branches,
    []
  );
  // P-01: 30 units @ $8 ($240) + 20 units @ $10 ($200) = $440
  // P-02: 100 units @ $5 (catalog fallback) = $500
  // Total Valuation = $940 (FIFO determinism, zero fake 12 or 15 multipliers!)
  assert(valuation.totalInventoryQuantity === 150, `Total inventory units: ${valuation.totalInventoryQuantity} == 150`);
  assert(valuation.totalInventoryValue === 940, `Total FIFO inventory value: ${valuation.totalInventoryValue} == 940`);
  assert(valuation.branchBreakdown["BR-01"].value === 940, "Branch BR-01 inventory value is exactly 940");

  // TEST 6: CashFlowCalculator Reconciliation
  console.log("\n[TEST 6] CashFlowCalculator Statement Reconciliation");
  const cashLines = mockJournalLines.filter(l => l.account.code === "1010");
  const cashFlow = CashFlowCalculator.calculate(ledgerState, cashLines, branches);
  assert(cashFlow.endingCashBalance === 5800, `Ending cash balance: ${cashFlow.endingCashBalance} == 5800 (matches balance sheet cash)`);
  assert(cashFlow.operatingActivities.cashInflowSales === 1000, `Sales cash inflow: ${cashFlow.operatingActivities.cashInflowSales} == 1000`);
  assert(cashFlow.financingActivities.equityIssued === 5000, `Equity capital cash inflow: ${cashFlow.financingActivities.equityIssued} == 5000`);

  console.log("\n=================================================");
  console.log("🎉 ALL PHASE 2 CONSOLIDATION ENGINE TESTS PASSED!");
  console.log("=================================================");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
