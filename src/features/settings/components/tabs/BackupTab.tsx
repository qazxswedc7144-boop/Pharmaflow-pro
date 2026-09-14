import { useState } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Shield, Download, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { SettingsCard, SettingToggle, SettingInput } from '../shared/SettingsUI';
import { backupService } from '@/features/backup/services/BackupService';
import { db } from '@/core/db';

export default function BackupTab() {
  const { autoBackupEnabled, backupPassword, setAutoBackupEnabled, setBackupPassword } = useSettingsStore();
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleCreateBackup = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!backupPassword || !backupPassword.trim()) {
      setErrorMsg("يرجى إدخال كلمة مرور النسخة الاحتياطية");
      return;
    }

    setIsCreating(true);
    try {
      const products = await db.products.toArray().catch(() => []);
      const invoices = await db.invoices.toArray().catch(() => []);
      const customers = await db.customers.toArray().catch(() => []);
      const suppliers = await db.suppliers.toArray().catch(() => []);
      const accounts = await db.accounts.toArray().catch(() => []);

      const payloadData = {
        products,
        invoices,
        customers,
        suppliers,
        accounts,
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      };

      const result = await backupService.createLocalBackup(payloadData, backupPassword, 'full');
      
      // Trigger download of the encrypted backup package
      if (result.blob) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.metadata.name;
        a.click();
        URL.revokeObjectURL(url);
      }

      setSuccessMsg(`تم إنشاء وتشفير النسخة الاحتياطية بنجاح: ${result.metadata.name}`);
    } catch (err: any) {
      setErrorMsg(err?.message || "فشل إنشاء النسخة الاحتياطية");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!backupPassword || !backupPassword.trim()) {
      setErrorMsg("يرجى إدخال كلمة مرور النسخة الاحتياطية");
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    try {
      const result = await backupService.restoreBackup(file, backupPassword);
      setSuccessMsg(`تمت استعادة البيانات بنجاح (${result.restoredTables.length} جداول مستعادة).`);
    } catch (err: any) {
      setErrorMsg(err?.message || "فشلت استعادة النسخة الاحتياطية");
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6 font-cairo">
      <SettingsCard 
        title="إعدادات النسخ الاحتياطي التلقائي" 
        description="حماية واستعادة بيانات الصيدلية تلقائياً وعند الإغلاق" 
        icon={Shield}
      >
        <div className="space-y-4">
          <SettingToggle
            label="تفعيل النسخ الاحتياطي التلقائي عند الإغلاق"
            description="حفظ نسخة احتياطية آمنة في التخزين المحلي والإنترنت عند إغلاق التطبيق"
            checked={autoBackupEnabled}
            onChange={(v) => setAutoBackupEnabled(v)}
            icon={Shield}
          />

          <SettingInput
            label="كلمة مرور التشفير للنسخة الاحتياطية"
            description="كلمة مرور سرية حصرية لتشفير النسخ الاحتياطية لمنع الوصول غير المصرح به"
            type="password"
            value={backupPassword}
            onChange={(val) => setBackupPassword(val)}
            placeholder="أدخل كلمة مرور قوية"
          />

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded-xl text-sm border border-rose-200 dark:border-rose-800 font-cairo">
              <AlertCircle size={18} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-xl text-sm border border-emerald-200 dark:border-emerald-800 font-cairo">
              <CheckCircle2 size={18} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="pt-2 flex flex-wrap gap-3 justify-start">
            <button
              onClick={handleCreateBackup}
              disabled={isCreating || isRestoring}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1E4D4D] hover:bg-[#1E4D4D]/90 text-white rounded-xl font-cairo text-sm font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isCreating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>جاري إنشاء النسخة المشفرة...</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>إنشاء نسخة احتياطية محلية الآن</span>
                </>
              )}
            </button>

            <label className={`flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-cairo text-sm font-bold shadow-sm transition-all ${isRestoring ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="file"
                accept=".pfb,.zip"
                className="hidden"
                disabled={isRestoring || isCreating}
                onChange={handleRestoreBackup}
              />
              {isRestoring ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>جاري فك التشفير والاستعادة...</span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  <span>استعادة من ملف (.pfb)</span>
                </>
              )}
            </label>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}

