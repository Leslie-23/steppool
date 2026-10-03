import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';

import { consoleRouter } from './admin.js';
import { authRouter } from './auth.js';
import { adminRouter, challengesRouter } from './challenges.js';
import { errorHandler } from './errors.js';
import { meRouter, notificationsRouter, payoutsRouter, stepsRouter, walletRouter } from './routes.js';
import { webRouter } from './web.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1); // Render terminates TLS in front of us
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: mongoose.connection.readyState === 1 });
  });
  app.use(webRouter);
  app.use('/auth', authRouter);
  app.use('/me', meRouter);
  app.use('/steps', stepsRouter);
  app.use('/challenges', challengesRouter);
  app.use('/wallet', walletRouter);
  app.use('/notifications', notificationsRouter);
  app.use('/payouts', payoutsRouter);
  app.use('/admin', adminRouter);
  app.use('/admin', consoleRouter);
  app.use(errorHandler);
  return app;
}
