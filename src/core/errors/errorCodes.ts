export type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export enum ErrorCode {
  ERR_VALIDATION_FAILED = 'ERR_VALIDATION_FAILED',
  ERR_TRANSACTION_FAILED = 'ERR_TRANSACTION_FAILED',
  ERR_INSUFFICIENT_STOCK = 'ERR_INSUFFICIENT_STOCK',
  ERR_PERIOD_LOCKED = 'ERR_PERIOD_LOCKED',
  ERR_ACCOUNTING_UNBALANCED = 'ERR_ACCOUNTING_UNBALANCED',
  ERR_DUPLICATE_DOCUMENT = 'ERR_DUPLICATE_DOCUMENT',
  ERR_PERMISSION_DENIED = 'ERR_PERMISSION_DENIED',
  ERR_AUTH_REQUIRED = 'ERR_AUTH_REQUIRED',
  ERR_NETWORK = 'ERR_NETWORK',
  ERR_DATABASE = 'ERR_DATABASE',
  ERR_UNKNOWN = 'ERR_UNKNOWN',
}

export const DEFAULT_ARABIC_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.ERR_VALIDATION_FAILED]: 'بيانات غير صالحة، يرجى التحقق من المدخلات.',
  [ErrorCode.ERR_TRANSACTION_FAILED]: 'تعذر حفظ المعاملة، تم التراجع عن العملية بالكامل.',
  [ErrorCode.ERR_INSUFFICIENT_STOCK]: 'الكمية المطلوبة غير متوفرة في المخزون.',
  [ErrorCode.ERR_PERIOD_LOCKED]: 'الفترة المحاسبية مغلقة ولا يمكن التعديل أو الترحيل فيها.',
  [ErrorCode.ERR_ACCOUNTING_UNBALANCED]: 'القيد المحاسبي غير متوازن (إجمالي المدين لا يساوي الدائن).',
  [ErrorCode.ERR_DUPLICATE_DOCUMENT]: 'المستند مكرر أو المعرف موجود من قبل.',
  [ErrorCode.ERR_PERMISSION_DENIED]: 'ليس لديك الصلاحية الكافية لتنفيذ هذه العملية.',
  [ErrorCode.ERR_AUTH_REQUIRED]: 'يتطلب إجراء هذه العملية تسجيل الدخول أولاً.',
  [ErrorCode.ERR_NETWORK]: 'فشل الاتصال بالشبكة، يرجى التحقق من الاتصال بالإنترنت.',
  [ErrorCode.ERR_DATABASE]: 'حدث خطأ في قاعدة البيانات أثناء معالجة الطلب.',
  [ErrorCode.ERR_UNKNOWN]: 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.',
};
