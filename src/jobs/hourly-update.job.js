export async function hourlyUpdateJob(fastify) {
  try {
    console.log('[HourlyUpdateJob] Starting hourly data update...');

    const stations = await fastify.db.getStations();
    if (stations.length === 0) {
      console.log('[HourlyUpdateJob] No stations found, skipping...');
      return;
    }

    const accessToken = await fastify.tokenManager.getAccessToken();
    const now = Math.floor(Date.now() / 1000);
    const periods = ['30min', '1hour', '3hours'];

    for (const station of stations) {
      console.log(`[HourlyUpdateJob] Updating station: ${station.name}`);

      // Update small periods
      for (const period of periods) {
        try {
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
            await fastify.db.saveRainfallData(
              station.id,
              period,
              new Date().toISOString(),
              total
            );
            console.log(`  - ${period}: ${total.toFixed(2)}mm`);
          }
        } catch (error) {
          console.error(`  - Error fetching ${period}:`, error.message);
        }
      }

      // Update "today" data
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStart = Math.floor(today.getTime() / 1000);

        const todayMeasurements = await fastify.netatmoService.getMeasure(
          accessToken,
          station.device_id,
          station.module_id,
          todayStart,
          now,
          '1day'
        );

        if (todayMeasurements.length > 0) {
          const total = todayMeasurements.reduce((sum, m) => sum + m.value, 0);
          await fastify.db.saveRainfallData(
            station.id,
            'day',
            today.toISOString().split('T')[0],
            total
          );
          console.log(`  - today: ${total.toFixed(2)}mm`);
        }
      } catch (error) {
        console.error('  - Error fetching today:', error.message);
      }
    }

    await fastify.db.updateSystemStatus('last_api_success', new Date().toISOString());
    console.log('[HourlyUpdateJob] Hourly update completed');
  } catch (error) {
    console.error('[HourlyUpdateJob] Failed:', error.message);
    throw error;
  }
}

function getPeriodSeconds(period) {
  const periods = {
    '30min': 1800,
    '1hour': 3600,
    '3hours': 10800,
  };
  return periods[period] || 3600;
}
