import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async initialize() {
    const SQL = await initSqlJs();

    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
      console.log('[Database] Loaded existing database');
    } else {
      this.db = new SQL.Database();
      await this.createTables();
      this.save();
      console.log('[Database] Created new database');
    }
  }

  async createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS stations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL UNIQUE,
        module_id TEXT NOT NULL,
        name TEXT NOT NULL,
        location TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS rainfall_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id INTEGER NOT NULL,
        period_type TEXT NOT NULL,
        period_value TEXT NOT NULL,
        amount_mm REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (station_id) REFERENCES stations(id),
        UNIQUE(station_id, period_type, period_value)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_rainfall_station_period 
      ON rainfall_data(station_id, period_type, period_value)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS system_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('[Database] Tables created');
  }

  save() {
    const data = this.db.export();
    writeFileSync(this.dbPath, data);
  }

  // Token methods
  async getTokens() {
    const result = this.db.exec('SELECT * FROM tokens WHERE id = 1');
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      access_token: row[1],
      refresh_token: row[2],
      expires_at: row[3],
    };
  }

  async saveTokens(tokens) {
    this.db.run(
      `INSERT OR REPLACE INTO tokens (id, access_token, refresh_token, expires_at, updated_at)
       VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [tokens.access_token, tokens.refresh_token, tokens.expires_at]
    );
    this.save();
  }

  // Station methods
  async saveStation(station) {
    this.db.run(
      `INSERT OR REPLACE INTO stations (device_id, module_id, name, location)
       VALUES (?, ?, ?, ?)`,
      [station.device_id, station.module_id, station.name, station.location]
    );
    this.save();
  }

  async getStations() {
    const result = this.db.exec('SELECT * FROM stations ORDER BY name');
    if (result.length === 0) return [];

    return result[0].values.map((row) => ({
      id: row[0],
      device_id: row[1],
      module_id: row[2],
      name: row[3],
      location: row[4],
    }));
  }

  // Rainfall data methods
  async saveRainfallData(stationId, periodType, periodValue, amountMm) {
    this.db.run(
      `INSERT OR REPLACE INTO rainfall_data (station_id, period_type, period_value, amount_mm, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [stationId, periodType, periodValue, amountMm]
    );
    this.save();
  }

  async getRainfallData(stationId, periodType, periodValue = null) {
    let query = `SELECT * FROM rainfall_data WHERE station_id = ? AND period_type = ?`;
    const params = [stationId, periodType];

    if (periodValue) {
      query += ` AND period_value = ?`;
      params.push(periodValue);
    }

    query += ` ORDER BY period_value DESC`;

    const result = this.db.exec(query, params);
    if (result.length === 0) return [];

    return result[0].values.map((row) => ({
      id: row[0],
      station_id: row[1],
      period_type: row[2],
      period_value: row[3],
      amount_mm: row[4],
      created_at: row[5],
    }));
  }

  // System status methods
  async updateSystemStatus(key, value) {
    this.db.run(
      `INSERT OR REPLACE INTO system_status (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [key, value]
    );
    this.save();
  }

  async getSystemStatus(key = null) {
    let query = 'SELECT * FROM system_status';
    const params = [];

    if (key) {
      query += ' WHERE key = ?';
      params.push(key);
    }

    const result = this.db.exec(query, params);
    if (result.length === 0) return key ? null : [];

    if (key) {
      return result[0].values[0] ? result[0].values[0][1] : null;
    }

    return result[0].values.map((row) => ({
      key: row[1],
      value: row[2],
      updated_at: row[3],
    }));
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
