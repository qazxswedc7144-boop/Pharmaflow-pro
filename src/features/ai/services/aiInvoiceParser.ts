import { ai } from '@features/ai/services/gemini';
import { ParsedInvoiceSchema } from '@/shared/validation/ai.schema';

export interface ParsedInvoiceItem {
  name: string;
  quantity: number;
  price: number;
  expiryDate?: string;
  barcode?: string;
  discountPercent?: number;
  bonusQty?: number;
  batchNumber?: string;
  unit?: string;
  notes?: string;
}

export interface ParsedInvoice {
  type: 'cash' | 'credit' | 'return';
  supplier: string;
  invoice_number: string;
  date?: string;
  notes: string;
  items: ParsedInvoiceItem[];
  status: 'Draft'; // 1. Any invoice processed/read via AI model must obligatorily be saved with "Draft" status.
  warning: string; // 4. Mandatory warning message stating it is awaiting human audit/review.
  discardedColumnsCount?: number;
}

let lastAICall = 0;

/**
 * 2. يمنع منعاً باتاً تمرير أو ترحيل الفاتورة مباشرة إلى الحسابات أو المخازن من خلال هذا الملف.
 * يقتصر دور هذا الملف حصراً على معالجة واستخراج البيانات (Pure Data Extractor) ولا يحتوي على أي ممر أو تحويل مباشر في المعاملات/المخازن.
 */

/**
 * 3. دالة تحقق (Validation Check) تمنع تغيير حالة الفاتورة من 'Draft' إلى 'Approved' أو 'Posted' 
 * إلا إذا كان المستخدم الحالي يمتلك صلاحية محاسبية أو إدارية معتمدة.
 * 
 * @param user كائن المستخدم الحالي ويشتمل على حقل role
 * @param targetStatus الحالة المستهدفة المراد التغيير إليها
 * @returns كائن يحتوي على نتيجة التحقق ورسالة الخطأ إن وجدت
 */
export function validateStatusTransition(
  user: { role: string } | null | undefined,
  targetStatus: string
): { success: boolean; error?: string } {
  if (!targetStatus) {
    return { success: true };
  }

  const normTarget = targetStatus.toUpperCase();

  // منع تغيير الحالة للفواتير من Draft إلى Approved أو Posted إلا بوجود صلاحية مناسبة
  if (normTarget === 'APPROVED' || normTarget === 'POSTED') {
    const role = user?.role;
    if (role !== 'Accountant' && role !== 'Admin') {
      return {
        success: false,
        error: "🚫 عذراً، لا تمتلك الصلاحيات المحاسبية أو الإدارية اللازمة لاعتماد أو ترحيل الفاتورة. يُسمح فقط للمحاسبين (Accountant) والمدراء (Admin) بإجراء هذا التحويل."
      };
    }
  }

  return { success: true };
}

/**
 * يقوم بتحليل وقراءة نص الفاتورة عبر نموذج الذكاء الاصطناعي مع فرض حالة "مسودة" إجبارياً وبانتظار التدقيق البشري.
 */
