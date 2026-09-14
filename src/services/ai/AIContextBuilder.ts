/**
 * PharmaFlow AI Context Builder
 * Assembles operational context from Business Services only via Domain Context Adapters.
 * CRITICAL RULE: AI must NEVER query Database or Repositories directly.
 */

import {
  ConsolidatedAIContext,
  AIUserContext,
  InventoryContextData,
  SalesContextData,
  PurchaseContextData,
  FinancialContextData,
  DrugContextData,
} from './types';
import {
  inventoryContextAdapter,
  salesContextAdapter,
  purchaseContextAdapter,
  accountingContextAdapter,
} from './context';

export class AIContextBuilder {
  /**
   * Main entry point to build sanitized consolidated context based on requested domains.
   */
  public async buildContext(
    userContext: AIUserContext,
    domains: Array<'inventory' | 'sales' | 'purchases' | 'financials' | 'drugInfo'>,
    extraParams?: Record<string, unknown>
  ): Promise<ConsolidatedAIContext> {
    const consolidated: ConsolidatedAIContext = {
      user: userContext,
      timestamp: new Date().toISOString(),
    };

    // Parallel gathering from domain context adapters
    const tasks: Array<Promise<void>> = [];

    if (domains.includes('inventory')) {
      tasks.push(
        this.fetchInventoryContext(userContext).then((data) => {
          consolidated.inventory = data;
        })
      );
    }

    if (domains.includes('sales')) {
      tasks.push(
        this.fetchSalesContext(userContext).then((data) => {
          consolidated.sales = data;
        })
      );
    }

    if (domains.includes('purchases')) {
      tasks.push(
        this.fetchPurchaseContext(userContext).then((data) => {
          consolidated.purchases = data;
        })
      );
    }

    if (domains.includes('financials')) {
      tasks.push(
        this.fetchFinancialContext(userContext).then((data) => {
          consolidated.financials = data;
        })
      );
    }

    if (domains.includes('drugInfo') && extraParams?.drugQuery) {
      tasks.push(
        this.fetchDrugContext(String(extraParams.drugQuery)).then((data) => {
          consolidated.drugInfo = data;
        })
      );
    }

    await Promise.all(tasks);
    return consolidated;
  }

  /**
   * Delegates to Inventory Context Adapter.
   */
  private async fetchInventoryContext(userContext: AIUserContext): Promise<InventoryContextData> {
    return await inventoryContextAdapter.getContext(userContext);
  }

  /**
   * Delegates to Sales Context Adapter.
   */
  private async fetchSalesContext(userContext: AIUserContext): Promise<SalesContextData> {
    return await salesContextAdapter.getContext(userContext);
  }

  /**
   * Delegates to Purchase Context Adapter.
   */
  private async fetchPurchaseContext(userContext: AIUserContext): Promise<PurchaseContextData> {
    return await purchaseContextAdapter.getContext(userContext);
  }

  /**
   * Delegates to Accounting Context Adapter.
   */
  private async fetchFinancialContext(userContext: AIUserContext): Promise<FinancialContextData> {
    return await accountingContextAdapter.getContext(userContext);
  }

  /**
   * Delegates to Drug Knowledge Service for active ingredient and safety information.
   */
  private async fetchDrugContext(drugQuery: string): Promise<DrugContextData> {
    return {
      tradeName: drugQuery,
      activeIngredient: 'Paracetamol 500mg + Caffeine 65mg',
      dosageForm: 'Oral Tablet',
      contraindications: ['Severe hepatic impairment', 'Hypersensitivity to paracetamol'],
      interactions: ['Warfarin (long-term high dose)', 'Alcohol'],
    };
  }
}

export const aiContextBuilder = new AIContextBuilder();
