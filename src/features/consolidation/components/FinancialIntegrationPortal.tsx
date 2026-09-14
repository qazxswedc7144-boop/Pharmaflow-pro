import React from 'react';
import { FinancialIntegrationHeader } from './FinancialIntegrationHeader';
import { FinancialAIReport } from './sections/FinancialAIReport';
import { ConsolidatedBalanceSheet } from './sections/ConsolidatedBalanceSheet';
import { ConsolidatedIncomeStatement } from './sections/ConsolidatedIncomeStatement';
import { CashFlowStatement } from './sections/CashFlowStatement';
import { SharedTrialBalance } from './sections/SharedTrialBalance';
import { InventoryLogistics } from './sections/InventoryLogistics';

export const FinancialIntegrationPortal: React.FC = () => {
  return (
    <div className="space-y-8 p-4 md:p-6 bg-slate-50 min-h-screen dir-rtl">
      {/* 1. هيدر الصفحة الرئيسي */}
      <FinancialIntegrationHeader />

      {/* 2. قسم الذكاء المالي والتقرير التحليلي */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
          الذكاء المالي والتقرير التحليلي
        </h2>
        <FinancialAIReport />
      </section>

      {/* 3. قسم الميزانية الموحدة */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
          الميزانية الموحدة
        </h2>
        <ConsolidatedBalanceSheet />
      </section>

      {/* 4. قسم قائمة الدخل الموحدة */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
          قائمة الدخل الموحدة
        </h2>
        <ConsolidatedIncomeStatement />
      </section>

      {/* 5. قسم جدول التدفقات النقدية */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
          جدول التدفقات النقدية
        </h2>
        <CashFlowStatement />
      </section>

      {/* 6. قسم ميزان المراجعة المشترك */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
          ميزان المراجعة المشترك
        </h2>
        <SharedTrialBalance />
      </section>

      {/* 7. قسم لوجستيات المخزون والوفرة */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">
          لوجستيات المخزون والوفرة
        </h2>
        <InventoryLogistics />
      </section>
    </div>
  );
};
