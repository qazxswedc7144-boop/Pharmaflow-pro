/**
 * PharmaFlow Smart Pharmacy Intelligence Engine (AI-05)
 * Pure READ-ONLY analytical engine providing insights across inventory, sales, procurement,
 * pharmacy safety, financials, and anomaly detection.
 * STRICT RULE: No direct database queries (Dexie/Prisma) and NO autonomous business mutations.
 */

import {
  AIUserContext,
  ConsolidatedAIContext,
  SmartPharmacyIntelligenceItem,
  SmartPharmacyIntelligenceReport,
} from './types';
import { aiContextBuilder } from './AIContextBuilder';
import { PromptManager } from './PromptManager';
import { GeminiGateway } from './GeminiGateway';
import { AIResponseValidator } from './AIResponseValidator';

export class SmartPharmacyIntelligenceEngine {
  /**
   * Generates a comprehensive, multi-domain Smart Pharmacy Intelligence Report.
   */
  public async generateIntelligenceReport(
    userContext: AIUserContext,
    customQuery?: string
  ): Promise<SmartPharmacyIntelligenceReport> {
    const timestamp = new Date().toISOString();

    // 1. Build Consolidated Domain Context safely through adapters
    const consolidatedContext = await aiContextBuilder.buildContext(
      userContext,
      ['inventory', 'sales', 'purchases', 'financials']
    );

    // 2. Fetch or prepare prompt template
    const template = PromptManager.getTemplate('SMART_PHARMACY_INTELLIGENCE');
    if (template) {
      const auth = PromptManager.authorizeUserForTemplate(template, userContext);
      if (!auth.authorized) {
        return this.generateFallbackReport(
          consolidatedContext,
          `ملاحظة الصلاحية: ${auth.reason || 'المستخدم لا يمتلك الصلاحية الكافية لبعض البيانات التخصصية.'}`
        );
      }
    }

    const query = customQuery || 'أجرِ تحليلاً كاملاً ورصداً شاملاً للمخزون والمبيعات والمشتريات والوضع المالي وانحرافات النظام.';

    try {
      // 3. Request Gemini analysis via GeminiGateway
      const aiResponse = await GeminiGateway.execute({
        promptId: 'SMART_PHARMACY_INTELLIGENCE',
        userContext,
        variables: {
          consolidatedContext,
          userQuery: query,
        },
        taskComplexity: 'complex',
        model: 'gemini-3.1-pro-preview',
        temperature: 0.2,
      });

      // 4. Validate output safety
      const safety = AIResponseValidator.validateTextResponse(aiResponse.rawOutput);

      // 5. Try parsing JSON items from response
      let parsedItems: SmartPharmacyIntelligenceItem[] = [];
      try {
        const jsonMatch = aiResponse.rawOutput.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsedItems = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.warn('⚠️ [SmartPharmacyIntelligenceEngine] Could not parse JSON from Gemini response, using rule-based extraction:', parseError);
      }

      // If parsing succeeded and items exist, use them after enforcing safety and human review flag
      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        const sanitizedItems = parsedItems.map((item) => ({
          ...item,
          requiresHumanReview: true, // MANDATORY requirement for all AI insights
          confidence: Math.min(1.0, Math.max(0.5, Number(item.confidence) || 0.9)),
        }));

        const overallHealthScore = this.calculateHealthScore(sanitizedItems);

        return {
          timestamp,
          userRole: userContext.userRole,
          overallHealthScore,
          items: sanitizedItems,
          summaryText: safety.sanitizedText || aiResponse.rawOutput,
        };
      }
    } catch (error) {
      console.warn('⚠️ [SmartPharmacyIntelligenceEngine] Gemini Gateway unavailable or failed, generating rule-based report:', error);
    }

