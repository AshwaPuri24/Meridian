/**
 * ============================================================
 * server.ts
 * ============================================================
 * Meridian API — main entry point.
 *
 * Monorepo layout (relative to this file):
 *   ../          ← repo root (.env lives here)
 *   ../client/   ← Vite React frontend
 *   ./          ← this Express server (server/)
 *
 * Start order:
 *   1. Preload .env from repo root (side-effect import; see
 *      ./config/env.ts for why this is a separate module).
 *   2. Validate required environment variables.
 *   3. Connect to MongoDB (fail fast on bad URI).
 *   4. Apply middleware (CORS, JSON, request logger).
 *   5. Mount the /api router.
 *   6. PRODUCTION: serve the built React app as static files.
 *   7. Register the global error handler.
 *   8. Start listening on PORT (default 5000).
 *
 * Environment variables (root .env):
 *   MONGODB_URI      mongodb+srv://...
 *   GOOGLE_API_KEY   Gemini API key
 *   PORT             (optional) defaults to 5000
 *   NODE_ENV         development | production
 *   CORS_ORIGIN      (optional) defaults to http://localhost:3000
 * ============================================================
 */

// ── Step 1: Preload environment variables ───────────────────
// This MUST be the first import. It is a side-effect-only
// module that runs dotenv.config() before any other module in
// the graph is evaluated. See config/env.ts for the full
// explanation of why this ordering matters (TL;DR: CommonJS
// hoists `import` statements, so inline dotenv.config() calls
// are too late — OrchestratorAgent reads process.env at module
// scope and would crash with GOOGLE_API_KEY=undefined).
import './config/env';

// path is used below for production static file serving.
import path from 'path';

// Force Google DNS so mongodb+srv:// SRV lookups work on networks
// that block SRV record queries (mobile hotspots, some ISPs).
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import express, {
  Express,
  Request,
  Response,
  NextFunction,
}                        from 'express';
import cors              from 'cors';
import mongoose          from 'mongoose';
import apiRouter         from './routes/api';

// ─────────────────────────────────────────────────────────────
// 2. Environment validation
// ─────────────────────────────────────────────────────────────

const REQUIRED_VARS = ['MONGODB_URI', 'GOOGLE_API_KEY', 'GOOGLE_MAPS_API_KEY'] as const;

for (const v of REQUIRED_VARS) {
  if (!process.env[v]) {
    console.error(`[server] Fatal: environment variable "${v}" is not set.`);
    console.error(`         Ensure .env exists at the repo root with a valid ${v}.`);
    process.exit(1);
  }
}

const MONGODB_URI = process.env.MONGODB_URI!;
const PORT        = parseInt(process.env.PORT ?? '5000', 10);
const NODE_ENV    = process.env.NODE_ENV ?? 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────
// 3. MongoDB connection
// ─────────────────────────────────────────────────────────────

async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8_000,
      socketTimeoutMS:          45_000,
    });

    console.log(`[mongodb] Connected  →  ${maskUri(MONGODB_URI)}`);

    await mongoose.connection.syncIndexes();
    console.log('[mongodb] 2dsphere indexes synchronized');

  } catch (err) {
    console.error('[mongodb] Connection failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function maskUri(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return uri.slice(0, 30) + '…';
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Express app
// ─────────────────────────────────────────────────────────────

const app: Express = express();

// ── CORS ─────────────────────────────────────────────────────
// In development the Vite proxy handles cross-origin so CORS is
// permissive.  In production, both client and server run on the
// same origin (Express serves the static build), so CORS is
// effectively irrelevant — but we keep it for safety.
app.use(cors({
  origin:         CORS_ORIGIN,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logger (dev only) ─────────────────────────────────
if (NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}]  ${req.method.padEnd(6)} ${req.originalUrl}`);
    next();
  });
}

// ─────────────────────────────────────────────────────────────
// 5. API routes  (always mounted, dev + prod)
// ─────────────────────────────────────────────────────────────

app.use('/api', apiRouter);

// ─────────────────────────────────────────────────────────────
// 6. Production static file serving
// ─────────────────────────────────────────────────────────────

/**
 * In production (`NODE_ENV=production`):
 *   - `npm run build` in client/ runs `vite build` which outputs
 *     the compiled app to server/public/ (configured in vite.config.js).
 *   - Express then serves those files for every non-/api request.
 *   - The catch-all `*` route sends index.html so client-side
 *     routing (React Router, etc.) works on hard refresh.
 *
 * In development:
 *   - Vite's own dev server handles the frontend on port 3000.
 *   - Vite's proxy forwards /api calls to this server on port 5000.
 *   - This block is completely bypassed.
 */
if (NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, 'public');

  // Serve JS, CSS, images, etc.
  app.use(express.static(clientBuildPath));

  // For any route that is NOT /api/*, send the React index.html
  // so the browser-side router can take over.
  app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  // Dev-mode root sanity check (does not conflict with Vite on :3000)
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'Meridian API',
      mode:    'development',
      docs:    '/api/health',
      note:    'Frontend is served by Vite on port 3000',
    });
  });
}

// ─────────────────────────────────────────────────────────────
// 7. Global error handler + 404
// ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[unhandled]', err.stack ?? err.message);
  res.status(500).json({
    ok:    false,
    error: 'An unexpected server error occurred',
    ...(NODE_ENV === 'development' && { details: err.message }),
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: 'Route not found' });
});

// ─────────────────────────────────────────────────────────────
// 8. Bootstrap
// ─────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  await connectDB();

  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log(`  ║   Meridian API  [${NODE_ENV.padEnd(11)}]          ║`);
    console.log(`  ║   http://localhost:${PORT}                 ║`);
    if (NODE_ENV === 'development') {
      console.log(`  ║   Frontend  →  http://localhost:3000     ║`);
    } else {
      console.log(`  ║   Serving client build from ./public/    ║`);
    }
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
  });
}

bootstrap().catch((err) => {
  console.error('[bootstrap] Fatal error:', err);
  process.exit(1);
});

// ─────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[server] ${signal} received — shutting down gracefully…`);
  await mongoose.connection.close();
  console.log('[mongodb] Connection closed.');
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
