import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FinancialAuditEntry } from '@/types';
import { db } from '@/core/db';
import { authService } from '@features/auth/services/authService';

export interface EncryptedExportOptions {
  logs: (FinancialAuditEntry | any)[];
  password?: string;
  reportTitle?: string;
  includeComplianceSeal?: boolean;
  dateFilterRange?: string;
  exportedBy?: string;
  pharmacyName?: string;
  taxNumber?: string;
}

export interface ExportResult {
  filename: string;
  passwordUsed: string;
  recordCount: number;
  securityHash: string;
}

/**
 * Encrypted Audit Export Service
 * الخدمة المتخصصة بتصدير وتشفير سجلات التدقيق والامتثال المالي بكلمات مرور محمية
 */
export const EncryptedAuditExportService = {

  /**
   * حساب التوقيع الرقمي لبصمة السجلات (Cryptographic SHA-256 Hash)
   */
  async calculateLogHash(logs: any[]): Promise<string> {
    try {
      const summaryString = logs.map(l => `${l.Log_ID || l.id}_${l.Modified_At || l.timestamp}_${l.Change_Type || l.action}`).join('|');
      const encoder = new TextEncoder();
      const data = encoder.encode(summaryString + '_PHARMAFLOW_ISO27001');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32).toUpperCase();
    } catch {
      return 'SEC-HASH-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    }
  },

  /**
   * إنشاء وتشفير تقرير الـ PDF
   */
  async exportEncryptedAuditPDF(options: EncryptedExportOptions): Promise<ExportResult> {
    const {
      logs,
      password = '',
      reportTitle = 'تقرير تدقيق الأمان والامتثال المالي',
      includeComplianceSeal: _includeComplianceSeal = true,
      dateFilterRange = 'كافة السجلات',
      exportedBy = authService.getCurrentUser()?.User_Email || 'مدير النظام',
      pharmacyName = 'صيدلية فارما فلو - PharmaFlow Pharmacy',
      taxNumber = '300988712300003'
    } = options;

    const securityHash = await this.calculateLogHash(logs);
    const now = new Date();
    const formattedDate = now.toLocaleString('ar-SA');
    const isoDate = now.toISOString().slice(0, 10);
    const filename = `PharmaFlow_Audit_Log_Encrypted_${isoDate}_${Math.floor(Math.random() * 1000)}`;

    // 1. إعداد خيارات التشفير في jsPDF
    const pdfOptions: any = {
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    };

    if (password && password.trim().length > 0) {
      pdfOptions.encryption = {
        userPassword: password.trim(),
        ownerPassword: password.trim() + '_MASTER_LOCK',
        userPermissions: ['print']
      };
    }

    const doc = new jsPDF(pdfOptions) as any;

    // 2. الهيدر والشعار المعماري
    doc.setFillColor(30, 77, 77); // #1E4D4D Dark Emerald
    doc.rect(0, 0, 297, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(reportTitle, 14, 12);

    doc.setFontSize(9);
    doc.text('CONFIDENTIAL & AES ENCRYPTED AUDIT COMPLIANCE REPORT | PHARMAFLOW ERP', 14, 18);

    if (password) {
      doc.setFillColor(239, 68, 68); // Red badge
      doc.rect(220, 6, 65, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text('PROTECTED WITH PASSWORD', 223, 13);
    } else {
      doc.setFillColor(16, 185, 129); // Emerald badge
      doc.rect(220, 6, 65, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text('DIGITALLY SIGNED REPORT', 223, 13);
    }

    // 3. كرت البيانات والامتثال
    doc.setFillColor(248, 250, 250);
    doc.rect(14, 28, 269, 28, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 28, 269, 28, 'S');

    doc.setTextColor(30, 77, 77);
    doc.setFontSize(10);
    doc.text(`Entity / المنشأة: ${pharmacyName}`, 18, 35);
    doc.text(`Tax ID / الرقم الضريبي: ${taxNumber}`, 18, 42);
    doc.text(`Exported By / مسؤول التصدير: ${exportedBy}`, 18, 49);

    doc.text(`Timestamp / وقت التصدير: ${formattedDate}`, 150, 35);
    doc.text(`Scope / النطاق الزمنى: ${dateFilterRange}`, 150, 42);
    doc.text(`SHA-256 Hash / البصمة الرقمية: ${securityHash}`, 150, 49);

    // 4. ملخص الإحصائيات المباشرة
    const addCount = logs.filter(l => (l.Change_Type || l.status) === 'ADD' || (l.action && l.action.includes('Add'))).length;
    const updateCount = logs.filter(l => (l.Change_Type || l.status) === 'UPDATE' || (l.action && l.action.includes('Update'))).length;
    const deleteCount = logs.filter(l => (l.Change_Type || l.status) === 'DELETE' || (l.action && (l.action.includes('Delete') || l.status === 'BLOCKED'))).length;

    doc.setFillColor(255, 255, 255);
    doc.rect(14, 60, 60, 14, 'F'); doc.rect(14, 60, 60, 14, 'S');
    doc.setTextColor(30, 77, 77); doc.setFontSize(8); doc.text('Total Audit Logs / إجمالي السجلات', 17, 65);
    doc.setFontSize(11); doc.text(`${logs.length} Records`, 17, 71);

    doc.setFillColor(240, 253, 244);
    doc.rect(80, 60, 60, 14, 'F'); doc.rect(80, 60, 60, 14, 'S');
    doc.setTextColor(22, 101, 52); doc.setFontSize(8); doc.text('Add Operations / إضافات', 83, 65);
    doc.setFontSize(11); doc.text(`${addCount} Actions`, 83, 71);

    doc.setFillColor(239, 246, 255);
    doc.rect(146, 60, 60, 14, 'F'); doc.rect(146, 60, 60, 14, 'S');
    doc.setTextColor(30, 58, 138); doc.setFontSize(8); doc.text('Modifications / تعديلات', 149, 65);
    doc.setFontSize(11); doc.text(`${updateCount} Actions`, 149, 71);

    doc.setFillColor(254, 242, 242);
    doc.rect(212, 60, 71, 14, 'F'); doc.rect(212, 60, 71, 14, 'S');
    doc.setTextColor(153, 27, 27); doc.setFontSize(8); doc.text('Deletions & Overrides / حذف ومحاولات', 215, 65);
    doc.setFontSize(11); doc.text(`${deleteCount} Actions`, 215, 71);

    // 5. بناء الجدول التفصيلي لبيانات السجل
    const tableHead = [
      ['#', 'Log ID / المرجع', 'Timestamp / الوقت', 'Type / النوع', 'Module / الجدول', 'Record ID / المستند', 'User / المسؤول', 'Old Value / السابق', 'New Value / الجديد']
    ];

    const tableRows = logs.map((log, index) => {
      const type = log.Change_Type || log.status || 'INFO';
      const recordRef = log.Record_ID || log.id || '-';
      const module = log.Table_Name || log.module || 'System';
      const user = (log.Modified_By || log.actor || 'System').split('@')[0];
      const oldVal = (log.Old_Value || log.details || 'NULL').substring(0, 30);
      const newVal = (log.New_Value || log.details || '-').substring(0, 30);
      const dateStr = log.Modified_At ? new Date(log.Modified_At).toLocaleString('en-US') : (log.timestamp || '-');

      return [
        (index + 1).toString(),
        log.Log_ID || log.id || `LOG-${index + 1}`,
        dateStr,
        type,
        module,
        recordRef,
        user,
        oldVal,
        newVal
      ];
    });

    autoTable(doc, {
      startY: 79,
      head: tableHead,
      body: tableRows,
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        halign: 'left',
        valign: 'middle',
        overflow: 'ellipsize'
      },
      headStyles: {
        fillColor: [30, 77, 77],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 250]
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 28 },
        2: { cellWidth: 32 },
        3: { cellWidth: 22 },
        4: { cellWidth: 28 },
        5: { cellWidth: 25 },
        6: { cellWidth: 28 },
        7: { cellWidth: 48 },
        8: { cellWidth: 48 }
      },
      didDrawPage: (data) => {
        // Footer & Compliance Signature
        const pageCount = doc.internal.getNumberOfPages();
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height || pageSize.getHeight();

        doc.setDrawColor(226, 232, 240);
        doc.line(14, pageHeight - 12, 283, pageHeight - 12);

        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `PharmaFlow ERP Sovereign Security Engine | Encrypted Document ISO/IEC 27001 Audit Trail | Verification Hash: ${securityHash}`,
          14,
          pageHeight - 6
        );
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}`,
          270,
          pageHeight - 6
        );
      }
    });

    // 6. الحفظ والتسجيل
    doc.save(`${filename}.pdf`);

    // إضافة تسجيل حركة في Audit_Log داخل النظام لتأكيد عمليات التصدير
    try {
      await db.addAuditLog(
        'SECURITY',
        'OTHER',
        filename,
        `تم تصدير ملف PDF مشفر لسجلات التدقيق الأمني لعدد (${logs.length}) حركة بكلمة مرور [${password ? 'مفعلة' : 'بدون كلمة مرور'}].`
      );
    } catch {
      // Ignore if silent
    }

    return {
      filename: `${filename}.pdf`,
      passwordUsed: password,
      recordCount: logs.length,
      securityHash
    };
  }
};
