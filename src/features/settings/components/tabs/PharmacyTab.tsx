import { useState, useEffect } from 'react';
import { SettingsCard, Accordion, SettingInput, SettingToggle, SettingSelect } from '../shared/SettingsUI';
import { Building2, Printer, Download, Image as ImageIcon } from 'lucide-react';
import { settingsService, type SettingValue } from '../../data/SettingsService';

export default function PharmacyTab() {
  const [settings, setSettings] = useState<Record<string, SettingValue>>({});

  useEffect(() => {
    settingsService.getSettingsGroup([
      'pharmacy_name', 'pharmacy_logo', 'pharmacy_address', 'pharmacy_phone', 
      'tax_number', 'commercial_record', 'invoice_qr', 'print_paper_size',
      'print_margin', 'print_copies', 'print_logo', 'invoice_footer'
    ]).then(setSettings);
  }, []);

  const handleChange = (key: string, value: SettingValue) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    settingsService.saveSetting(key, value, true);
  };

  return (
    <div className="space-y-6">
      <SettingsCard title="شعار وأيقونة الهوية الموحدة" description="معاينة وتحميل الشعار والأيقونة الرسمية مباشرة للطباعة والوثائق والتطبيقات" icon={ImageIcon}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#1E4D4D]/20 shadow-sm bg-white shrink-0 p-1">
              <img src="/pharmaflow_logo.jpg" alt="PharmaFlow Logo" className="w-full h-full object-cover rounded-xl" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm truncate">شعار PharmaFlow (Logo)</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">pharmaflow_logo.jpg</p>
            </div>
            <a
              href="/pharmaflow_logo.jpg"
              download="pharmaflow_logo.jpg"
              className="flex items-center gap-1.5 px-3 py-2 bg-[#1E4D4D] text-white hover:bg-[#153737] rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
            >
              <Download size={14} />
              <span>تحميل</span>
            </a>
          </div>

          <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#1E4D4D]/20 shadow-sm bg-white shrink-0 p-1">
              <img src="/pharmaflow_icon.jpg" alt="PharmaFlow Icon" className="w-full h-full object-cover rounded-xl" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm truncate">أيقونة PharmaFlow (Icon)</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">pharmaflow_icon.jpg</p>
            </div>
            <a
              href="/pharmaflow_icon.jpg"
              download="pharmaflow_icon.jpg"
              className="flex items-center gap-1.5 px-3 py-2 bg-[#1E4D4D] text-white hover:bg-[#153737] rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
            >
              <Download size={14} />
              <span>تحميل</span>
            </a>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="بيانات الصيدلية" description="تظهر هذه البيانات في الفواتير والتقارير" icon={Building2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SettingInput label="اسم الصيدلية" value={settings.pharmacy_name} onChange={(v: string) => handleChange('pharmacy_name', v)} />
          <SettingInput label="رقم الهاتف" value={settings.pharmacy_phone} onChange={(v: string) => handleChange('pharmacy_phone', v)} />
          <SettingInput label="الرقم الضريبي" value={settings.tax_number} onChange={(v: string) => handleChange('tax_number', v)} />
          <SettingInput label="السجل التجاري" value={settings.commercial_record} onChange={(v: string) => handleChange('commercial_record', v)} />
          <div className="md:col-span-2">
             <SettingInput label="العنوان التفصيلي" value={settings.pharmacy_address} onChange={(v: string) => handleChange('pharmacy_address', v)} />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="إعدادات الطباعة والفواتير" description="التحكم في شكل وطباعة الفاتورة" icon={Printer}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <SettingSelect
            label="مقاس الورق الافتراضي"
            value={(settings.print_paper_size as string) || 'receipt_80'}
            onChange={(v: string) => handleChange('print_paper_size', v)}
            options={[
              { value: 'receipt_80', label: 'رول إيصالات (80mm)' },
              { value: 'receipt_58', label: 'رول إيصالات (58mm)' },
              { value: 'a4', label: 'A4 كامل' },
              { value: 'a5', label: 'A5 نصف ورقة' }
            ]}
          />
          <SettingInput type="number" label="عدد النسخ الافتراضي" value={(settings.print_copies as string) || '1'} onChange={(v: string) => handleChange('print_copies', v)} />
        </div>
        
        <Accordion title="خيارات إضافية للطباعة">
          <div className="space-y-4">
            <SettingToggle label="طباعة الشعار على الفاتورة" checked={settings.print_logo} onChange={(v: boolean) => handleChange('print_logo', v)} />
            <SettingToggle label="توليد رمز QR للفاتورة (متوافق مع هيئة الزكاة)" checked={settings.invoice_qr} onChange={(v: boolean) => handleChange('invoice_qr', v)} />
            <SettingInput label="تذييل الفاتورة (رسالة ترحيبية)" value={(settings.invoice_footer as string) || 'نتمنى لكم دوام الصحة والعافية'} onChange={(v: string) => handleChange('invoice_footer', v)} />
          </div>
        </Accordion>
      </SettingsCard>
    </div>
  );
}
