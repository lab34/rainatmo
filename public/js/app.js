const API_BASE = window.location.origin;

let stationsData = [];
let rainfallData = {};
let systemStatus = {};

// Main initialization
async function init() {
  try {
    await Promise.all([fetchStations(), fetchSystemStatus()]);
    await fetchAllData();
    buildTable();
    showTable();

    // Auto-refresh every 5 minutes
    setInterval(refresh, 5 * 60 * 1000);
  } catch (error) {
    showError(`Erreur d'initialisation: ${error.message}`);
  }
}

async function fetchStations() {
  const response = await fetch(`${API_BASE}/api/stations`);
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error);
  }

  stationsData = result.data;
  console.log('Stations loaded:', stationsData);
}

async function fetchSystemStatus() {
  const response = await fetch(`${API_BASE}/api/system/status`);
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error);
  }

  systemStatus = result.data;
  updateStatusFooter();
}

async function fetchAllData() {
  // Fetch historical data
  const histResponse = await fetch(`${API_BASE}/api/rainfall/historical`);
  const histResult = await histResponse.json();

  if (histResult.success) {
    rainfallData = histResult.data;
  }

  // Fetch current data for each station
  for (const station of stationsData) {
    const currentResponse = await fetch(`${API_BASE}/api/rainfall/current/${station.id}`);
    const currentResult = await currentResponse.json();

    if (currentResult.success) {
      if (!rainfallData[station.id]) {
        rainfallData[station.id] = { station, months: [], years: [] };
      }
      rainfallData[station.id].current = currentResult.data.periods;
      rainfallData[station.id].fresh = currentResult.data.fresh;
    }
  }
}

function buildTable() {
  const header = document.getElementById('table-header');
  const body = document.getElementById('table-body');

  // Build header
  header.innerHTML = '<th>Période</th>';
  for (const station of stationsData) {
    const th = document.createElement('th');
    th.textContent = station.location; // Use location instead of name
    header.appendChild(th);
  }

  // Build rows
  const rows = [];

  // Current periods (30min, 1h, 3h, today)
  rows.push(createRow('30 minutes', '30min', 'current'));
  rows.push(createRow('1 heure', '1hour', 'current'));
  rows.push(createRow('3 heures', '3hours', 'current'));
  rows.push(createRow("Aujourd'hui", 'today', 'current'));

  // Current month
  const currentMonth = new Date().toISOString().slice(0, 7);
  rows.push(createRow('Ce mois', currentMonth, 'month'));

  // Previous months (last 12 months)
  for (let i = 1; i <= 12; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthKey = date.toISOString().slice(0, 7);
    const monthName = date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
    rows.push(createRow(monthName, monthKey, 'month'));
  }

  // Years (last 5 years)
  const currentYear = new Date().getFullYear();
  for (let i = 0; i < 5; i++) {
    const year = currentYear - i;
    rows.push(createRow(`Année ${year}`, year.toString(), 'year'));
  }

  body.innerHTML = rows.join('');
}

function createRow(label, key, type) {
  let html = `<tr><td>${label}</td>`;

  for (const station of stationsData) {
    const data = rainfallData[station.id];
    let value = '-';
    let cssClass = '';

    if (data) {
      if (type === 'current') {
        if (data.current && data.current[key] !== undefined) {
          value = `${data.current[key].toFixed(1)} mm`;
          cssClass = data.fresh ? 'fresh-data' : 'cached-data';
        }
      } else if (type === 'month') {
        const monthData = data.months?.find((m) => m.period_value === key);
        if (monthData) {
          value = `${monthData.amount_mm.toFixed(1)} mm`;
        }
      } else if (type === 'year') {
        const yearData = data.years?.find((y) => y.period_value === key);
        if (yearData) {
          value = `${yearData.amount_mm.toFixed(1)} mm`;
        }
      }
    }

    html += `<td class="amount ${cssClass}">${value}</td>`;
  }

  html += '</tr>';
  return html;
}

function updateStatusFooter() {
  const footer = document.getElementById('status-footer');
  const tokenEl = document.getElementById('status-token');
  const aggregatesEl = document.getElementById('status-aggregates');
  const apiEl = document.getElementById('status-api');

  // Token refresh
  if (systemStatus.last_token_refresh) {
    const date = new Date(systemStatus.last_token_refresh.value);
    tokenEl.textContent = formatDate(date);
    tokenEl.className = 'status-value ' + getStatusClass(date);
  }

  // Aggregates calculation
  if (systemStatus.last_aggregates_calculation) {
    const date = new Date(systemStatus.last_aggregates_calculation.value);
    aggregatesEl.textContent = formatDate(date);
    aggregatesEl.className = 'status-value ' + getStatusClass(date);
  }

  // API success
  if (systemStatus.last_api_success) {
    const date = new Date(systemStatus.last_api_success.value);
    apiEl.textContent = formatDate(date);
    apiEl.className = 'status-value ' + getStatusClass(date);
  }

  footer.style.display = 'block';
}

function formatDate(date) {
  return date.toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusClass(date) {
  const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);

  if (hoursAgo < 2) return 'status-fresh';
  if (hoursAgo < 6) return 'status-warning';
  return 'status-danger';
}

async function refresh() {
  console.log('Refreshing data...');
  try {
    await fetchAllData();
    await fetchSystemStatus();
    buildTable();
  } catch (error) {
    console.error('Refresh failed:', error);
  }
}

function showTable() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('table-container').style.display = 'block';
}

function showError(message) {
  document.getElementById('loading').style.display = 'none';
  const errorEl = document.getElementById('error');
  errorEl.querySelector('p').textContent = message;
  errorEl.style.display = 'block';
}

// Start the app
init();
