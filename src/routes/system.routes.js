export async function systemRoutes(fastify) {
  // Get system status (last refresh times, etc.)
  fastify.get('/status', async (request, reply) => {
    try {
      const statuses = await fastify.db.getSystemStatus();
      const tokenStatus = fastify.tokenManager.getStatus();

      const statusMap = {};
      for (const status of statuses) {
        statusMap[status.key] = {
          value: status.value,
          updated_at: status.updated_at,
        };
      }

      return {
        success: true,
        data: {
          token: tokenStatus,
          last_token_refresh: statusMap.last_token_refresh || null,
          last_aggregates_calculation: statusMap.last_aggregates_calculation || null,
          last_api_success: statusMap.last_api_success || null,
          server_time: new Date().toISOString(),
        },
      };
    } catch (error) {
      fastify.log.error('Error fetching system status:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });
}
