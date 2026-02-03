export async function stationsRoutes(fastify) {
  // Get all stations
  fastify.get('/', async (request, reply) => {
    try {
      let stations = await fastify.db.getStations();

      // If no stations in DB, fetch from Netatmo
      if (stations.length === 0) {
        fastify.log.info('No stations in DB, fetching from Netatmo...');
        const accessToken = await fastify.tokenManager.getAccessToken();
        stations = await fastify.netatmoService.getStationsData(accessToken);

        // Save to database
        for (const station of stations) {
          await fastify.db.saveStation(station);
        }

        stations = await fastify.db.getStations();
      }

      return { success: true, data: stations };
    } catch (error) {
      fastify.log.error('Error fetching stations:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Refresh stations from Netatmo API
  fastify.post('/refresh', async (request, reply) => {
    try {
      const accessToken = await fastify.tokenManager.getAccessToken();
      const stations = await fastify.netatmoService.getStationsData(accessToken);

      for (const station of stations) {
        await fastify.db.saveStation(station);
      }

      const updatedStations = await fastify.db.getStations();

      return {
        success: true,
        message: `Updated ${updatedStations.length} stations`,
        data: updatedStations,
      };
    } catch (error) {
      fastify.log.error('Error refreshing stations:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });
}
