# 🏥 PharmaFlow Pro ERP

> **نظام تخطيط موارد المؤسسات وإدارة الصيدليات وسلاسل التوزيع الدوائي المتكامل**  
> *Enterprise-Grade Pharmacy Management & Financial Defense ERP System*

---

## 📑 جدول المحتويات (Table of Contents)

1. [نبذة عن المشروع (Overview)](#-نبذة-عن-المشروع-overview)
2. [التقنيات المستخدمة (Tech Stack)](#-التقنيات-المستخدمة-tech-stack)
3. [المعمارية التقنية للمشروع (System Architecture)](#-المعمارية-التقنية-للمشروع-system-architecture)
4. [هيكل المجلدات (Folder Structure)](#-هيكل-المجلدات-folder-structure)
5. [شرح الوحدات والأنظمة الفرعية (Core Modules)](#-شرح-الوحدات-والأنظمة-الفرعية-core-modules)
   - [وحدة المبيعات ونقاط البيع (Sales & POS Module)](#1-وحدة-المبيعات-ونقاط-البيع-sales--pos-module)
   - [وحدة المشتريات والذكاء الاصطناعي (Purchases & OCR Module)](#2-وحدة-المشتريات-والذكاء-الاصطناعي-purchases--ocr-module)
   - [وحدة إدارة المخزون والصلاحيات (Inventory & Batch Management)](#3-وحدة-إدارة-المخزون-والصلاحيات-inventory--batch-management)
   - [النظام المحاسبي والمالي المزدوج (Double-Entry Accounting Module)](#4-النظام-المحاسبي-والمالي-المزدوج-double-entry-accounting-module)
   - [نظام النسخ الاحتياطي والتعافي (Hybrid Backup & Disaster Recovery)](#5-نظام-النسخ-الاحتياطي-والتعافي-hybrid-backup--disaster-recovery)
6. [مراحل التطوير الهندسية (Development Phases 1.4 – 6)](#-مراحل-التطوير-الهندسية-development-phases-14--6)
7. [معمارية الأمان والتشفير (Security & Cryptographic Architecture)](#-معمارية-الأمان-والتشفير-security--cryptographic-architecture)
   - [خزينة الاعتمادات المركزية (Credential Vault)](#خزينة-الاعتمادات-المركزية-credential-vault)
   - [خدمة التشفير المعياري (CryptoService V2)](#خدمة-التشفير-المعياري-cryptoservice-v2)
   - [تشفير AES-256-CBC والتحقق من النزاهة HMAC-SHA256](#تشفير-aes-256-cbc-والتحقق-من-النزاهة-hmac-sha256)
   - [خطة التعافي عند الكوارث (Disaster Recovery & Defense in Depth)](#خطة-التعافي-عند-الكوارث-disaster-recovery--defense-in-depth)
8. [دليل التثبيت والتشغيل (Getting Started)](#-دليل-التثبيت-والتشغيل-getting-started)
9. [دليل الاختبارات وضمان الجودة (Testing & Verification)](#-دليل-الاختبارات-وضمان-الجودة-testing--verification)
10. [خارطة الطريق القادمة (Future Roadmap)](#-خارطة-الطريق-القادمة-future-roadmap)

---

## 🌟 نبذة عن المشروع (Overview)

**PharmaFlow Pro ERP** هو نظام سحابي هجين متكامل مصمم خصيصاً لإدارة سلاسل الصيدليات، المستودعات الدوائية، والمنشآت الصحية. يجمع النظام بين:

- سرعة استجابة فائقة لواجهات نقاط البيع (POS) وإصدار الفواتير مع بنية شريط الإجراءات الثابت (Fixed Bottom Action Bar Architecture).
- حماية مالية ومحاسبية صارمة تعتمد على القيد المزدوج التلقائي ونظام الدفاع المالي الشامل (Financial Defense System).
- بنية أمنية متقدمة تعزل مفاتيح التشفير والاعتمادات في الخادم الخلفي (Backend Vault) مع تشفير متماثل وتوقيع توثيقي ضد التلاعب.
- دعم العمل دون اتصال بالإنترنت (Offline-First) مع التزامن السحابي الآمن عبر Firebase Firestore وقواعد بيانات IndexedDB و PostgreSQL / Prisma.

---

## 🛠 التقنيات المستخدمة (Tech Stack)

### 🎨 الواجهة الأمامية (Frontend & UI/UX)
- **Framework**: React 18+ مع TypeScript
- **Bundler & Build Tool**: Vite 6+
- **Styling**: Tailwind CSS (تصميم مرن وسريع يدعم RTL و Mobile-First)
- **Motion & Animations**: `motion` (Framer Motion)
- **Icons**: `lucide-react`
- **Charts & Reports**: Recharts, D3
- **Exporting & Printing**: jsPDF, autoTable, SheetJS (XLSX), html2canvas

### ⚙️ الخادم الخلفي والبنية التحتية (Backend & Server Engine)
- **Runtime**: Node.js (ESM / CommonJS Bundling عبر `esbuild` & `tsx`)
- **Server Framework**: Express 4/5
- **ORM & Data Modeling**: Prisma ORM (PostgreSQL Ready)
- **State Management**: Zustand مع Persistence Middleware
- **Database Hybrid Architecture**:
  - Cloud Database: Firebase Firestore (سحابي)
  - Relational Database: PostgreSQL / Cloud SQL عبر Prisma
  - Local / Offline Storage: IndexedDB (`localforage` / Custom Repositories)

### 🔐 الأمان والتشفير (Security & Cryptography)
- **Node.js Native Crypto**: `crypto.createCipheriv`, `crypto.createHmac`, `crypto.randomBytes`
- **Encryption Algorithm**: AES-256-CBC مع Dynamic Random IV (16 Bytes)
- **Integrity Authentication**: HMAC-SHA256 مع Constant-Time Verification (`crypto.timingSafeEqual`)
- **Key Derivation & Protection**: Backend Environment Credential Vault (مفاتيح تشفير عاصمة غير مسربة للعميل)

---

## 🏗 المعمارية التقنية للمشروع (System Architecture)

يعتمد النظام على **معمارية متعددة الطبقات (Layered Modular Architecture)** تفصل بين العرض، منطق العمل، وطبقة البيانات والتأمين:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Presentation Layer                     │
│  React 18 SPA | Fixed Bottom Action Bar | Tailwind CSS RTL | Zustand    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  REST API / Sync Stream
┌────────────────────────────────────▼────────────────────────────────────┐
│                       Express 3000 Server Layer                         │
│  Security Middlewares | Rate Limiters | Health Checks | Route Handlers  │
├─────────────────────────────────────────────────────────────────────────┤
│                     Business & Security Core Services                   │
│  Financial Defense System | Credential Vault | CryptoService V2 | Audit  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌──────────────────────┐                           ┌──────────────────────┐
│  PostgreSQL / Prisma │                           │  Firebase Firestore  │
│  Relational Database │                           │  Cloud Database / DB │
└──────────────────────┘                           └──────────────────────┘
```

---

## 📂 هيكل المجلدات (Folder Structure)

```text
pharmaflow-pro/
├── prisma/                          # مخطط وقواعد بيانات Prisma ORM
│   ├── schema.prisma
│   └── seed.ts
├── public/                          # الأصول الثابتة، الأيقونات، وملف Service Worker
│   ├── manifest.json
│   ├── sw.js
│   └── pharmaflow_logo.png
├── server/                          # الخدمات الخلفية ومعمارية الخادم
│   ├── modules/
│   │   ├── audit/                   # سجلات الرقابة والتدقيق الأمني
│   │   ├── encryption/              # محرك التشفير والخزينة الآمنة (CryptoService V2)
│   │   ├── financial/               # محركات الدفاع المالي والتحقق من القيود
│   │   ├── replication/             # خدمات المزامنة وتكرار البيانات
│   │   └── security/                # خزينة الاعتمادات والتحقق
│   └── tests/                       # اختبارات الأمان والتحقق الرجعي للباك إند
├── src/                             # كود الواجهة الأمامية وتطبيقات React
│   ├── app/                         # نقطة الدخول الرئيسية للواجهة (App.tsx)
│   ├── components/                  # المكونات المشتركة، الطباعة، المودالز
│   │   ├── print/                   # قوالب طباعة الفواتير والإيصالات
│   │   └── shared/                  # مكونات سحب للتحديث (PullToRefresh) والنوافذ
│   ├── contexts/                    # سياقات التطبيق (Theme, App, Notification)
│   ├── database/                    # طبقة المستودعات المحلية والمزامنة (Repositories)
│   │   └── repositories/            # مستودعات المبيعات، المشتريات، الحسابات، والمخزون
│   ├── features/                    # الوحدات الوظيفية الرئيسية (Domain Features)
│   │   ├── accounting/              # سندات الصرف والقبض، القيود، ميزان المراجعة
│   │   ├── ai/                      # محرك استخراج وقراءة الفواتير الذكي (OCR)
│   │   ├── backup/                  # مركز النسخ الاحتياطي والتعافي من الكوارث
│   │   ├── dashboard/               # لوحات التحكم والإحصائيات الحية
│   │   ├── inventory/               # إدارة الأصناف، الدفعات، الجرد، والتسويات
│   │   ├── partners/                # إدارة العملاء والموردين
│   │   ├── purchases/               # فواتير المشتريات ومراجعة الذكاء الاصطناعي
│   │   ├── reports/                 # التقارير المتقدمة، الأرباح، والأعمار الزمنية للديون
│   │   ├── saas/                    # إدارة الفروع والاشتراكات
│   │   ├── sales/                   # شاشات المبيعات، نقاط البيع، وأرشيف الفواتير
│   │   └── settings/                # إعدادات النظام، الصلاحيات، وسجلات النظام
│   ├── services/                    # الخدمات المركزية (AI, Rules, Validation, Integrity)
│   │   ├── ai/                      # محولات سياق الذكاء الاصطناعي وإدارة البرومبت
│   │   ├── integrity/               # محرك سلامة البيانات وفحص التهديدات المالية
│   │   └── system/                  # قواعد العمل وحفظ المسودات (Draft Service)
│   ├── store/                       # مخازن الحالة المركزية (Zustand Stores)
│   └── types/                       # تعريفات TypeScript الشاملة
├── dist/                            # حزم الإنتاج المترجمة (Static Assets & Server Bundle)
├── server.ts                        # نقطة تشغيل الخادم الرئيسية (Node / Express)
├── vite.config.ts                   # إعدادات Vite ومحسنات بناء الحزم
├── metadata.json                    # إعدادات وصلاحيات بيئة AI Studio
└── package.json                     # تعريف الاعتماديات وأوامر البناء والتشغيل
```

---

## 📦 شرح الوحدات والأنظمة الفرعية (Core Modules)

### 1. وحدة المبيعات ونقاط البيع (Sales & POS Module)
- **Fixed Bottom Action Bar Architecture**: واجهة معمارية مصممة خصيصاً للشاشات اللمسية وشاشات الموبايل بنمط `Flex Column`؛ تضمن ثبات شريط الإجراءات السفلي (الخصم، الصافي، زر الحفظ، التسويات) بصورة دائمة وثابتة سواء احتوت الفاتورة على صنف واحد أو آلاف الأصناف.
- **إصدار الفواتير الفوري**: دعم الباركود والبحث الفوري والعملات المتعددة مع التحديث التلقائي للأسعار والأرصدة.
- **التسويات والخصومات**: احتساب مرن للخصومات المئوية والمادية والرسوم الإضافية مع تحديث مباشر للمجاميع.
- **سير العمل والأرشفة**: انتقال سلس بين حالات الفاتورة (`DRAFT` ➔ `POSTED` ➔ `PAID` / `PARTIAL`) مع تتبع تاريخي كامل وإمكانية استرجاع المسودات المفقودة.

### 2. وحدة المشتريات والذكاء الاصطناعي (Purchases & OCR Module)
- **المعالجة الذكية للفواتير (AI Smart Invoice Ingestion)**: استخراج بيانات فواتير الشراء المصورة ضوئياً عبر الذكاء الاصطناعي دون إدخال يدوي مجهد.
- **شاشة المراجعة والتدقيق الإلزامية**: تطبيق قاعدة السلامة الصارمة بمنع الترحيل التلقائي للفواتير المرفوعة حتى يتم تدقيقها ومراجعتها يدوياً من الصيدلي أو المحاسب.
- **مراقبة الأسعار وتواريخ الصلاحية**: تنبيه فوري في حال ارتفاع سعر شراء الصنف عن آخر سعر توريد، وتنبيهات الاستحقاق المبكر لتواريخ الانتهاء.

### 3. وحدة إدارة المخزون والصلاحيات (Inventory & Batch Management)
- **تتبع الدفعات وتواريخ الانتهاء (Batch & Expiry Tracking)**: تتبع تفصيلي لكل دفعة برقم التشغيلة (Batch Number) وتاريخ انتهاء الصلاحية وتطبيق مبدأ FEFO (First-Expired, First-Out).
- **الجرد المخزني والتسويات (Inventory Audit & Adjustments)**: نظام جرد دوري شامل يسمح بتسجيل الفروقات وإجراء تسويات العجز والفائض مع توليد قيود محاسبية تلقائية.
- **مراقبة النواقص والحد الأدنى للطلب**: تنبيهات آلية عند وصول الأصناف إلى حد إعادة الطلب.

### 4. النظام المحاسبي والمالي المزدوج (Double-Entry Accounting Module)
- **القيود المحاسبية التلقائية**: إنشاء قيود يومية متوازنة لجميع عمليات البيع، الشراء، التسويات، وسندات القبض والصرف.
- **سندات القبض والصرف (Vouchers & Payments)**: إدارة دقيقة لمستحقات الموردين ومديونيات العملاء مع ربط مباشر بالفواتير لتحديث حالة السداد.
- **ميزان المراجعة والتقارير المالية**: استخراج ميزان المراجعة، قائمة الدخل، تقارير أرباح الأصناف، وتقارير أعمار الديون (Aging Reports).

### 5. نظام النسخ الاحتياطي والتعافي (Hybrid Backup & Disaster Recovery)
- **النسخ الاحتياطي الهجين المشفر**: تصدير واستيراد قواعد البيانات بملفات مشفرة ذاتية التحقق.
- **حماية تكامل البيانات (Integrity Verification)**: فحص بصمة الملفات وتوقيعات HMAC لمنع استيراد أي نسخ تالفة أو معدلة خارج النظام.
- **العمل في وضع الأمان (Safe Mode)**: وضع طوارئ يسمح بتشخيص واستعادة النظام عند حدوث أعطال في الشبكة أو البيانات.

---

## 🚀 مراحل التطوير الهندسية (Development Phases 1.4 – 6)

| المرحلة (Phase) | العنوان الأساسي | أبرز الإنجازات والتحسينات الهندسية |
| :--- | :--- | :--- |
| **Phase 1.4 - 2.0** | Core ERP & POS Foundation | بناء النواة المحاسبية والمخزنية، شاشات المبيعات، ومستودعات IndexedDB المحلية. |
| **Phase 3.0** | Multi-Branch & SaaS Layer | دعم إدارة الفروع المتعددة، توحيد العمليات المركزية، وفصل صلاحيات المستخدمين. |
| **Phase 4.0** | AI Vision & OCR Processing | دمج محركات الذكاء الاصطناعي لتحليل الفواتير المصورة واستخراج الأصناف والأسعار. |
| **Phase 5.0** | Financial Defense & Audit Logs | تطوير نظام الدفاع المالي لكشف التهديدات، تدقيق القيود الشاذة، وبناء سجلات الرقابة الشاملة. |
| **Phase 6.0** | Enterprise Security Hardening | إعادة بناء منظومة التشفير بالكامل (`CryptoService V2`)، إنشاء `Credential Vault` خلفي، عزل المفاتيح، وتطبيق اختبارات الاختراق والأمان الشاملة (30/30 Test Suite Passed). |

---

## 🔒 معمارية الأمان والتشفير (Security & Cryptographic Architecture)

صُممت المنظومة الأمنية في PharmaFlow Pro وفق مبدأ **Defense-in-Depth (الدفاع في العمق)** لحماية أسرار وبيانات الصيدلية:

```text
 ┌──────────────────────────────────────────────────────────────────┐
 │                     BACKEND CREDENTIAL VAULT                     │
 │  • Isolated Key Management in Node.js process.env                │
 │  • Zero Key Leakage into Browser / Vite Client Bundles           │
 └────────────────────────────────┬─────────────────────────────────┘
                                  │
 ┌────────────────────────────────▼─────────────────────────────────┐
 │                        CRYPTOSERVICE V2                          │
 │  ┌─────────────────────────────────────────────────────────────┐  │
 │  │ 1. AES-256-CBC Payload Encryption with CSPRNG 16-Byte IV   │  │
 │  ├─────────────────────────────────────────────────────────────┤  │
 │  │ 2. HMAC-SHA256 Payload Signature (Sign-Then-Encrypt-Payload)│  │
 │  ├─────────────────────────────────────────────────────────────┤  │
 │  │ 3. Constant-Time Verification (crypto.timingSafeEqual)     │  │
 │  └─────────────────────────────────────────────────────────────┘  │
 └──────────────────────────────────────────────────────────────────┘
```

### خزينة الاعتمادات المركزية (Credential Vault)
- تُخزن كافة المفاتيح الحساسة (`ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`) في بيئة الخادم فقط.
- يُحظر تصدير أي مفتاح تشفير عبر متغيرات الواجهة (`VITE_*`) لضمان عدم ظهوره في ملفات جافاسكريبت المجمعة.

### خدمة التشفير المعياري (CryptoService V2)
- توفر واجهة برمجية موحدة وآمنة لإجراء عمليات التشفير وفك التشفير للنسخ الاحتياطية والبيانات الحساسة.
- تطبيق معالجة قوية للأخطاء تمنع تسريب تفاصيل الاستثناءات أو بنية المفاتيح في ردود الأخطاء.

### تشفير AES-256-CBC والتحقق من النزاهة HMAC-SHA256
- **المعايير**: استخدام خوارزمية التشفير المتماثل `AES-256-CBC` مع متجه تهيئة عشوائي جديد (IV) لكل عملية تشفير.
- **تأكيد النزاهة**: احتساب توقيع `HMAC-SHA256` للبيانات والـ IV لمنع هجمات التعديل والتلاعب (Tampering Attacks).
- **منع الهجمات التوقيتية**: فحص التوقيعات باستخدام `crypto.timingSafeEqual` للحماية ضد (Timing Attacks).

### خطة التعافي عند الكوارث (Disaster Recovery & Defense in Depth)
- عزل بيانات كل مستأجر/فرع، وتوفير نقاط استعادة فورية عند انقطاع الاتصال أو فشل الخادم.
- حماية النظام ضد انقطاع الشبكة المفاجئ من خلال استمرارية العمل على الذاكرة المؤقتة المحلية والمزامنة التلقائية عند عودة الاتصال.

---

## 💻 دليل التثبيت والتشغيل (Getting Started)

### المتطلبات الأساسية (Prerequisites)
- **Node.js**: الإصدار 18 أو 20+ (LTS موصى به)
- **npm**: الإصدار 9 أو أحدث

### 1. تثبيت الاعتماديات
```bash
npm install
```

### 2. إعداد متغيرات البيئة
قم بنسخ ملف `.env.example` إلى `.env`:
```bash
cp .env.example .env
```
تأكد من ضبط المتغيرات الأساسية:
- `ENCRYPTION_KEY`: مفتاح عشوائي بطول 32 بايت (256 بت).
- `DATABASE_URL`: رابط قاعدة البيانات (اختياري في حال العمل بالوضع الهجين).

### 3. تشغيل بيئة التطوير (Development Server)
```bash
npm run dev
```
يعمل الخادم تلقائياً على المنفذ: `http://localhost:3000`

### 4. بناء المشروع للإنتاج (Production Build)
```bash
npm run build
```
يقوم الأمر ببناء حزمة الواجهة الأمامية عبر Vite وتجميع الخادم الخلفي في `dist/server.cjs` عبر esbuild.

### 5. تشغيل حزمة الإنتاج (Production Start)
```bash
npm start
```

---

## 🧪 دليل الاختبارات وضمان الجودة (Testing & Verification)

يحتوي المشروع على منظومة فحص وتحقق صارمة تشمل:

### 1. التحقق من سلامة الأنواع (TypeScript Check)
```bash
npx tsc --noEmit
```

### 2. فحص الجودة والتنسيق (ESLint)
```bash
npm run lint
```
*يضمن خلو الكود من التحذيرات أو الأخطاء (Zero Warnings).*

### 3. اختبارات الأمان والتشفير (Security & Regression Tests)
```bash
node server/tests/security-audit.test.js
```
*فحص آلي لـ 30 معياراً أمنياً يشمل التشفير، عزل المفاتيح، والتحقق من التوقيعات.*

---

## 🗺 خارطة الطريق القادمة (Future Roadmap)

- [ ] **Phase 7.0**: تفعيل المزامنة المتقدمة متعددة الاتجاهات (P2P Mesh Sync) بين الأجهزة في الشبكة المحلية بدون إنترنت.
- [ ] **Phase 7.1**: دعم الربط المباشر مع منصات وهيئات الدواء والتأمين الصحي الوطنية (e-Prescription & Insurance Claims APIs).
- [ ] **Phase 7.2**: لوحات ذكاء أعمال تنبؤية (Predictive AI Analytics) للتنبؤ بحجم الطلب على الأدوية الموسمية.
- [ ] **Phase 7.3**: تطبيق الجوال المخصص للمناديب وجرد المخازن السريع عبر كاميرا الهاتف وأجهزة القراءة الليزرية.

---

## 📄 الترخيص والدعم (License & Support)

جميع حقوق التطوير محفوظة لمشروع **PharmaFlow Pro ERP**.  
للاستفسارات التقنية وطلبات الدعم المؤسسي، يرجى مراجعة إدارة الأنظمة عبر لوحة الإعدادات والمساعدة داخل التطبيق.
