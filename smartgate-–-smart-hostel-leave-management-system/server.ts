import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { connectDB } from './server/config/db.ts';
import apiRouter from './server/routes/index.ts';
import { ensureInitialSeed } from './server/seed.ts';
import { syncOverdueLeaves } from './server/utils/leaveHelpers.ts';

const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin)
);

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const requiredVariables = ['MONGODB_URI', 'JWT_SECRET', 'QR_SIGNING_SECRET'];
    const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());
    if (missingVariables.length > 0) {
      throw new Error(
        `Missing required production environment variables: ${missingVariables.join(', ')}`
      );
    }
    if (allowedOrigins.size === 0) {
      console.warn(
        '[SmartGate] CORS_ORIGINS is empty; cross-origin browser requests will be rejected.'
      );
    }
  }

  await connectDB();
  await ensureInitialSeed();

  const app = express();
  app.use(cors({
    origin: (origin, callback) => {
      const isAllowed = !origin || allowedOrigins.has(origin);
      callback(null, isAllowed);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  }));
  app.options('*', (_req, res) => res.sendStatus(204));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  const healthCheck: express.RequestHandler = async (_req, res) => {
    try {
      await connectDB();
      res.json({ status: 'ok', service: 'SmartGate API', timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('[SmartGate Health] Database connection unavailable:', error);
      res.status(503).json({ status: 'unavailable', service: 'SmartGate API' });
    }
  };

  app.get('/health', healthCheck);
  app.get('/api/health', healthCheck);

  app.use('/api', (_req, res, next) => {
    void connectDB()
      .then(() => next())
      .catch((error: unknown) => {
        console.error('[SmartGate DB] API request blocked because MongoDB is unavailable:', error);
        res.status(503).json({
          error: 'SmartGate is temporarily unable to reach its database. Please try again shortly.',
        });
      });
  });

  // Serve uploaded supporting documents securely
  const uploadsDir = path.resolve(process.cwd(), 'server', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // REST API routes
  app.use('/api', apiRouter);

  // API error handler (including Multer upload errors)
  app.use('/api', (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[SmartGate API Error]', err.message);
    res.status(400).json({ error: err.message || 'API request error' });
  });

  // Periodic background overdue check (every 60s)
  setInterval(() => {
    syncOverdueLeaves().catch((err) => console.error('Overdue sync error:', err));
  }, 60 * 1000);

  // Vite dev middleware vs static production serving
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SmartGate] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[SmartGate] Fatal startup failure:', err);
  process.exit(1);
});
