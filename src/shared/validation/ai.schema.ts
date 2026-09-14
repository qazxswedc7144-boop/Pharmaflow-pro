// src/shared/validation/ai.schema.ts
import { z } from "zod";

export const ParsedInvoiceItemSchema = z.object({
  name: z.string().min(1, "اسم الصنف مطلوب"),
  quantity: z.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  price: z.number().nonnegative("السعر لا يمكن أن يكون سالباً"),
  expiryDate: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  discountPercent: z.number().nonnegative().optional(),
  bonusQty: z.number().nonnegative().optional(),
  batchNumber: z.string().trim().optional(),
  unit: z.string().trim().optional(),
  notes: z.string().trim().optional()
}).passthrough();

export const ParsedInvoiceSchema = z.object({
  type: z.enum(["cash", "credit", "return"]).catch("cash"),
  supplier: z.string().trim().optional().default("مورد غير معروف"),
  invoice_number: z.string().trim().optional().default("---"),
  date: z.string().trim().optional(),
  notes: z.string().trim().optional().default(""),
  items: z.array(ParsedInvoiceItemSchema).min(1, "يجب وجود صنف واحد على الأقل للفاتورة")
}).passthrough();

export type ParsedInvoiceDTO = z.infer<typeof ParsedInvoiceSchema>;
