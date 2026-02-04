export async function rainfallRoutes(fastify) {
  // Get historical rainfall data (from SQLite)
  fastify.get('/historical', async (request, reply) => {
    try {
      const stations = await fastify.db.getStations();
      const data = {};

      for (const station of stations) {
        // Get monthly and yearly data
        const monthlyData = await fastify.db.getRainfallData(station.id, 'month');
        const yearlyData = await fastify.db.getRainfallData(station.id, 'year');

        data[station.id] = {
          station: station,
          months: monthlyData,
          years: yearlyData,
        };
      }

      return { success: true, data };
    } catch (error) {
      fastify.log.error('Error fetching historical data:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get current rainfall data (try API, fallback to cache)
  fastify.get('/current/:stationId', async (request, reply) => {
    try {
      const { stationId } = request.params;
      const stations = await fastify.db.getStations();
      const station = stations.find((s) => s.id === parseInt(stationId));

      if (!station) {
        return reply.status(404).send({
          success: false,
          error: 'Station not found',
        });
      }

      const data = {
        station: station,
        periods: {},
        source: 'cache',
        fresh: false,
      };

      try {
        // Try to fetch from Netatmo API
        const accessToken = await fastify.tokenManager.getAccessToken();
        const now = Math.floor(Date.now() / 1000);
        const periods = ['30min', '1hour', '3hours'];

        for (const period of periods) {
          const measurements = await fastify.netatmoService.getMeasure(
            accessToken,
            station.device_id,
            station.module_id,
            now - getPeriodSeconds(period),
            now,
            period
          );

          if (measurements.length > 0) {
            const total = measurements.reduce((sum, m) => sum + m.value, 0);
            data.periods[period] = total;

            // Save to cache
            await fastify.db.saveRainfallData(station.id, period, new Date().toISOString(), total);
          }
        }

        // Get "today" data (since midnight UTC)
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const todayStart = Math.floor(today.getTime() / 1000);

        try {
          const todayMeasurements = await fastify.netatmoService.getMeasure(
            accessToken,
            station.device_id,
            station.module_id,
            todayStart,
            now,
            '5min' // Use 5min scale for intraday data
          );

          fastify.log.debug(`Today measurements for station ${station.id}:`, {
            count: todayMeasurements.length,
            start: new Date(todayStart * 1000).toISOString(),
            end: new Date(now * 1000).toISOString(),
          });

          if (todayMeasurements.length > 0) {
            const total = todayMeasurements.reduce((sum, m) => sum + m.value, 0);
            data.periods.today = total;
            await fastify.db.saveRainfallData(
              station.id,
              'day',
              today.toISOString().split('T')[0],
              total
            );
          } else {
            // No rain today, set to 0
            data.periods.today = 0;
          }
        } catch (todayError) {
          fastify.log.warn(`Failed to fetch today data for station ${station.id}:`, todayError.message);
          // Try to get from cache
          const cached = await fastify.db.getRainfallData(station.id, 'day');
          const todayStr = today.toISOString().split('T')[0];
          const todayCache = cached.find((d) => d.period_value === todayStr);
          data.periods.today = todayCache ? todayCache.amount_mm : 0;
        }

        data.source = 'api';
        data.fresh = true;

        // Update last API success
        await fastify.db.updateSystemStatus('last_api_success', new Date().toISOString());
      } catch (apiError) {
        fastify.log.warn('API call failed, using cached data:', apiError.message);

        // Fallback to cached data
        const periods = ['30min', '1hour', '3hours', 'day'];
        for (const period of periods) {
          const cached = await fastify.db.getRainfallData(station.id, period);
          if (cached.length > 0) {
            const key = period === 'day' ? 'today' : period;
            data.periods[key] = cached[0].amount_mm;
          }
        }
      }

      return { success: true, data };
    } catch (error) {
      fastify.log.error('Error fetching current data:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Update cache after successful frontend API call
  fastify.post('/update-cache', async (request, reply) => {
    try {
      const { stationId, periods } = request.body;

      for (const [period, value] of Object.entries(periods)) {
        await fastify.db.saveRainfallData(stationId, period, new Date().toISOString(), value);
      }

      await fastify.db.updateSystemStatus('last_api_success', new Date().toISOString());

      return { success: true, message: 'Cache updated' };
    } catch (error) {
      fastify.log.error('Error updating cache:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });
}

function getPeriodSeconds(period) {
  const periods = {
    '30min': 1800,
    '1hour': 3600,
    '3hours': 10800,
  };
  return periods[period] || 3600;
}
