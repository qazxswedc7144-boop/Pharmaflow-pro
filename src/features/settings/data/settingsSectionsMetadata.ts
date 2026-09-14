import { lazy } from 'react';
import { 
  Settings, Building2, Users, ShoppingCart, Truck, 
  Package, RefreshCw, ShieldCheck, Code,
  CreditCard, Globe, Clock, Cpu, Shield, Landmark
} from 'lucide-react';
import { SettingsGroup, SettingsSectionItem } from '../types/settingsNavigation.types';

// Lazy load section tabs for optimal performance
export const GeneralTab = lazy(() => import('../components/tabs/GeneralTab'));
export const PharmacyTab = lazy(() => import('../components/tabs/PharmacyTab'));
export const UsersTab = lazy(() => import('../components/tabs/UsersTab'));
export const SalesTab = lazy(() => import('../components/tabs/SalesTab'));
export const PurchasesTab = lazy(() => import('../components/tabs/PurchasesTab'));
export const InventoryTab = lazy(() => import('../components/tabs/InventoryTab'));
export const SecurityTab = lazy(() => import('../components/tabs/SecurityTab'));
export const SubscriptionTab = lazy(() => import('../components/tabs/SubscriptionTab'));
export const DeveloperTab = lazy(() => import('../components/tabs/DeveloperTab'));
export const BackupTab = lazy(() => import('../components/tabs/BackupTab'));

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: 'system',
    title: 'النظام والأمان',
    description: 'الهوية العامة، المستخدمون، الفروع، وسجلات الأمان',
    icon: Shield,
    colorClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60'
  },
  {
    id: 'i18n',
    title: 'التدويل والوقت',
    description: 'العملات الإقليمية، فروق التوقيت، وصيغ التقويم',
    icon: Globe,
    colorClass: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/60'
  },
  {
    id: 'business',
    title: 'العمليات التجارية',
    description: 'إعدادات دورة المبيعات، المشتريات، والمخزون',
    icon: ShoppingCart,
    colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60'
  },
  {
    id: 'maintenance',
    title: 'الصيانة والحساب',
    description: 'النسخ الاحتياطي، المزامنة، الأداء، والتراخيص',
    icon: Cpu,
    colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60'
  }
];

