import { NetatmoService } from '../services/netatmo.service.js';

export class TokenManager {
  constructor(database) {
    this.db = database;
    this.netatmoService = new NetatmoService();
    this.tokens = null;
    this.refreshPromise = null;
  }

  /**
   * Initialize tokens from database or environment
   */
  async initialize() {
    const dbTokens = await this.db.getTokens();

    if (dbTokens) {
      this.tokens = dbTokens;
      console.log('[TokenManager] Tokens loaded from database');
    } else {
      this.tokens = {
        access_token: process.env.NETATMO_ACCESS_TOKEN,
        refresh_token: process.env.NETATMO_REFRESH_TOKEN,
        expires_at: Date.now() + 10800000, // 3 hours
      };
      await this.db.saveTokens(this.tokens);
      console.log('[TokenManager] Tokens initialized from environment');
    }
  }

  /**
   * Get current access token (refresh if needed)
   */
  async getAccessToken() {
    if (!this.tokens) {
      await this.initialize();
    }

    const now = Date.now();
    const timeUntilExpiry = this.tokens.expires_at - now;

    if (timeUntilExpiry < 300000) {
      // Less than 5 minutes remaining
      console.log('[TokenManager] Token expiring soon, refreshing...');
      await this.refresh();
    }

    return this.tokens.access_token;
  }

  /**
   * Refresh tokens (with deduplication)
   */
  async refresh() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async _doRefresh() {
    try {
      console.log('[TokenManager] Refreshing tokens...');
      const newTokens = await this.netatmoService.refreshAccessToken(
        this.tokens.refresh_token
      );

      this.tokens = {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: Date.now() + newTokens.expires_in * 1000,
      };

      await this.db.saveTokens(this.tokens);
      await this.db.updateSystemStatus('last_token_refresh', new Date().toISOString());

      console.log('[TokenManager] Tokens refreshed successfully');
    } catch (error) {
      console.error('[TokenManager] Token refresh failed:', error.message);
      throw error;
    }
  }

  /**
   * Manually update tokens (from admin panel)
   */
  async updateTokens(accessToken, refreshToken) {
    this.tokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + 10800000, // 3 hours
    };

    await this.db.saveTokens(this.tokens);
    await this.db.updateSystemStatus('last_token_refresh', new Date().toISOString());

    console.log('[TokenManager] Tokens updated manually');
  }

  /**
   * Get token status
   */
  getStatus() {
    if (!this.tokens) {
      return { initialized: false };
    }

    const now = Date.now();
    const expiresIn = Math.floor((this.tokens.expires_at - now) / 1000);

    return {
      initialized: true,
      expires_at: new Date(this.tokens.expires_at).toISOString(),
      expires_in_seconds: expiresIn,
      is_expired: expiresIn <= 0,
    };
  }
}
