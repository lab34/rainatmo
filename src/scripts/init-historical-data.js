#!/usr/bin/env node

import 'dotenv/config';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Database } from '../db/database.js';
import { TokenManager } from '../utils/token-manager.js';
import { NetatmoService } from '../services/netatmo.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '../../db/rainatmo.sqlite');

// Configuration
const YEARS_OF_HISTORY = process.env.TEST_DAYS ? 0 : 5; // Override for testing
const TEST_DAYS = process.env.TEST_DAYS ? parseInt(process.env.TEST_DAYS) : null;
const REQUEST_DELAY_MS = 200; // Throttling to avoid rate limits
const PROGRESS_LOG_EVERY = 50; // Log every N days

/**
 * Initialize historical rainfall data from Netatmo API
 * Fetches daily data for the past 5 years and calculates monthly/yearly aggregates
 */
async function main() {
  console.log('========================================');
  console.log('  Historical Data Initialization');
  console.log('========================================\n');

  // Initialize services
  const database = new Database(DB_PATH);
  await database.initialize();

  const tokenManager = new TokenManager(database);
  await tokenManager.initialize();

  const netatmoService = new NetatmoService();

  try {
    // Get access token
    const accessToken = await tokenManager.getAccessToken();
    console.log('✓ Access token obtained\n');

    // Get stations
    const stations = await database.getStations();
    if (stations.length === 0) {
      console.error('✗ No stations found in database');
      console.log('\nPlease refresh stations first via /admin/stations endpoint');
      process.exit(1);
    }
    console.log(`✓ Found ${stations.length} station(s):\n`);
    for (const station of stations) {
      console.log(`  - ${station.location} (${station.name})`);
    }
    console.log();

    // Calculate date range
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // Yesterday
    endDate.setHours(0, 0, 0, 0);

    const startDate = new Date();
    if (TEST_DAYS) {
      startDate.setDate(startDate.getDate() - TEST_DAYS);
      console.log(`⚠️  TEST MODE: Processing only ${TEST_DAYS} days\n`);
    } else {
      startDate.setFullYear(startDate.getFullYear() - YEARS_OF_HISTORY);
    }
    startDate.setHours(0, 0, 0, 0);

    const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));

    console.log(`📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    console.log(`📊 Total days to process: ${totalDays}\n`);

    // Process each station
    for (const station of stations) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing station: ${station.location}`);
      console.log('='.repeat(60));

      await processStation(netatmoService, database, accessToken, station, startDate, endDate);
    }

    // Calculate aggregates
    console.log(`\n${'='.repeat(60)}`);
    console.log('Calculating monthly and yearly aggregates...');
    console.log('='.repeat(60));

    for (const station of stations) {
      await calculateAggregates(database, station, startDate, endDate);
    }

    // Final summary
    console.log('\n========================================');
    console.log('  ✓ Initialization Complete!');
    console.log('========================================\n');

    const stats = await getStats(database);
    console.log('Database statistics:');
    console.log(`  - Daily records: ${stats.days}`);
    console.log(`  - Monthly records: ${stats.months}`);
    console.log(`  - Yearly records: ${stats.years}`);
    console.log(`  - Total: ${stats.total} records\n`);

    database.close();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Fatal error:', error.message);
    console.error(error.stack);
    database.close();
    process.exit(1);
  }
}

/**
 * Process all daily data for a station
 */