export const SETTINGS_SECTIONS: SettingsSectionItem[] = [
  // Group 1: النظام والأمان (System & Security)
  {
    id: 'general',
    groupId: 'system',
    title: 'إعدادات النظام العامة',
    description: 'تخصيص الهوية واللغة والمظهر العام وتفضيلات الواجهة',
    keywords: ['نظام', 'عام', 'مظهر', 'لغة', 'هوية', 'ليلي', 'نهاري', 'اسم', 'ثيم', 'system', 'general', 'theme', 'language'],
    icon: Settings,
    component: GeneralTab
  },
  {
    id: 'users',
    groupId: 'system',
    title: 'المستخدمون والصلاحيات',
    description: 'إدارة حسابات الموظفين، الأدوار، ومستويات الوصول والأذونات',
    keywords: ['مستخدم', 'مستخدمين', 'صلاحيات', 'أدوار', 'وصول', 'موظفين', 'أمان', 'users', 'roles', 'permissions'],
    icon: Users,
    component: UsersTab
  },
  {
    id: 'pharmacy',
    groupId: 'system',
    title: 'الفروع وبيانات الصيدلية',
    description: 'بيانات الصيدلية، الفروع، الشعار، وإعدادات الطباعة والترويسة',
    keywords: ['صيدلية', 'فرع', 'فروع', 'شعار', 'طباعة', 'عنوان', 'هاتف', 'سجل', 'ضريبة', 'لوجو', 'pharmacy', 'branch', 'logo'],
    icon: Building2,
    component: PharmacyTab
  },
  {
    id: 'security',
    groupId: 'system',
    title: 'سجل الأمان والتدقيق',
    description: 'مراقبة الأنشطة وسجلات الدخول والعمليات الحساسة وتدقيق الأذونات',
    keywords: ['أمان', 'تدقيق', 'سجلات', 'دخول', 'حماية', 'مراقبة', 'audit', 'security', 'log', 'activity'],
    icon: ShieldCheck,
    component: SecurityTab
  },
  {
    id: 'developer',
    groupId: 'system',
    title: 'أدوات المطور والتشخيص',
    description: 'أدوات تشخيص الأداء، سجلات النظام، ومفاتيح الربط البرمجي',
    keywords: ['مطور', 'تشخيص', 'أخطاء', 'فحص', 'واجهات', 'برمجة', 'api', 'developer', 'debug', 'flags'],
    icon: Code,
    component: DeveloperTab
  },

  // Group 2: التدويل والوقت (Internationalization & Time)
  {
    id: 'currency',
    groupId: 'i18n',
    title: 'العملة والمنطقة الزمنية',
    description: 'تحديد العملة الأساسية، أسعار الصرف، وفروق التوقيت الإقليمي',
    keywords: ['عملة', 'منطقة زمنية', 'دولار', 'ريال', 'جنيه', 'توقيت', 'فروق توقيت', 'currency', 'timezone', 'money'],
    icon: Landmark,
    component: GeneralTab
  },
  {
    id: 'datetime',
    groupId: 'i18n',
    title: 'التاريخ وصيغ الوقت',
    description: 'صيغ عرض التواريخ، التقويم الهجري/الميلادي، ونظام 12/24 ساعة',
    keywords: ['تاريخ', 'وقت', 'ساعة', 'تقويم', 'تنسيق', 'صيغة', 'date', 'time', 'calendar'],
    icon: Clock,
    component: GeneralTab
  },

  // Group 3: العمليات التجارية (Business Operations)
  {
    id: 'sales',
    groupId: 'business',
    title: 'إعدادات المبيعات ونقاط البيع',
    description: 'تكوين فواتير البيع، الضرائب، الخصومات، والطباعة الفورية',
    keywords: ['مبيعات', 'فواتير', 'ضرائب', 'خصم', 'دفع', 'كاش', 'نقاط بيع', 'sales', 'invoice', 'tax', 'discount'],
    icon: ShoppingCart,
    component: SalesTab
  },
  {
    id: 'purchases',
    groupId: 'business',
    title: 'إعدادات المشتريات والموردين',
    description: 'إدارة الموردين، طلبات الشراء، وسياسات التوريد والاعتمادات',
    keywords: ['مشتريات', 'موردين', 'طلبات شراء', 'فواتير شراء', 'توريد', 'purchases', 'suppliers', 'vendor'],
    icon: Truck,
    component: PurchasesTab
  },
  {
    id: 'inventory',
    groupId: 'business',
    title: 'إعدادات المخزون والتنبيهات',
    description: 'مستويات التنبيه، سياسات الصرف (FEFO)، ووحدات القياس الدوائية',
    keywords: ['مخزون', 'أصناف', 'تنبيه', 'نواقص', 'وحدات قياس', 'صلاحية', 'inventory', 'stock', 'alert'],
    icon: Package,
    component: InventoryTab
  },

  // Group 4: الصيانة والحساب (Maintenance & Subscription)
  {
    id: 'performance',
    groupId: 'maintenance',
    title: 'الأداء وتوفير الموارد (Eco Mode)',
    description: 'وضع التوفير الاقتصادي للطاقة والذاكرة وسرعة استجابة الأجهزة',
    keywords: ['أداء', 'أجهزة', 'طابعات', 'سرعة', 'توفير', 'بطارية', 'ذاكرة', 'eco', 'performance', 'hardware'],
    icon: Cpu,
    component: DeveloperTab
  },
  {
    id: 'backup',
    groupId: 'maintenance',
    title: 'النسخ الاحتياطي والتعافي',
    description: 'النسخ المحلي المشفر والسحابي، الاستعادة، وجاهزية التعافي من الكوارث',
    keywords: ['نسخ', 'احتياطي', 'سحابي', 'محلي', 'استعادة', 'مزامنة', 'طوارئ', 'backup', 'cloud', 'sync', 'restore'],
    icon: RefreshCw,
    component: BackupTab
  },
  {
    id: 'subscription',
    groupId: 'maintenance',
    title: 'إدارة الاشتراك والترخيص',
    description: 'إدارة باقة الاشتراك السحابي، التراخيص، والدعم الفني المباشر',
    keywords: ['اشتراك', 'ترخيص', 'باقة', 'دعم', 'ترقية', 'فواتير', 'تجديد', 'subscription', 'license', 'billing', 'support'],
    icon: CreditCard,
    component: SubscriptionTab
  }
];

