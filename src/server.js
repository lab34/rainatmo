import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { Database } from './db/database.js';
import { TokenManager } from './utils/token-manager.js';
import { NetatmoService } from './services/netatmo.service.js';
import { setupRoutes } from './routes/index.js';
import { startScheduler } from './jobs/scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || join(__dirname, '../db/rainatmo.sqlite');

async function start() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // Initialize database
  const database = new Database(DB_PATH);
  await database.initialize();

  // Initialize token manager
  const tokenManager = new TokenManager(database);
  await tokenManager.initialize();

  // Initialize Netatmo service
  const netatmoService = new NetatmoService();

  // Add to Fastify instance
  fastify.decorate('db', database);
  fastify.decorate('tokenManager', tokenManager);
  fastify.decorate('netatmoService', netatmoService);

  // Register plugins
  await fastify.register(fastifyCors, {
    origin: true,
  });

  await fastify.register(fastifyStatic, {
    root: join(__dirname, '../public'),
    prefix: '/',
  });

  // Setup routes
  setupRoutes(fastify);

  // Start scheduler (cron jobs)
  startScheduler(fastify);

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
      await fastify.close();
      database.close();
      process.exit(0);
    });
  }

  // Start server
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
