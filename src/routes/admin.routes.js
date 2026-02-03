import { adminAuthMiddleware } from '../middleware/admin-auth.js';

export async function adminRoutes(fastify) {
  // Apply auth middleware to all admin routes
  fastify.addHook('onRequest', adminAuthMiddleware);

  // Get admin status
  fastify.get('/status', async (request, reply) => {
    try {
      const tokenStatus = fastify.tokenManager.getStatus();
      const systemStatus = await fastify.db.getSystemStatus();

      return {
        success: true,
        data: {
          token: tokenStatus,
          system: systemStatus,
        },
      };
    } catch (error) {
      fastify.log.error('Error fetching admin status:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Update tokens manually
  fastify.post('/tokens', async (request, reply) => {
    try {
      const { access_token, refresh_token } = request.body;

      if (!access_token || !refresh_token) {
        return reply.status(400).send({
          success: false,
          error: 'access_token and refresh_token are required',
        });
      }

      // Test tokens with Netatmo API
      try {
        await fastify.netatmoService.getStationsData(access_token);
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid tokens - API test failed',
        });
      }

      // Update tokens
      await fastify.tokenManager.updateTokens(access_token, refresh_token);

      return {
        success: true,
        message: 'Tokens updated successfully',
      };
    } catch (error) {
      fastify.log.error('Error updating tokens:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });
}