    // Fallback: Generate deterministic rule-based analysis directly from adapters
    return this.generateFallbackReport(consolidatedContext);
  }

  /**
   * Generates domain-specific intelligence items.
   */
  public async analyzeDomain(
    domain: 'inventory' | 'sales' | 'purchasing' | 'accounting' | 'pharmacy',
    userContext: AIUserContext
  ): Promise<SmartPharmacyIntelligenceItem[]> {
    const report = await this.generateIntelligenceReport(userContext, `تحليل تفصيلي لدومين: ${domain}`);
    return report.items.filter((item) => item.domain === domain);
  }

  /**
   * Generates a deterministic, rule-based report from domain context adapters.
   */
  private generateFallbackReport(
    ctx: ConsolidatedAIContext,
    notice?: string
  ): SmartPharmacyIntelligenceReport {
    const items: SmartPharmacyIntelligenceItem[] = [];

    // --- 1. Inventory Intelligence ---
    if (ctx.inventory) {
      const inv = ctx.inventory;

      // Low stock rule
      if (inv.lowStockItems.length > 0) {
        items.push({
          type: 'WARNING',
          severity: inv.lowStockItems.length > 5 ? 'HIGH' : 'MEDIUM',
          confidence: 0.98,
          domain: 'inventory',
          title: 'الأصناف المنخفضة عن حد الأمان',
          summary: `تم رصد ${inv.lowStockItems.length} أصناف دون حد الأمان المطلوب لإعادة الطلب.`,
          evidence: inv.lowStockItems.slice(0, 3).map((item) => `${item.name}: الكمية الحالية ${item.quantity} (حد الطلب ${item.reorderLevel})`),
          recommendation: 'مراجعة المشتريات وإعداد طلبات توريد استرشادية بدون اعتماد تلقائي.',
          requiresHumanReview: true,
        });
      }

      // Expired / Near expiry rule
      if (inv.expiredItems.length > 0) {
        items.push({
          type: 'WARNING',
          severity: 'CRITICAL',
          confidence: 1.0,
          domain: 'pharmacy',
          title: 'أدوية منتهية الصلاحية بالمخزون',
          summary: `يوجد ${inv.expiredItems.length} أصناف منتهية الصلاحية تتطلب الإتلاف والمراجعة الصيدلانية.`,
          evidence: inv.expiredItems.slice(0, 3).map((item) => `${item.name}: تاريخ الانتهاء ${item.expiryDate}`),
          recommendation: 'سحب الأدوية فوراً ونقلها لمنطقة التوالف المعتمدة من قبل الصيدلي المسؤول.',
          requiresHumanReview: true,
        });
      } else if (inv.nearExpiryItems && inv.nearExpiryItems.length > 0) {
        items.push({
          type: 'INSIGHT',
          severity: 'HIGH',
          confidence: 0.95,
          domain: 'inventory',
          title: 'أدوية قريبة من انتهاء الصلاحية (خلال 90 يوماً)',
          summary: `تم رصد ${inv.nearExpiryItems.length} صنفاً تتطلب خطة تصريف عاجلة.`,
          evidence: inv.nearExpiryItems.slice(0, 3).map((item) => `${item.name}: متبقي ${item.daysRemaining} يوم`),
          recommendation: 'تفعيل خطة FEFO لتصريف الأدوية القريبة أولاً بالصرف الصيدلاني.',
          requiresHumanReview: true,
        });
      }

      // Overstock / Deadstock rule
      if (inv.overstockItems && inv.overstockItems.length > 0) {
        items.push({
          type: 'INSIGHT',
          severity: 'LOW',
          confidence: 0.9,
          domain: 'inventory',
          title: 'تكدس ومخزون زائد عن الحاجة',
          summary: `تم تحديد ${inv.overstockItems.length} صنفاً تتجاوز الكميات المثلى للتخزين.`,
          evidence: inv.overstockItems.slice(0, 3).map((item) => `${item.name}: الكمية المخزنة ${item.quantity}`),
          recommendation: 'إيقاف طلبات التوريد الجديدة لهذه الأصناف لحين تحسين دوران المخزون.',
          requiresHumanReview: true,
        });
      }
    }

    // --- 2. Sales Intelligence ---
    if (ctx.sales) {
      const sales = ctx.sales;
      items.push({
        type: 'FACT',
        severity: 'INFO',
        confidence: 1.0,
        domain: 'sales',
        title: 'مؤشر أداء المبيعات الإجمالي',
        summary: `إجمالي مبيعات الفترة (${sales.periodDays} يوماً) بلغ ${sales.totalRevenue.toLocaleString()} ريال عبر ${sales.totalSalesCount} عملية صيدلانية.`,
        evidence: [`متوسط قيمة الفاتورة: ${sales.averageOrderValue} ريال`],
        recommendation: 'متابعة الأصناف الأكثر مبيعاً وضمان توفرها الدائم.',
        requiresHumanReview: false,
      });

      if (sales.unusualSalesSpikes && sales.unusualSalesSpikes.length > 0 && sales.unusualSalesSpikes[0]) {
        const spike = sales.unusualSalesSpikes[0];
        items.push({
          type: 'ANOMALY',
          severity: 'MEDIUM',
          confidence: 0.88,
          domain: 'sales',
          title: 'تحديد انحراف محتمل في نمط المبيعات',
          summary: `تم رصد ارتفاع مفاجئ وغير معتاد في مبيعات صنف ${spike.productName}.`,
          evidence: [`الكمية المباعة: ${spike.quantity} بنسبة زيادة ${spike.spikeRatio}x عن المتوسط`],
          recommendation: 'التحقق من صحة الفواتير ومطابقة المخزون الفعلي.',
          requiresHumanReview: true,
        });
      }
    }

    // --- 3. Procurement Intelligence ---
    if (ctx.purchases) {
      const pur = ctx.purchases;
      if (pur.supplierConcentration && pur.supplierConcentration.length > 0 && pur.supplierConcentration[0]) {
        const topSupp = pur.supplierConcentration[0];
        if (topSupp.sharePercentage > 50) {
          items.push({
            type: 'WARNING',
            severity: 'MEDIUM',
            confidence: 0.92,
            domain: 'purchasing',
            title: 'تركيز الاعتماد على مورد واحد',
            summary: `المورد ${topSupp.supplierName} يستحوذ على ${topSupp.sharePercentage}% من إجمالي مشتريات الصيدلية.`,
            evidence: [`حجم التعاملات: ${topSupp.totalVolume.toLocaleString()} ريال`],
            recommendation: 'تنويع الموردين لتفادي مخاطر انقطاع سلاسل الإمداد.',
            requiresHumanReview: true,
          });
        }
      }
    }

    // --- 4. Financial Intelligence ---
    if (ctx.financials) {
      const fin = ctx.financials;
      items.push({
        type: 'FACT',
        severity: 'INFO',
        confidence: 1.0,
        domain: 'accounting',
        title: 'المؤشرات المالية وهامش الربحية',
        summary: `هامش الربح الإجمالي: ${fin.grossProfitMargin}%، إجمالي صافي الربح: ${fin.netProfit.toLocaleString()} ريال.`,
        evidence: [
          `الذمم المدينة: ${fin.totalAccountsReceivable.toLocaleString()} ريال`,
          `الذمم الدائنة: ${fin.totalAccountsPayable.toLocaleString()} ريال`,
        ],
        recommendation: 'متابعة التحصيل الدوري للذمم المدينة للحفاظ على مستوى السيولة.',
        requiresHumanReview: false,
      });
    }

    const overallHealthScore = this.calculateHealthScore(items);

    return {
      timestamp: new Date().toISOString(),
      userRole: ctx.user.userRole,
      overallHealthScore,
      items,
      summaryText: notice || 'تم إعداد تقرير التحليل الرقابي الصيدلاني بنجاح واستناداً إلى محرك القواعد الداخلي المعتمد.',
    };
  }

  /**
   * Calculates overall pharmacy operational health score (0 - 100).
   */
  private calculateHealthScore(items: SmartPharmacyIntelligenceItem[]): number {
    let score = 100;

    for (const item of items) {
      if (item.severity === 'CRITICAL') score -= 20;
      else if (item.severity === 'HIGH') score -= 10;
      else if (item.severity === 'MEDIUM') score -= 5;
      else if (item.severity === 'LOW') score -= 2;
    }

    return Math.max(30, Math.min(100, score));
  }
}

export const smartPharmacyIntelligenceEngine = new SmartPharmacyIntelligenceEngine();
