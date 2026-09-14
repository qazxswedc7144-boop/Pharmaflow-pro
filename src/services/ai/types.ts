/**
 * PharmaFlow AI Copilot Foundation - Core Types & Interfaces
 * Strictly enforces clean architecture, safety rules, and context definitions.
 */

export type AIModelTarget = 
  | 'gemini-3.6-flash'       // Default for rapid summarization, Q&A, and basic analysis
  | 'gemini-3.1-pro-preview'; // Advanced reasoning, complex financial audits, drug cross-validation

export interface AICapabilityScope {
  module: 'inventory' | 'sales' | 'purchases' | 'accounting' | 'drugs' | 'analytics';
  action: 'read' | 'analyze' | 'recommend';
  requiredRole: 'admin' | 'pharmacist' | 'accountant' | 'manager';
}

export interface AIUserContext {
  userId: string;
  userRole: 'admin' | 'pharmacist' | 'accountant' | 'manager' | 'staff';
  branchId: string;
  tenantId: string;
}

export interface SmartPharmacyIntelligenceItem {
  type: 'FACT' | 'INSIGHT' | 'WARNING' | 'RECOMMENDATION' | 'ANOMALY';
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  domain: 'inventory' | 'sales' | 'purchasing' | 'accounting' | 'pharmacy';
  title: string;
  summary: string;
  evidence: string[];
  recommendation: string;
  requiresHumanReview: boolean;
}

export interface SmartPharmacyIntelligenceReport {
  timestamp: string;
  userRole: string;
  overallHealthScore: number;
  items: SmartPharmacyIntelligenceItem[];
  summaryText: string;
}

export interface InventoryContextData {
  totalItemsCount: number;
  lowStockItems: Array<{ id: string; name: string; quantity: number; reorderLevel: number }>;
  overstockItems?: Array<{ id: string; name: string; quantity: number; reorderLevel: number; excessRatio: number }>;
  deadStockItems?: Array<{ id: string; name: string; quantity: number; daysWithoutMovement: number; value: number }>;
  expiredItems: Array<{ id: string; name: string; expiryDate: string; quantity: number; batchNo?: string }>;
  nearExpiryItems?: Array<{ id: string; name: string; expiryDate: string; daysRemaining: number; quantity: number; value: number }>;
  fastMovingItems?: Array<{ id: string; name: string; monthlySalesCount: number }>;
  slowMovingItems?: Array<{ id: string; name: string; monthlySalesCount: number }>;
  stockTurnoverRatio?: number;
  branchStockImbalance?: Array<{ branchName: string; itemSurplusCount: number; itemDeficitCount: number }>;
  totalInventoryValue: number;
}

export interface SalesContextData {
  periodDays: number;
  totalSalesCount: number;
  totalRevenue: number;
  topSellingProducts: Array<{ name: string; quantity: number; revenue: number }>;
  decliningProducts?: Array<{ name: string; dropPercentage: number }>;
  salesVelocity?: Array<{ name: string; dailyAverageSales: number }>;
  averageOrderValue: number;
  unusualSalesSpikes?: Array<{ productName: string; date: string; quantity: number; spikeRatio: number }>;
  grossMarginPercentage?: number;
}

export interface PurchaseContextData {
  pendingOrdersCount: number;
  activeSuppliersCount: number;
  recentOrders: Array<{ supplierName: string; status: string; totalAmount: number; date: string }>;
  supplierConcentration?: Array<{ supplierName: string; sharePercentage: number; totalVolume: number }>;
  priceChanges?: Array<{ productName: string; supplierName: string; oldPrice: number; newPrice: number; percentChange: number }>;
  potentialOverPurchasing?: Array<{ productName: string; currentStock: number; pendingQuantity: number; estimatedDaysOfSupply: number }>;
  slowSupplierItems?: Array<{ supplierName: string; averageLeadDays: number }>;
}

export interface FinancialContextData {
  grossProfitMargin: number;
  netProfit: number;
  totalAccountsReceivable: number;
  totalAccountsPayable: number;
  cogs?: number;
  revenue?: number;
  expenseTrends?: Array<{ category: string; amount: number; month: string }>;
  trialBalanceAnomalies?: Array<{ description: string; severity: string; discrepancyAmount: number }>;
  cashFlowStatus?: 'positive' | 'tight' | 'critical';
}

export interface DrugContextData {
  drugId?: string;
  tradeName?: string;
  activeIngredient?: string;
  dosageForm?: string;
  contraindications?: string[];
  interactions?: string[];
}

export interface ConsolidatedAIContext {
  user: AIUserContext;
  timestamp: string;
  inventory?: InventoryContextData;
  sales?: SalesContextData;
  purchases?: PurchaseContextData;
  financials?: FinancialContextData;
  drugInfo?: DrugContextData;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  userTemplate: string;
  requiredScopes: AICapabilityScope[];
  responseFormat: 'text' | 'json' | 'markdown';
}

export interface AIRequestOptions {
  model?: AIModelTarget;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  userContext: AIUserContext;
  promptId?: string;
  variables?: Record<string, unknown>;
  rawPrompt?: string;
  includeContexts?: Array<'inventory' | 'sales' | 'purchases' | 'financials' | 'drugInfo'>;
  taskComplexity?: 'simple' | 'medium' | 'complex';
  timeoutMs?: number;
}

export interface AIServerErrorResponse {
  success: false;
  errorCode: string;
  message: string;
}

export interface AISafetyCheckResult {
  isSafe: boolean;
  blockReason?: string;
  flaggedCategories: Array<'financial_risk' | 'medical_safety' | 'data_privacy' | 'hallucination_detected'>;
  sanitizedText?: string;
}

export interface AIResponse<T = unknown> {
  id: string;
  modelUsed: AIModelTarget;
  rawOutput: string;
  parsedData?: T;
  safetyCheck: AISafetyCheckResult;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
  timestamp: string;
}

export interface AIUsageLog {
  id: string;
  timestamp: string;
  userId: string;
  branchId: string;
  model: AIModelTarget;
  promptId?: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  status: 'success' | 'blocked' | 'error';
  errorMessage?: string;
}
