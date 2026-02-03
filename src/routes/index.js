import { stationsRoutes } from './stations.routes.js';
import { rainfallRoutes } from './rainfall.routes.js';
import { systemRoutes } from './system.routes.js';
import { adminRoutes } from './admin.routes.js';

export function setupRoutes(fastify) {
  // API routes
  fastify.register(stationsRoutes, { prefix: '/api/stations' });
  fastify.register(rainfallRoutes, { prefix: '/api/rainfall' });
  fastify.register(systemRoutes, { prefix: '/api/system' });

  // Admin routes
  fastify.register(adminRoutes, { prefix: '/admin' });

  // Health check
  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
