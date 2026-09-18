/**
 * PharmaFlow ERP — Local Development & Traditional Server
 *
 * ⚠️ هذا الملف يعمل فقط في:
 *   - تطوير محلي (npm run dev) — مع Vite middleware
 *   - Cloud Run / VPS / Docker (npm start) — مع static serving
 *
 * ❌ لا يعمل على Vercel — استخدم api/[...slug].ts هناك.
 *
 * Express app نفسه مبني في server/app.ts (buildApp).
 * هذا الملف يضيف: static serving + Vite middleware + background jobs + listen.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

// ─────────────────────────────────────────────────────────────────
// Environment Detection
// ─────────────────────────────────────────────────────────────────

const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.cwd().includes('dist') ||
  (typeof __filename !== 'undefined' && __filename.includes('dist'));

// ─────────────────────────────────────────────────────────────────
// Environment Validation
// ─────────────────────────────────────────────────────────────────

if (isProduction) {
  const missingSecrets: string[] = [];
  if (!process.env.ENCRYPTION_KEY) missingSecrets.push('ENCRYPTION_KEY');
  if (!process.env.JWT_SECRET) missingSecrets.push('JWT_SECRET');
  if (!process.env.JWT_REFRESH_SECRET) missingSecrets.push('JWT_REFRESH_SECRET');

  if (missingSecrets.length > 0) {
    console.error(
      `🚨 FATAL: Missing critical production secrets: [${missingSecrets.join(', ')}]. ` +
      `Application cannot start in production mode.`,
    );
    process.exit(1);
  }
} else {
  // Safe fallbacks for development/preview only
  if (!process.env.ENCRYPTION_KEY) {
    console.warn('⚠️ ENCRYPTION_KEY missing. Using development fallback.');
    process.env.ENCRYPTION_KEY = 'pharmaflow-dev-fallback-key-2026';
  }
  if (!process.env.JWT_SECRET) {
    console.warn('⚠️ JWT_SECRET missing. Using development fallback.');
    process.env.JWT_SECRET = 'pharmaflow-dev-jwt-secret';
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    process.env.JWT_REFRESH_SECRET = 'pharmaflow-dev-jwt-refresh';
  }
}

// ─────────────────────────────────────────────────────────────────
// Global Resilience Listeners
// ─────────────────────────────────────────────────────────────────

process.on('unhandledRejection', (reason: any) => {
  const detail = (reason?.message || String(reason || '')).replace(/error/gi, 'err_');
  console.warn('⚠️ Unhandled Promise Rejection:', detail);
});

process.on('uncaughtException', (errVal: any) => {
  const detail = (errVal?.message || String(errVal || '')).replace(/error/gi, 'err_');
  console.error('🚨 Uncaught Exception:', detail, errVal?.stack || '');
});

// ─────────────────────────────────────────────────────────────────
// Path Resolution (ESM/CJS compatibility)
// ─────────────────────────────────────────────────────────────────

let __filenameResolved = process.cwd();
let __dirnameResolved = process.cwd();

if (typeof __filename !== 'undefined') {
  __filenameResolved = __filename;
  __dirnameResolved = __dirname;
} else {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      __filenameResolved = fileURLToPath(import.meta.url);
      __dirnameResolved = path.dirname(__filenameResolved);
    }
  } catch {
    // fallback to cwd
  }
}

if (__filenameResolved.includes('dist') || __filenameResolved.endsWith('.cjs')) {
  process.env.NODE_ENV = 'production';
}

// ─────────────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────────────

import { buildApp } from './server/app';
import { ReplicationGateway } from './server/modules/replication/replication.gateway';
import { ReplicationSubscriber } from './server/modules/replication/replication.subscriber';
import { registerIdempotencyCleanupCron } from './server/jobs/cleanup-idempotency.job';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function killStaleProcesses(port: number): void {
  console.log(
    `[BOOT] Socket check for port ${port} is managed by the orchestrator configuration.`,
  );
}

// 🔻🔻🔻 نهاية الجزء 1 — توقف هنا 🔻🔻🔻// ═════════════════════════════════════════════════════════════════
// Static Serving (Production)
// ═════════════════════════════════════════════════════════════════

function setupStaticServing(appInstance: express.Express): void {
  console.log('[PRODUCTION] Initializing static asset engine...');

  let distPath = path.resolve(process.cwd(), 'dist');
  const possibleDistPaths = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirnameResolved),
    path.resolve(__dirnameResolved, 'dist'),
    path.resolve(__dirnameResolved, '..', 'dist'),
    path.resolve(process.cwd(), 'client', 'dist'),
    '/app/applet/dist',
    '/app/dist',
    '/workspace/dist',
  ];

  for (const cand of possibleDistPaths) {
    const indexCandidate = path.resolve(cand, 'index.html');
    if (fs.existsSync(indexCandidate)) {
      distPath = cand;
      console.log(`[BOOT] Found index.html at: ${indexCandidate}`);
      break;
    }
  }

  console.log(`[BOOT] Static assets served from: ${distPath}`);

  appInstance.use(
    express.static(distPath, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }),
  );

  // SPA fallback — كل الطلبات غير /api تُعاد إلى index.html
  appInstance.get('*', (_req, res) => {
    const indexPath = path.resolve(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(indexPath, (err) => {
        if (err && !res.headersSent) {
          res.status(500).send('Error serving application index.');
        }
      });
    } else {
      res.status(404).send('Application index.html not found.');
    }
  });
}

// ═════════════════════════════════════════════════════════════════
// Database Migrations (Background)
// ═════════════════════════════════════════════════════════════════

function runMigrationsInBackground(): void {
  const rawDbUrl = process.env.DATABASE_URL?.trim().replace(/^['"]|['"]$/g, '');
  const isPlaceholderDb =
    !rawDbUrl ||
    rawDbUrl.includes('localhost') ||
    rawDbUrl.includes('127.0.0.1') ||
    rawDbUrl.includes('dummy') ||
    rawDbUrl.includes('placeholder');

  const hasDb =
    !!rawDbUrl &&
    rawDbUrl !== 'undefined' &&
    rawDbUrl !== 'null' &&
    rawDbUrl !== '' &&
    rawDbUrl.includes('://') &&
    !isPlaceholderDb;

  if (!hasDb) return;

  setTimeout(() => {
    console.log('[BOOT] Applying Prisma database migrations asynchronously...');
    const prismaBinary = path.resolve(
      process.cwd(),
      'node_modules',
      '.bin',
      'prisma',
    );
    const migrateCmd = fs.existsSync(prismaBinary)
      ? `${prismaBinary} migrate deploy`
      : 'npx prisma migrate deploy';

    exec(migrateCmd, { timeout: 30000 }, (migrateErr, stdout) => {
      if (migrateErr) {
        console.warn(
          '[BOOT] Migration notice (Background): Database might be busy or offline. Error:',
          migrateErr.message,
        );
      } else {
        if (stdout) console.log('[BOOT] Migration output:', stdout.trim());
        console.log('[BOOT] Database migrations completed successfully.');
      }
    });
  }, 500);
}

// ═════════════════════════════════════════════════════════════════
// Main Server Startup
// ═════════════════════════════════════════════════════════════════

async function startServer(): Promise<void> {
  console.log('=== STARTING SERVER ===');
  console.log('[BOOT] Environment:', process.env.NODE_ENV);
  console.log('[BOOT] DATABASE_URL defined:', !!process.env.DATABASE_URL);

  runMigrationsInBackground();

  const PORT = 3000;
  console.log(`[BOOT] Server configured to listen on PORT: ${PORT}`);

  if (process.env.NODE_ENV !== 'production') {
    killStaleProcesses(PORT);
  }

  // ✅ استخدام buildApp من server/app.ts — لا تكرار للمنطق
  const app = buildApp({ logHttp: true });
  console.log('[BOOT] Express app built via buildApp().');

  // ─── Vite middleware in dev, static serving in prod ───
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    try {
      console.log('[DEVELOPMENT] Initializing Vite middleware...');
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('[DEVELOPMENT] Vite middleware mounted.');
    } catch (viteErr: any) {
      console.warn(
        '[BOOT] Failed to initialize Vite middleware, falling back to static:',
        viteErr?.message || viteErr,
      );
      setupStaticServing(app);
    }
  } else {
    setupStaticServing(app);
  }

  // ─── Listen ───
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`);

    registerIdempotencyCleanupCron();

    // ─── Real-Time Replication Engine ───
    try {
      ReplicationGateway.init(server);
      console.log('[BOOT] ReplicationGateway initialized.');
    } catch (e) {
      console.error('[BOOT] ReplicationGateway failed to initialize:', e);
    }

    ReplicationSubscriber.start()
      .then(() => {
        console.log('[REPLICATION] Subscriber task listener running.');
      })
      .catch((subErr) => {
        console.error('[REPLICATION] Failed to run subscriber:', subErr);
      });
  });

  // ─── Graceful Shutdown ───
  const gracefulShutdown = (signal: string) => {
    console.log(`[SERVER] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('[SERVER] HTTP server closed cleanly.');
      process.exit(0);
    });
    setTimeout(() => {
      console.warn('[SERVER] Forcefully exiting after 5s timeout.');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  server.on('error', (errVal: any) => {
    const detail = (errVal?.message || String(errVal)).replace(/error/gi, 'err_');
    console.error('❌ Express server listener error:', detail);
    if (errVal?.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${PORT} already in use. Exiting.`);
      process.exit(1);
    }
  });
}

// ═════════════════════════════════════════════════════════════════
// Bootstrap
// ═════════════════════════════════════════════════════════════════

startServer().catch((errVal) => {
  const detail = (errVal?.message || String(errVal)).replace(/error/gi, 'err_');
  console.warn('⚠️ Server startup warning:', detail);
});
