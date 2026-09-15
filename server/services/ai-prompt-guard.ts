// server/services/ai-prompt-guard.ts
// Server-side Prompt Injection Defense and Financial Integrity Guard

export interface ServerPromptInspectionResult {
  isClean: boolean;
  violations: string[];
  rejectionReason?: string;
  sanitizedPrompt?: string;
}

export class ServerAIPromptGuard {
  private static readonly INSTRUCTION_OVERRIDE_PATTERNS: RegExp[] = [
    /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions|directives|prompts|rules)/i,
    /disregard\s+(all\s+)?(previous|prior|system)\s+(instructions|rules|constraints)/i,
    /forget\s+(all\s+)?(previous|prior|system)\s+(instructions|guidelines)/i,
    /override\s+(system|safety|security|financial)\s+(rules|policy|instructions)/i,
    /bypass\s+(approval|review|posting|validation|verification)/i,
    /تجاهل\s+(كافة|جميع|كل)?\s*(التعليمات|القواعد|الأوامر|الضوابط)\s*(السابقة)?/i,
    /تخطى\s+(الموافقة|المراجعة|التدقيق|الترحيل|التحقق)/i,
    /تجاوز\s+(النظام|القواعد|الصلاحيات|المحاسبة)/i,
    /احذف\s+(كافة|جميع|كل)?\s*(القيود|الحسابات|البيانات)/i,
  ];

  private static readonly SYSTEM_EXTRACTION_PATTERNS: RegExp[] = [
    /reveal\s+(your\s+)?(system\s+prompt|hidden\s+instructions|internal\s+configuration)/i,
    /show\s+(me\s+)?(your\s+)?(system\s+prompt|secret\s+instructions|developer\s+mode)/i,
    /repeat\s+(everything|the\s+text)\s+(above|from\s+the\s+beginning)/i,
    /what\s+is\s+your\s+(initial|secret|system)\s+(prompt|directive)/i,
    /اعرض\s+(لي\s+)?(تعليمات\s+النظام|الأوامر\s+المخفية|البرومبت\s+الأساسي)/i,
    /ما\s+هو\s+(البرومبت|التعليمات\s+السرية|نظامك\s+الداخلي)/i,
  ];

  private static readonly TENANT_ESCAPE_PATTERNS: RegExp[] = [
    /switch\s+(current\s+)?(to\s+)?(tenant|organization|company|branch)/i,
    /access\s+(data\s+of\s+)?(another|other|foreign)\s+(tenant|pharmacy|company)/i,
    /set\s+tenantId\s*=\s*['"]?[a-zA-Z0-9_-]+['"]?/i,
    /as\s+(super\s+admin|root|system\s+owner)/i,
    /الوصول\s+(لبيانات|لحسابات)\s+(شركة|مؤسسة|صيدلية|فرع)\s+(أخرى|أخر)/i,
    /تغيير\s+(معرف\s+المنشأة|المستأجر|الشركة)/i,
  ];

  private static readonly FINANCIAL_TAMPERING_PATTERNS: RegExp[] = [
    /pretend\s+(the\s+)?(balance|debt|liability)\s+(is|to\s+be)\s+zero/i,
    /zero-?out\s+(all\s+)?(balances|debts|accounts)/i,
    /waive\s+(all\s+)?(debts|liabilities|dues)/i,
    /post\s+directly\s+to\s+ledger/i,
    /auto-?approve\s+(this\s+)?(entry|transaction|discount)/i,
    /modify\s+database\s+directly/i,
    /execute\s+sql\s+insert/i,
    /drop\s+table/i,
    /delete\s+from\s+accounts/i,
    /(اعتبر|اجعل)\s+.*?(صفراً|صفر)/i,
    /(بدون|دون)\s+(قيد|أثر)\s*(محاسبي|رجعي)/i,
    /تصفير\s+(الأرصدة|الديون|الحسابات)/i,
    /إسقاط\s+(الديون|المستحقات)\s*تلقائياً/i,
    /ترحيل\s+مباشر\s+إلى\s+دفتر\s+الأستاذ/i,
    /تعديل\s+قاعدة\s+البيانات\s+مباشرة/i,
  ];

  public static inspectPrompt(rawPrompt: string): ServerPromptInspectionResult {
    if (!rawPrompt || typeof rawPrompt !== 'string') {
      return { isClean: true, violations: [], sanitizedPrompt: '' };
    }

    const trimmed = rawPrompt.trim();
    const violations: string[] = [];

    for (const pattern of this.INSTRUCTION_OVERRIDE_PATTERNS) {
      if (pattern.test(trimmed)) {
        violations.push('INSTRUCTION_OVERRIDE_ATTEMPT');
        break;
      }
    }

    for (const pattern of this.SYSTEM_EXTRACTION_PATTERNS) {
      if (pattern.test(trimmed)) {
        violations.push('SYSTEM_EXTRACTION_ATTEMPT');
        break;
      }
    }

    for (const pattern of this.TENANT_ESCAPE_PATTERNS) {
      if (pattern.test(trimmed)) {
        violations.push('TENANT_ESCAPE_ATTEMPT');
        break;
      }
    }

    for (const pattern of this.FINANCIAL_TAMPERING_PATTERNS) {
      if (pattern.test(trimmed)) {
        violations.push('FINANCIAL_TAMPERING_ATTEMPT');
        break;
      }
    }

    if (violations.length > 0) {
      return {
        isClean: false,
        violations,
        rejectionReason: this.buildRejectionMessage(violations),
      };
    }

    return {
      isClean: true,
      violations: [],
      sanitizedPrompt: trimmed,
    };
  }

  private static buildRejectionMessage(violations: string[]): string {
    if (violations.includes('FINANCIAL_TAMPERING_ATTEMPT')) {
      return 'تم حظر الطلب أمنياً: يحتوي الاستعلام على محاولة لتجاوز القيود المحاسبية أو تصفير أرصدة دون مراجعة بشرية.';
    }
    if (violations.includes('TENANT_ESCAPE_ATTEMPT')) {
      return 'تم حظر الطلب أمنياً: يحتوي الاستعلام على محاولة لتجاوز نطاق المنشأة (Tenant Mismatch/Escape).';
    }
    if (violations.includes('SYSTEM_EXTRACTION_ATTEMPT')) {
      return 'تم حظر الطلب أمنياً: لا يُسمح باستخراج تعليمات النظام الداخلية.';
    }
    return 'تم حظر الطلب أمنياً: يحتوي الاستعلام على محاولة لتجاوز تعليمات وسياسات النظام (Prompt Injection Detected).';
  }
}
