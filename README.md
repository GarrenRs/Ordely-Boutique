# Conversational Order OS

منصة SaaS مغلقة لاستقبال وإدارة وتأكيد الطلبات للتجار العرب عبر صفحات طلب ذكية.

## الهيكل الحقيقي

```text
apps/
  web/          React + Vite merchant panel and public order pages
  api-server/   Express API server

lib/
  db/                 Drizzle schema and database access
  api-spec/           OpenAPI contract
  api-client-react/   Generated React Query client
  api-zod/            Generated Zod schemas

docs/          Product and architecture constraints
```

## إعداد Supabase

انسخ `.env.example` إلى `.env` وضع اتصال Supabase الحقيقي:

```text
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[YOUR-SUPABASE-HOST]:5432/postgres?sslmode=require"
SESSION_SECRET="replace-with-a-long-random-secret"
PORT=8080
API_PORT=8080
```

لا تحفظ ملف `.env` في Git.

## التشغيل

```bash
corepack pnpm install
npm run db:push
npm run db:seed
npm run typecheck
npm run build
```

## Production على Vercel

النشر الحالي يستخدم:

- Vite static output من `apps/web/dist/public`.
- Express API كـ Vercel Function عبر `api/[...path].ts`.
- PostgreSQL/Supabase للجلسات في الإنتاج بدل ذاكرة السيرفر.
- Supabase Storage لصور المنتجات في الإنتاج.

أضف هذه المتغيرات في Vercel:

```text
DATABASE_URL
SESSION_SECRET
APP_ORIGIN
ALLOWED_ORIGINS
PROVIDER_EMAIL
PROVIDER_PASSWORD_HASH
PROVIDER_NAME
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

أمر البناء في Vercel مضبوط في `vercel.json`:

```bash
npm run vercel:build
```

قبل النشر الأول شغّل على قاعدة الإنتاج:

```bash
npm run db:push
npm run sessions:ensure
npm run delivery:ensure-communes
npm run orders:ensure-product-images
npm run landing-pages:ensure-store-slugs
```

لا تعتمد على `UPLOAD_DIR` في الإنتاج؛ تخزين الصور يكون عبر Supabase Storage.

## تشغيل التطبيقات

```bash
npm --prefix apps/api-server run dev
npm --prefix apps/web run dev
```

الخادم يقرأ `.env` من جذر المشروع تلقائيًا. الواجهة تعمل افتراضيًا على المنفذ `5173`.

بيانات الدخول الافتراضية بعد `npm run db:seed`:

```text
admin@store.com
admin123
```

## حدود المنتج

V1 محصور في:

- Landing Pages.
- Orders.
- Confirmation.
- Customers.
- Daily Reports.

لا يوجد في V1: AI، Workflow Builder، Marketplace، Inbox، أو Page Builder.