export async function parseInvoice(text: string): Promise<ParsedInvoice> {
  const now = Date.now();

  // حماية من استدعاءات API المتكررة (Rate Limit Protection)
  if (now - lastAICall < 3000) {
    console.warn("⛔ تم منع استدعاء AI (Rate Limit Protection)");
    throw new Error("تجاوز عدد مرات الاستدعاء المسموح بها محلياً. يرجى الانتظار قليلاً.");
  }

  lastAICall = now;

  if (!text || text.trim().length < 10) {
    throw new Error("نص الفاتورة غير كافي للتحليل التلقائي.");
  }

  // الرسالة التحذيرية الموحدة الخاصة بالتدقيق البشري
  const humanReviewWarning = "⚠️ هذه الفاتورة تم توليدها تلقائياً بوسطة الذكاء الاصطناعي، وهي بانتظار المراجعة والتدقيق البشري واليدوي الفوري قبل الاعتماد.";

  try {
    const prompt = `أنت خبير فائق الذكاء ومتخصص في استخراج وتحليل بيانات فواتير مشتريات الأدوية والمنتجات الصيدلانية والموردين باللغة العربية والإنجليزية.

الهدف الأساسي:
قد تحتوي فاتورة المورد الحالية على عدد كبير جداً من الأعمدة المعقدة (مثل: كود المخزن الداخلي، كود التعبئة، رقم الصفحة، المجموع القبلي، نسبة ضريبة القيمة المضافة، القيمة المضافة، التسلسل الداخلي، إلخ).
مهمتك المحورية هي:
1. قراءة الجداول والصفوف بدقة مهما كان عدد الأعمدة.
2. استخراج الحقول الضرورية فقط التي تحتاجها فاتورة المشتريات داخل التطبيق.
3. التخلص والاستغناء التام عن كافة الأعمدة والبيانات الإضافية الزائدة.

الحقول المستهدفة والضرورية المسموح باستخراجها فقط:
- name: اسم الصنف أو الدواء (بالعربية أو الإنجليزية كما هو مكتوب في الفاتورة).
- barcode: الباركود أو كود المنتج إن وجد (مثل 628... أو GTIN).
- quantity: الكمية المشتراة الفعلية (رقم موجب).
- price: سعر الشراء / سعر التكلفة للوحدة (رقم موجب غير سالب).
- expiryDate: تاريخ الصلاحية / الانتهاء بتنسيق YYYY-MM-DD إن وجد (مثال 2026-12-31).
- bonusQty: كمية المجاني أو البونص إن وجدت (رقم موجب).
- discountPercent: نسبة الخصم المئوية إن وجدت (رقم مثل 5 أو 10).
- batchNumber: رقم التشغيلة أو الباتش (Batch / Lot Number) إن وجد.
- unit: وحدة القياس (عبوة، علبة، شريط، كرتونة) إن وجدت.

توجيهات معالجة البيانات:
- حدد اسم المورد ورقم الفاتورة ونوع الفاتورة (cash، credit، return) إن أمكن.
- قم بتنظيف كافة الأسعار والكميات من الرموز أو العملات (مثل $، ر.س، ج.م، %).
- أرجِع فقط كائن JSON صريح وبدون أي كتل ماركداون إضافية أو شرح خارج عن التنسيق.

تنسيق الاستجابة JSON المطلوب:
{
  "type": "cash" | "credit" | "return",
  "supplier": "اسم المورد أو الشركة",
  "invoice_number": "رقم الفاتورة",
  "date": "YYYY-MM-DD",
  "notes": "أي ملاحظات عامة حول الفاتورة",
  "items": [
    {
      "name": "اسم الدواء أو الصنف",
      "barcode": "الباركود إن وجد",
      "quantity": 10,
      "price": 25.5,
      "expiryDate": "YYYY-MM-DD",
      "bonusQty": 0,
      "discountPercent": 0,
      "batchNumber": "LOT123",
      "unit": "علبة"
    }
  ]
}

نص الفاتورة / المستند المراد تحليله:
${text}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    let jsonStr = response.text;
    if (!jsonStr) {
      throw new Error('لم يتم استلام أي بيانات أو استجابة من نموذج الذكاء الاصطناعي.');
    }
    
    // تنظيف المخرجات من كتل الماركداون البرمجية إن وجدت
    jsonStr = jsonStr.trim();
    if (jsonStr.includes('{')) {
      const startIndex = jsonStr.indexOf('{');
      const endIndex = jsonStr.lastIndexOf('}');
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        jsonStr = jsonStr.substring(startIndex, endIndex + 1);
      }
    }

    const rawObject = JSON.parse(jsonStr);
    
    // Validate schema safety
    const validation = ParsedInvoiceSchema.safeParse(rawObject);
    if (!validation.success) {
      console.warn("⚠️ AI Response validation warning:", validation.error.format());
    }

    const validatedData = validation.success ? validation.data : rawObject;

    // 1 & 4. فرض القواعد الصارمة على الفاتورة المستخرجة
    return {
      type: (validatedData.type === 'cash' || validatedData.type === 'credit' || validatedData.type === 'return') 
        ? validatedData.type 
        : 'cash',
      supplier: validatedData.supplier || 'غير معروف',
      invoice_number: validatedData.invoice_number || 'INV-' + Math.floor(Math.random() * 100000),
      date: validatedData.date || new Date().toISOString().split('T')[0],
      notes: validatedData.notes 
        ? `[استيراد ذكي: تم تصفية الأعمدة الزائدة والاحتفاظ بالبيانات المطلوبة فقط] ${validatedData.notes}` 
        : '[استيراد ذكي: تم تصفية الأعمدة الزائدة والاحتفاظ بالبيانات المطلوبة فقط]',
      items: (validatedData.items || []).map((item: any) => ({
        name: item.name || 'مادة مجهولة الاسم',
        barcode: item.barcode || undefined,
        quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : (Number(item.quantity) || 1),
        price: typeof item.price === 'number' && item.price >= 0 ? item.price : (Number(item.price) || 0),
        expiryDate: item.expiryDate || undefined,
        discountPercent: typeof item.discountPercent === 'number' ? item.discountPercent : (Number(item.discountPercent) || 0),
        bonusQty: typeof item.bonusQty === 'number' ? item.bonusQty : (Number(item.bonusQty) || 0),
        batchNumber: item.batchNumber || undefined,
        unit: item.unit || undefined,
        notes: item.notes || undefined
      })),
      status: 'Draft', // فرض حالة مسودة إجبارياً بحسب الشرط رقم 1
      warning: humanReviewWarning // إرفاق الرسالة التحذيرية المطابقة للشرط رقم 4
    };

  } catch (error) {
    console.error('AI Parse Error [Encountered, utilizing secure Draft fallback]:', error);
    
    // في حالة حدوث خطأ، نقوم بإرجاع مسودة آمنة وفارغة متوافقة مع القواعد الصارمة والشرط رقم 1 ورقم 4
    return {
      type: 'cash',
      supplier: 'مورد غير معروف - فشل القراءة الآلية',
      invoice_number: 'ERR-' + Math.floor(Math.random() * 100000),
      date: new Date().toISOString().split('T')[0],
      notes: `[فشل في الفك الآلي] يرجى إدخال البيانات يدوياً. ${humanReviewWarning}`,
      items: [],
      status: 'Draft', // فرض حالة مسودة إجبارياً بحسب الشرط رقم 1
      warning: `${humanReviewWarning} (ملاحظة: فشل التحليل التلقائي وتراجع النظام إلى مسودة فارغة وحماية ضد التمرير المباشر)`
    };
  }
}

