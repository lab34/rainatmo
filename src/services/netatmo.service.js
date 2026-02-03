import 'dotenv/config';

const NETATMO_BASE_URL = 'https://api.netatmo.com';

export class NetatmoService {
  constructor() {
    this.clientId = process.env.NETATMO_CLIENT_ID;
    this.clientSecret = process.env.NETATMO_CLIENT_SECRET;
  }

  /**
   * Refresh OAuth2 access token using refresh token
   * @param {string} refreshToken - Current refresh token
   * @returns {Promise<{access_token: string, refresh_token: string, expires_in: number}>}
   */
  async refreshAccessToken(refreshToken) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(`${NETATMO_BASE_URL}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in || 10800, // 3 hours default
    };
  }

  /**
   * Get stations data (device and module IDs)
   * @param {string} accessToken - Current access token
   * @returns {Promise<Array>} List of stations with their IDs
   */
  async getStationsData(accessToken) {
    const response = await fetch(`${NETATMO_BASE_URL}/api/getstationsdata`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('TOKEN_EXPIRED');
      }
      const error = await response.text();
      throw new Error(`Get stations failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const stations = [];

    if (data.body && data.body.devices) {
      for (const device of data.body.devices) {
        if (device.modules) {
          for (const module of device.modules) {
            if (module.type === 'NAModule3') {
              // Rain Gauge module
              stations.push({
                device_id: device._id,
                module_id: module._id,
                name: module.module_name || device.station_name,
                location: device.place ? device.place.city : 'Unknown',
              });
            }
          }
        }
      }
    }

    return stations;
  }

  /**
   * Get rainfall measurements for a specific period
   * @param {string} accessToken - Current access token
   * @param {string} deviceId - Device ID
   * @param {string} moduleId - Rain gauge module ID
   * @param {number} dateBegin - Unix timestamp start
   * @param {number} dateEnd - Unix timestamp end
   * @param {string} scale - Time scale (30min, 1hour, 3hours, 1day, 1week, 1month)
   * @returns {Promise<Array>} Rainfall measurements
   */
  async getMeasure(accessToken, deviceId, moduleId, dateBegin, dateEnd, scale) {
    const params = new URLSearchParams({
      device_id: deviceId,
      module_id: moduleId,
      scale: scale,
      type: 'Rain',
      date_begin: dateBegin.toString(),
      date_end: dateEnd.toString(),
    });

    const response = await fetch(`${NETATMO_BASE_URL}/api/getmeasure?${params}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('TOKEN_EXPIRED');
      }
      const error = await response.text();
      throw new Error(`Get measure failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const measurements = [];

    if (data.body) {
      for (const [timestamp, values] of Object.entries(data.body)) {
        if (values && values[0] !== null) {
          measurements.push({
            timestamp: parseInt(timestamp),
            date: new Date(parseInt(timestamp) * 1000),
            value: values[0],
          });
        }
      }
    }

    return measurements;
  }
}
