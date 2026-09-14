// server/services/reporting/export.service.ts
// Enterprise PDF & Excel Exporter with Arabic RTL Support

import { ExportFormat } from "./reporting.types";

export interface ExportOptions {
  format: ExportFormat;
  title: string;
  subtitle?: string;
  tenantName?: string;
  branchName?: string;
  userName?: string;
  timestamp?: string;
  columns: { key: string; label: string; width?: number; align?: "left" | "right" | "center"; isNumeric?: boolean }[];
  data: Record<string, any>[];
  summaryRows?: { label: string; value: string | number }[];
  currency?: string;
}

export class ExportService {
  /**
   * Generates production-grade HTML-based printable / PDF document with full Arabic RTL layout
   */
  public static generatePdfHtml(options: ExportOptions): string {
    const currency = options.currency || "SAR";
    const dateStr = options.timestamp || new Date().toLocaleString("ar-SA");

    const headerHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1E4D4D; padding-bottom: 12px; margin-bottom: 20px;">
        <div style="text-align: right;">
          <h1 style="color: #1E4D4D; margin: 0 0 4px 0; font-size: 22px; font-weight: bold;">${options.title}</h1>
          ${options.subtitle ? `<div style="color: #64748B; font-size: 13px;">${options.subtitle}</div>` : ""}
          <div style="color: #475569; font-size: 12px; margin-top: 4px;">
            <span>المؤسسة: <strong>${options.tenantName || "PharmaFlow Enterprise"}</strong></span>
            ${options.branchName ? ` | <span>الفرع: <strong>${options.branchName}</strong></span>` : ""}
          </div>
        </div>
        <div style="text-align: left; font-size: 11px; color: #64748B;">
          <div>تاريخ التوليد: ${dateStr}</div>
          <div>المستخدم: ${options.userName || "النظام"}</div>
          <div style="margin-top: 4px; display: inline-block; padding: 2px 8px; background: #F1F5F9; border-radius: 4px; font-weight: bold; color: #1E4D4D;">
            العملة: ${currency}
          </div>
        </div>
      </div>
    `;

    const tableHeaders = options.columns
      .map(
        c =>
          `<th style="padding: 10px 12px; background: #1E4D4D; color: #FFFFFF; font-size: 12px; text-align: ${
            c.align || (c.isNumeric ? "left" : "right")
          }; border: 1px solid #CBD5E1;">${c.label}</th>`
      )
      .join("");

    const tableRows = options.data
      .map((row, idx) => {
        const bg = idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
        const cells = options.columns
          .map(c => {
            const val = row[c.key];
            const formatted =
              c.isNumeric && typeof val === "number"
                ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : val !== undefined && val !== null
                ? String(val)
                : "-";
            return `<td style="padding: 8px 12px; font-size: 12px; text-align: ${
              c.align || (c.isNumeric ? "left" : "right")
            }; border: 1px solid #E2E8F0; color: #1E293B;">${formatted}</td>`;
          })
          .join("");
        return `<tr style="background: ${bg};">${cells}</tr>`;
      })
      .join("");

    let summaryHtml = "";
    if (options.summaryRows && options.summaryRows.length > 0) {
      summaryHtml = `
        <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
          <table style="border-collapse: collapse; width: 350px; background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 6px;">
            ${options.summaryRows
              .map(
                s => `
              <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 8px 12px; font-weight: bold; font-size: 12px; color: #334155;">${s.label}</td>
                <td style="padding: 8px 12px; font-weight: bold; font-size: 13px; color: #1E4D4D; text-align: left;">
                  ${typeof s.value === "number" ? s.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ` ${currency}` : s.value}
                </td>
              </tr>
            `
              )
              .join("")}
          </table>
        </div>
      `;
    }

    const footerHtml = `
      <div style="margin-top: 40px; border-top: 1px dashed #CBD5E1; padding-top: 15px; display: flex; justify-content: space-between; font-size: 11px; color: #94A3B8;">
        <div>تم توليد هذا التقرير آلياً بواسطة محرك التقارير المالية الذكي - PharmaFlow PRO Enterprise</div>
        <div>صفحة 1 من 1</div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>${options.title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
          body {
            font-family: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 24px;
            color: #0F172A;
            background: #FFFFFF;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          table { width: 100%; border-collapse: collapse; }
          @page { size: A4 portrait; margin: 15mm; }
        </style>
      </head>
      <body>
        ${headerHtml}
        <table>
          <thead><tr>${tableHeaders}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        ${summaryHtml}
        ${footerHtml}
      </body>
      </html>
    `;
  }

  /**
   * Generates Excel XML spreadsheet compatible with Microsoft Excel, LibreOffice, and Google Sheets
   * with UTF-8 support and Right-to-Left worksheet direction
   */
  public static generateExcelXml(options: ExportOptions): string {
    const escapeXml = (str: any) =>
      String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const headerCells = options.columns
      .map(
        c =>
          `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(c.label)}</Data></Cell>`
      )
      .join("");

    const dataRows = options.data
      .map(row => {
        const cells = options.columns
          .map(c => {
            const val = row[c.key];
            if (c.isNumeric && typeof val === "number") {
              return `<Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${val}</Data></Cell>`;
            }
            return `<Cell ss:StyleID="TextStyle"><Data ss:Type="String">${escapeXml(val ?? "")}</Data></Cell>`;
          })
          .join("");
        return `<Row ss:AutoFitHeight="1">${cells}</Row>`;
      })
      .join("\n");

    let summaryRowsXml = "";
    if (options.summaryRows && options.summaryRows.length > 0) {
      summaryRowsXml = options.summaryRows
        .map(s => {
          return `
            <Row ss:AutoFitHeight="1">
              <Cell ss:StyleID="SummaryLabelStyle"><Data ss:Type="String">${escapeXml(s.label)}</Data></Cell>
              <Cell ss:StyleID="SummaryValueStyle"><Data ss:Type="${typeof s.value === "number" ? "Number" : "String"}">${s.value}</Data></Cell>
            </Row>
          `;
        })
        .join("\n");
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Cairo" x:CharSet="1" ss:Size="11" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Cairo" ss:Size="16" ss:Bold="1" ss:Color="#1E4D4D"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Cairo" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E4D4D" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TextStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Cairo" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="NumberStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Cairo" ss:Size="10" ss:Color="#1E293B"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="SummaryLabelStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Cairo" ss:Size="11" ss:Bold="1" ss:Color="#334155"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="SummaryValueStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Cairo" ss:Size="11" ss:Bold="1" ss:Color="#1E4D4D"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(options.title.substring(0, 31))}" ss:RightToLeft="1">
  <Table ss:DefaultColumnWidth="120" ss:DefaultRowHeight="20">
   <Row ss:Height="30">
    <Cell ss:MergeAcross="${options.columns.length - 1}" ss:StyleID="TitleStyle">
     <Data ss:Type="String">${escapeXml(options.title)}</Data>
    </Cell>
   </Row>
   <Row ss:Height="24">
    ${headerCells}
   </Row>
   ${dataRows}
   <Row></Row>
   ${summaryRowsXml}
  </Table>
 </Worksheet>
</Workbook>`;
  }

  /**
   * Generates UTF-8 encoded CSV file with BOM
   */
  public static generateCsv(options: ExportOptions): string {
    const BOM = "\uFEFF";
    const headerRow = options.columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(",");
    const rows = options.data.map(row =>
      options.columns
        .map(c => {
          const val = row[c.key];
          return `"${String(val ?? "").replace(/"/g, '""')}"`;
        })
        .join(",")
    );

    return BOM + [headerRow, ...rows].join("\r\n");
  }
}
