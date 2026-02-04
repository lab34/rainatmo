export async function dailyUpdateJob(fastify) {
  try {
    console.log('[DailyUpdateJob] Starting daily aggregates calculation...');

    const stations = await fastify.db.getStations();
    if (stations.length === 0) {
      console.log('[DailyUpdateJob] No stations found, skipping...');
      return;
    }

    const accessToken = await fastify.tokenManager.getAccessToken();
    const now = Math.floor(Date.now() / 1000);

    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    const yesterdayStart = Math.floor(yesterday.getTime() / 1000);
    const yesterdayEnd = yesterdayStart + 86400; // +24 hours

    for (const station of stations) {
      console.log(`[DailyUpdateJob] Processing station: ${station.name} (${station.location})`);

      // Fetch yesterday's daily rainfall
      try {
        const measurements = await fastify.netatmoService.getMeasure(
          accessToken,
          station.device_id,
          station.module_id,
          yesterdayStart,
          yesterdayEnd,
          '5min' // Use 5min scale for accurate daily totals
        );

        if (measurements.length > 0) {
          const total = measurements.reduce((sum, m) => sum + m.value, 0);
          const dateStr = yesterday.toISOString().split('T')[0];

          await fastify.db.saveRainfallData(station.id, 'day', dateStr, total);
          console.log(`  ✓ Saved daily data for ${dateStr}: ${total.toFixed(2)}mm`);
        } else {
          const dateStr = yesterday.toISOString().split('T')[0];
          console.log(`  - No rainfall for ${dateStr} (0mm)`);
          // Save 0mm to keep continuity
          await fastify.db.saveRainfallData(station.id, 'day', dateStr, 0);
        }
      } catch (error) {
        console.error(`  ✗ Error fetching daily data for ${station.location}:`, error.message);
      }

      // Calculate monthly aggregate for current month (always update)
      const today = new Date();
      const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthKey = currentMonth.toISOString().slice(0, 7); // YYYY-MM

      console.log(`  - Updating monthly aggregate for ${monthKey}`);
      await calculateMonthlyAggregate(fastify, station, currentMonth);

      // Calculate monthly aggregate for previous month if it's the 1st of the month
      if (today.getDate() === 1) {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthKey = lastMonth.toISOString().slice(0, 7);
        console.log(`  - Finalizing monthly aggregate for ${lastMonthKey}`);
        await calculateMonthlyAggregate(fastify, station, lastMonth);
      }

      // Calculate yearly aggregate for current year (always update)
      const currentYear = today.getFullYear();
      console.log(`  - Updating yearly aggregate for ${currentYear}`);
      await calculateYearlyAggregate(fastify, station, currentYear);

      // Calculate yearly aggregate for previous year if it's Jan 1st
      if (today.getMonth() === 0 && today.getDate() === 1) {
        const lastYear = today.getFullYear() - 1;
        console.log(`  - Finalizing yearly aggregate for ${lastYear}`);
        await calculateYearlyAggregate(fastify, station, lastYear);
      }
    }

    await fastify.db.updateSystemStatus(
      'last_aggregates_calculation',
      new Date().toISOString()
    );

    console.log('[DailyUpdateJob] ✓ Daily update completed');
  } catch (error) {
    console.error('[DailyUpdateJob] ✗ Failed:', error.message);
    throw error;
  }
}

async function calculateMonthlyAggregate(fastify, station, monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Get all days in the month
  const dailyData = await fastify.db.getRainfallData(station.id, 'day');
  const monthDays = dailyData.filter((d) => d.period_value.startsWith(monthKey));

  if (monthDays.length > 0) {
    const total = monthDays.reduce((sum, d) => sum + d.amount_mm, 0);
    await fastify.db.saveRainfallData(station.id, 'month', monthKey, total);
    console.log(`    - Monthly total for ${monthKey}: ${total.toFixed(2)}mm`);
  }
}

async function calculateYearlyAggregate(fastify, station, year) {
  const yearKey = year.toString();

  // Get all months in the year
  const monthlyData = await fastify.db.getRainfallData(station.id, 'month');
  const yearMonths = monthlyData.filter((d) => d.period_value.startsWith(yearKey));

  if (yearMonths.length > 0) {
    const total = yearMonths.reduce((sum, d) => sum + d.amount_mm, 0);
    await fastify.db.saveRainfallData(station.id, 'year', yearKey, total);
    console.log(`    - Yearly total for ${yearKey}: ${total.toFixed(2)}mm`);
  }
}
