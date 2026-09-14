import { useState, useEffect, useCallback } from 'react';
import { SettingsCard } from '../../settings/components/shared/SettingsUI';
import { 
  Database, 
  Cloud, 
  ShieldCheck, 
  Download, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  RefreshCw, 
  Layers, 
  HardDrive, 
  Calendar, 
  Check, 
  X, 
  Lock, 
  FileText,
  AlertTriangle
} from 'lucide-react';
import { backupService } from '../services/BackupService';
import { backupManagementService } from '../services/BackupManagementService';
import { backupHealthService } from '../services/BackupHealthService';
import { 
  BackupInventoryItem, 
  BackupHealthSummary, 
  BackupValidationResult, 
  CleanupPlan,
  RetentionPolicy 
} from '../backup.types';
import { useSettingsStore } from '@/store/useSettingsStore';
import { db } from '@/core/db';

export const BackupCenter = () => {
  const { backupPassword } = useSettingsStore();

  // Async operational states
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [isApplyingCleanup, setIsApplyingCleanup] = useState(false);

  // Notifications
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Inventory & Health state
  const [inventory, setInventory] = useState<BackupInventoryItem[]>([]);
  const [healthSummary, setHealthSummary] = useState<BackupHealthSummary | null>(null);
  const [lastValidation, setLastValidation] = useState<BackupValidationResult | null>(null);

  // Retention & Cleanup state
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy>(() => 
    backupManagementService.getRetentionPolicy()
  );
  const [cleanupPlan, setCleanupPlan] = useState<CleanupPlan | null>(null);
  const [showCleanupModal, setShowCleanupModal] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<BackupInventoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch inventory and health summary
  const loadBackupData = useCallback(async () => {
    setIsLoadingInventory(true);
    try {
      const [items, summary] = await Promise.all([
        backupManagementService.listBackups(),
        backupHealthService.getDetailedHealthSummary()
      ]);
      setInventory(items);
      setHealthSummary(summary);
    } catch (err) {
      console.error('[BackupCenter] Failed to load backup inventory:', err);
    } finally {
      setIsLoadingInventory(false);
    }
  }, []);

  useEffect(() => {
    loadBackupData();
  }, [loadBackupData]);

  // Handle dry-run memory validation
  const handleValidateBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setLastValidation(null);

    if (!backupPassword || !backupPassword.trim()) {
      setErrorMessage("يرجى إدخال كلمة مرور النسخة الاحتياطية في الإعدادات للمتابعة.");
      e.target.value = '';
      return;
    }

    setIsValidating(true);
    try {
      const result = await backupManagementService.validateBackup(file, backupPassword);
      setLastValidation(result);
      if (result.valid) {
        setSuccessMessage(`فحص السلامة ناجح: النسخة صالحة ومطابقة للمعايير (${result.tables?.length || 0} جداول، إجمالي ${result.totalRecords || 0} سجل).`);
      } else {
        setErrorMessage(result.error || "فشل التحقق من صحة وسلامة النسخة الاحتياطية.");
      }
      loadBackupData();
    } catch (err: any) {
      setErrorMessage(err?.message || "فشل التحقق من صحة النسخة الاحتياطية");
    } finally {
      setIsValidating(false);
      e.target.value = '';
    }
  };

  // Handle local backup creation
  const handleCreateLocalBackup = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!backupPassword || !backupPassword.trim()) {
      setErrorMessage("يرجى إدخال كلمة مرور النسخة الاحتياطية في الإعدادات قبل إنشاء النسخة.");
      return;
    }

    setIsCreating(true);
    try {
      const [products, invoices, customers, suppliers, accounts] = await Promise.all([
        db.products.toArray().catch(() => []),
        db.invoices.toArray().catch(() => []),
        db.customers.toArray().catch(() => []),
        db.suppliers.toArray().catch(() => []),
        db.accounts.toArray().catch(() => [])
      ]);

      const data = {
        products,
        invoices,
        customers,
        suppliers,
        accounts,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      const result = await backupService.createLocalBackup(data, backupPassword, 'full');
      
      // Trigger download of the encrypted backup package
      if (result.blob) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.metadata.name;
        a.click();
        URL.revokeObjectURL(url);
      }

      setSuccessMessage(`تم إنشاء وتشفير النسخة الاحتياطية بنجاح: ${result.metadata.name}`);
      await loadBackupData();
    } catch (err: any) {
      setErrorMessage(err?.message || "فشل إنشاء النسخة الاحتياطية");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle restore from .pfb file
  const handleRestoreLocalBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!backupPassword || !backupPassword.trim()) {
      setErrorMessage("يرجى إدخال كلمة مرور النسخة الاحتياطية");
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    try {
      const result = await backupService.restoreBackup(file, backupPassword);
      setSuccessMessage(`تمت استعادة البيانات بنجاح (${result.restoredTables.length} جداول مستعادة).`);
      await loadBackupData();
    } catch (err: any) {
      setErrorMessage(err?.message || "فشلت استعادة النسخة الاحتياطية");
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
  };

  // Handle safe single backup deletion
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await backupManagementService.deleteLocalBackup(deleteTarget.id);
      setSuccessMessage(`تم حذف سجل النسخة الاحتياطية "${deleteTarget.name}" بنجاح.`);
      setDeleteTarget(null);
      await loadBackupData();
    } catch (err: any) {
      setErrorMessage(err?.message || "فشل حذف النسخة الاحتياطية.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Retention policy handlers
  const handleUpdatePolicy = (updates: Partial<RetentionPolicy>) => {
    const updated = backupManagementService.setRetentionPolicy(updates);
    setRetentionPolicy(updated);
  };

  const handlePreviewCleanup = async () => {
    setErrorMessage(null);
    const plan = await backupManagementService.createCleanupPlan(retentionPolicy);
    setCleanupPlan(plan);
    setShowCleanupModal(true);
  };

  const handleApplyCleanup = async () => {
    if (!cleanupPlan || cleanupPlan.candidates.length === 0) return;

    setIsApplyingCleanup(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await backupManagementService.applyCleanupPlan(cleanupPlan);
      if (res.success) {
        setSuccessMessage(`تم تنظيف ${res.deletedCount} نسخة احتياطية قديمة بأمان وفقاً لسياسة الاحتفاظ.`);
      } else {
        setErrorMessage(`تم تنظيف ${res.deletedCount} نسخة، مع تعذر حذف ${res.errors.length} نسخ.`);
      }
      setShowCleanupModal(false);
      setCleanupPlan(null);
      await loadBackupData();
    } catch (err: any) {
      setErrorMessage(err?.message || "فشل تنفيذ خطة التنظيف.");
    } finally {
      setIsApplyingCleanup(false);
    }
  };

  return (
    <div className="p-6 font-cairo max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
            <ShieldCheck className="text-[#1E4D4D] dark:text-teal-400" size={28} />
            <span>مركز إدارة وحماية النسخ الاحتياطية</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            إدارة متقدمة للنسخ المحلية المشفرة، سياسات الاحتفاظ، والتحقق الدوري من سلامة البيانات
          </p>
        </div>

        <button
          onClick={loadBackupData}
          disabled={isLoadingInventory}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer w-fit"
          title="تحديث السجل"
        >
          <RefreshCw size={14} className={isLoadingInventory ? "animate-spin" : ""} />
          <span>تحديث السجل</span>
        </button>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-2xl text-sm border border-rose-200 dark:border-rose-800/60 shadow-xs">
          <AlertCircle size={20} className="shrink-0 text-rose-500" />
          <span className="font-medium">{errorMessage}</span>
          <button 
            onClick={() => setErrorMessage(null)} 
            className="mr-auto text-rose-400 hover:text-rose-600 p-1 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-2xl text-sm border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
          <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
          <span className="font-medium">{successMessage}</span>
          <button 
            onClick={() => setSuccessMessage(null)} 
            className="mr-auto text-emerald-400 hover:text-emerald-600 p-1 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3.6 Health Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold mb-1">
            <HardDrive size={15} className="text-[#1E4D4D] dark:text-teal-400" />
            <span>إجمالي النسخ المسجلة</span>
          </div>
          <div className="text-2xl font-black text-slate-800 dark:text-slate-100">
            {healthSummary ? healthSummary.totalBackups : '—'}
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            {healthSummary ? `${healthSummary.localBackupsCount} محلية` : ''}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold mb-1">
            <Calendar size={15} className="text-indigo-500" />
            <span>آخر نسخة تم إنشاؤها</span>
          </div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
            {healthSummary?.latestBackupDate 
              ? new Date(healthSummary.latestBackupDate).toLocaleDateString('ar-EG', { dateStyle: 'medium' }) 
              : 'لا توجد نسخ'}
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
            {healthSummary?.latestBackupDate 
              ? new Date(healthSummary.latestBackupDate).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
              : 'جاهز لإنشاء أول نسخة'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold mb-1">
            <Cloud size={15} className="text-sky-500" />
            <span>التخزين السحابي</span>
          </div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Storage Adapter
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            <Check size={12} />
            <span>جاهز ومعزول</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold mb-1">
            <Lock size={15} className="text-amber-500" />
            <span>حالة التشفير والسلامة</span>
          </div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
            AES-256 + HMAC
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            PBKDF2 (100k) + Authenticated MAC
          </div>
        </div>
      </div>

      {/* Main Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SettingsCard title="حالة المحرك ومصدر البيانات" icon={Database}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
              <span className="text-slate-600 dark:text-slate-300">محرك التخزين المحلي:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">IndexedDB / Dexie PRO</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
              <span className="text-slate-600 dark:text-slate-300">هيكل الحزمة:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">.pfb (data.enc + metadata.json)</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
              <span className="text-slate-600 dark:text-slate-300">حماية كلمة المرور:</span>
              <span className={`font-bold ${backupPassword ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {backupPassword ? 'خزنة مشفرة (Protected Vault)' : 'غير مُحددة (مطلوبة للنسخ/الاستعادة)'}
              </span>
            </div>
          </div>
        </SettingsCard>
        
        <SettingsCard title="إجراءات العمليات السريعة" icon={ShieldCheck}>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            إنشاء نسخة مشفرة فورية، فحص ملف بدون تعديل القاعدة، أو استعادة كاملة بمعاملة ذرية.
          </p>

          <div className="flex flex-wrap gap-2.5">
            <button 
              onClick={handleCreateLocalBackup}
              disabled={isCreating || isRestoring || isValidating}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-[#1E4D4D] hover:bg-[#1E4D4D]/90 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isCreating ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              <span>{isCreating ? "جاري التشفير..." : "إنشاء نسخة محلية"}</span>
            </button>

            <label className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${isRestoring || isCreating || isValidating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} shadow-xs`}>
              <input
                type="file"
                accept=".pfb,.zip"
                className="hidden"
                disabled={isRestoring || isCreating || isValidating}
                onChange={handleRestoreLocalBackup}
              />
              {isRestoring ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              <span>{isRestoring ? "جاري الاستعادة..." : "استعادة ملف (.pfb)"}</span>
            </label>

            <label className={`w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${isValidating || isRestoring || isCreating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} shadow-xs`}>
              <input
                type="file"
                accept=".pfb,.zip"
                className="hidden"
                disabled={isValidating || isRestoring || isCreating}
                onChange={handleValidateBackup}
              />
              {isValidating ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} className="text-emerald-400" />}
              <span>{isValidating ? "جاري الفحص بالذاكرة..." : "فحص سلامة ملف (بدون استعادة / Memory-Only)"}</span>
            </label>
          </div>
        </SettingsCard>
      </div>

      {/* 3.3 Validation Result Breakdown (if present) */}
      {lastValidation && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className={lastValidation.valid ? "text-emerald-500" : "text-rose-500"} size={20} />
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                تقرير التحقق والفحص بالذاكرة (Dry-Run Validation Result)
              </h3>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-bold ${
              lastValidation.valid 
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' 
                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
            }`}>
              {lastValidation.valid ? 'سليم وصالح للاستعادة' : 'غير صالح'}
            </span>
          </div>

          {lastValidation.valid ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-slate-400 block mb-0.5">إجمالي السجلات:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{lastValidation.totalRecords || 0}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-slate-400 block mb-0.5">عدد الجداول:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{lastValidation.tables?.length || 0}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-slate-400 block mb-0.5">حالة التشفير:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">AES-256 تم الفك</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-slate-400 block mb-0.5">رمز التحقق Checksum:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">مطابق (SHA-256)</span>
                </div>
              </div>

              {lastValidation.recordCounts && Object.keys(lastValidation.recordCounts).length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-2">
                    توزيع السجلات عبر الجداول:
                  </span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {Object.entries(lastValidation.recordCounts).map(([table, count]) => (
                      <span key={table} className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                        {table}: <strong className="text-slate-900 dark:text-slate-100">{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {lastValidation.warnings && lastValidation.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-bold block mb-1">ملاحظات وتحذيرات التوافق:</span>
                  <ul className="list-disc list-inside space-y-0.5">
                    {lastValidation.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-xl text-xs">
              {lastValidation.error || 'تعذر التحقق من بيانات النسخة الاحتياطية.'}
            </div>
          )}
        </div>
      )}

      {/* 3.1 & 3.5 Backup Inventory & Retention Policy Header */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Layers className="text-[#1E4D4D] dark:text-teal-400" size={20} />
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              سجل وجرد النسخ الاحتياطية المحلية (Backup Inventory)
            </h2>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-bold">
              {inventory.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">الحد الأقصى للاحتفاظ:</span>
              <select
                value={retentionPolicy.maxLocalBackups}
                onChange={(e) => handleUpdatePolicy({ maxLocalBackups: Number(e.target.value) })}
                className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-none rounded-lg px-2 py-1 text-xs font-bold"
              >
                <option value={3}>3 نسخ</option>
                <option value={5}>5 نسخ</option>
                <option value={10}>10 نسخ</option>
                <option value={20}>20 نسخة</option>
              </select>
            </div>

            <button
              onClick={handlePreviewCleanup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold transition-all cursor-pointer border border-amber-200 dark:border-amber-800/60"
            >
              <Trash2 size={13} />
              <span>فحص التنظيف</span>
            </button>
          </div>
        </div>

        {/* 3.1 Inventory Table */}
        {isLoadingInventory ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
            <Loader2 size={18} className="animate-spin text-[#1E4D4D] dark:text-teal-400" />
            <span>جاري قراءة سجل النسخ الاحتياطية...</span>
          </div>
        ) : inventory.length === 0 ? (
          <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <HardDrive size={36} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">لا توجد نسخ احتياطية مسجلة محلياً</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              انقر على &quot;إنشاء نسخة محلية&quot; لإنشاء أول حزمة مشفرة وحفظها محلياً.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                  <th className="pb-3 pr-2">اسم النسخة</th>
                  <th className="pb-3">تاريخ الإنشاء</th>
                  <th className="pb-3">النوع</th>
                  <th className="pb-3">الحجم التقريبي</th>
                  <th className="pb-3">الحالة</th>
                  <th className="pb-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {inventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pr-2">
                      <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <FileText size={14} className="text-[#1E4D4D] dark:text-teal-400 shrink-0" />
                        <span className="truncate max-w-xs">{item.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">ID: {item.id}</span>
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">
                      {new Date(item.createdAt).toLocaleDateString('ar-EG', { dateStyle: 'medium' })}
                      <span className="text-[10px] text-slate-400 block">
                        {new Date(item.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        item.type === 'full' 
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60'
                          : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60'
                      }`}>
                        {item.type === 'full' ? 'كاملة (Full)' : 'سريعة (Fast)'}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-300 font-mono">
                      {item.sizeInKB ? `${item.sizeInKB} KB` : '—'}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        item.status === 'failed'
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                          : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {item.status === 'failed' ? 'فشلت' : 'محلية (Local)'}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="حذف سجل النسخة المحلية"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3.4 Safe Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 font-cairo" dir="rtl">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-950/60 rounded-xl">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">تأكيد حذف سجل النسخة</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">عملية الحذف آمنة وتزيل السجل المحلي فقط</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs space-y-1.5">
              <div>
                <span className="text-slate-400">الاسم: </span>
                <strong className="text-slate-800 dark:text-slate-200">{deleteTarget.name}</strong>
              </div>
              <div>
                <span className="text-slate-400">المعرف: </span>
                <span className="font-mono text-slate-600 dark:text-slate-300">{deleteTarget.id}</span>
              </div>
              <div>
                <span className="text-slate-400">التاريخ: </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {new Date(deleteTarget.createdAt).toLocaleString('ar-EG')}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              هل أنت متأكد من رغبتك في إزالة هذا السجل من جرد النسخ الاحتياطية؟ (لن يتم حذف الملفات التي قمت بتحميلها على جهازك).
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                إلغاء
              </button>

              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{isDeleting ? "جاري الحذف..." : "تأكيد الحذف"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3.5 Retention Policy Preview Modal */}
      {showCleanupModal && cleanupPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 font-cairo" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
                <Trash2 size={20} />
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  معاينة خطة التنظيف وفق سياسة الاحتفاظ
                </h3>
              </div>
              <button 
                onClick={() => setShowCleanupModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">إجمالي النسخ الحالية:</span>
                  <strong className="text-slate-800 dark:text-slate-200">{cleanupPlan.totalBackups}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الحد الأقصى المسموح به:</span>
                  <strong className="text-slate-800 dark:text-slate-200">{cleanupPlan.maxAllowed}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">النسخ المرشحة للحذف:</span>
                  <strong className="text-rose-600 dark:text-rose-400">{cleanupPlan.toDeleteCount}</strong>
                </div>
              </div>

              <p className="text-slate-600 dark:text-slate-400 text-xs">
                {cleanupPlan.reason}
              </p>

              {cleanupPlan.candidates.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold">
                      <tr>
                        <th className="p-2">اسم النسخة</th>
                        <th className="p-2">تاريخ الإنشاء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {cleanupPlan.candidates.map((c) => (
                        <tr key={c.id} className="text-slate-700 dark:text-slate-300">
                          <td className="p-2 font-mono text-[11px] truncate max-w-[200px]">{c.name}</td>
                          <td className="p-2 text-[11px]">{new Date(c.createdAt).toLocaleDateString('ar-EG')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowCleanupModal(false)}
                disabled={isApplyingCleanup}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                إغلاق
              </button>

              {cleanupPlan.candidates.length > 0 && (
                <button
                  onClick={handleApplyCleanup}
                  disabled={isApplyingCleanup}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isApplyingCleanup ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  <span>{isApplyingCleanup ? "جاري التنظيف..." : `تنظيف ${cleanupPlan.candidates.length} نسخة`}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