async function processStation(netatmoService, database, accessToken, station, startDate, endDate) {
  const currentDate = new Date(startDate);
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const totalDays = Math.floor((endDate - currentDate) / (1000 * 60 * 60 * 24)) + 1;

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    processedCount++;

    try {
      // Check if data already exists
      const existing = await database.getRainfallData(station.id, 'day');
      const hasData = existing.some((d) => d.period_value === dateStr);

      if (hasData) {
        skippedCount++;
        if (processedCount % PROGRESS_LOG_EVERY === 0) {
          console.log(`  [${processedCount}/${totalDays}] ${dateStr} - skipped (already exists)`);
        }
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Fetch data from Netatmo API
      const dayStart = Math.floor(currentDate.getTime() / 1000);
      const dayEnd = dayStart + 86400; // +24 hours

      const measurements = await netatmoService.getMeasure(
        accessToken,
        station.device_id,
        station.module_id,
        dayStart,
        dayEnd,
        '5min' // Use 5min scale for accurate daily totals
      );

      // Calculate total rainfall
      const total = measurements.length > 0
        ? measurements.reduce((sum, m) => sum + m.value, 0)
        : 0;

      // Save to database
      await database.saveRainfallData(station.id, 'day', dateStr, total);

      if (processedCount % PROGRESS_LOG_EVERY === 0) {
        console.log(`  [${processedCount}/${totalDays}] ${dateStr} - ${total.toFixed(1)}mm`);
      }

      // Throttling
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      errorCount++;
      console.error(`  ✗ [${processedCount}/${totalDays}] ${dateStr} - ERROR: ${error.message}`);
      
      // Stop on error as per requirements
      console.error('\n❌ Stopping due to error. Fix the issue and re-run the script.');
      console.error('The script will automatically skip already processed days.\n');
      throw error;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`\n✓ Station ${station.location} complete:`);
  console.log(`  - Processed: ${processedCount} days`);
  console.log(`  - Skipped: ${skippedCount} (already in DB)`);
  console.log(`  - New records: ${processedCount - skippedCount}`);
  if (errorCount > 0) {
    console.log(`  - Errors: ${errorCount}`);
  }
}

/**
 * Calculate monthly and yearly aggregates from daily data
 */
async function calculateAggregates(database, station, startDate, endDate) {
  console.log(`\nCalculating aggregates for ${station.location}...`);

  // Get all daily data
  const dailyData = await database.getRainfallData(station.id, 'day');

  if (dailyData.length === 0) {
    console.log('  - No daily data found, skipping aggregates');
    return;
  }

  // Calculate monthly aggregates
  const monthsMap = new Map();
  for (const day of dailyData) {
    const monthKey = day.period_value.substring(0, 7); // YYYY-MM
    if (!monthsMap.has(monthKey)) {
      monthsMap.set(monthKey, 0);
    }
    monthsMap.set(monthKey, monthsMap.get(monthKey) + day.amount_mm);
  }

  let monthsAdded = 0;
  for (const [monthKey, total] of monthsMap.entries()) {
    // Check if already exists
    const existing = await database.getRainfallData(station.id, 'month');
    const hasData = existing.some((m) => m.period_value === monthKey);

    if (!hasData) {
      await database.saveRainfallData(station.id, 'month', monthKey, total);
      monthsAdded++;
    }
  }

  console.log(`  - Monthly aggregates: ${monthsAdded} new (${monthsMap.size} total)`);

  // Calculate yearly aggregates
  const yearsMap = new Map();
  for (const [monthKey, total] of monthsMap.entries()) {
    const yearKey = monthKey.substring(0, 4); // YYYY
    if (!yearsMap.has(yearKey)) {
      yearsMap.set(yearKey, 0);
    }
    yearsMap.set(yearKey, yearsMap.get(yearKey) + total);
  }

  let yearsAdded = 0;
  for (const [yearKey, total] of yearsMap.entries()) {
    // Check if already exists
    const existing = await database.getRainfallData(station.id, 'year');
    const hasData = existing.some((y) => y.period_value === yearKey);

    if (!hasData) {
      await database.saveRainfallData(station.id, 'year', yearKey, total);
      yearsAdded++;
    }
  }

  console.log(`  - Yearly aggregates: ${yearsAdded} new (${yearsMap.size} total)`);
}

/**
 * Get database statistics
 */
async function getStats(database) {
  const stations = await database.getStations();
  let days = 0;
  let months = 0;
  let years = 0;

  for (const station of stations) {
    const dailyData = await database.getRainfallData(station.id, 'day');
    const monthlyData = await database.getRainfallData(station.id, 'month');
    const yearlyData = await database.getRainfallData(station.id, 'year');

    days += dailyData.length;
    months += monthlyData.length;
    years += yearlyData.length;
  }

  return {
    days,
    months,
    years,
    total: days + months + years,
  };
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run
main();
