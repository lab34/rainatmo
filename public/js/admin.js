const API_BASE = window.location.origin;

// Get admin credentials from prompt
const credentials = prompt('Identifiants admin (username:password):');
if (!credentials) {
  alert('Authentification requise');
  window.location.href = '/';
}

const authHeader = 'Basic ' + btoa(credentials);

async function fetchStatus() {
  try {
    const response = await fetch(`${API_BASE}/admin/status`, {
      headers: { Authorization: authHeader },
    });

    if (response.status === 401) {
      alert('Identifiants incorrects');
      window.location.href = '/';
      return;
    }

    const result = await response.json();

    if (result.success) {
      displayStatus(result.data);
    }
  } catch (error) {
    console.error('Error fetching status:', error);
  }
}

function displayStatus(data) {
  const statusEl = document.getElementById('status');

  const tokenStatus = data.token;
  const expiresAt = tokenStatus.expires_at
    ? new Date(tokenStatus.expires_at).toLocaleString('fr-FR')
    : 'N/A';
  const expiresIn = tokenStatus.expires_in_seconds
    ? Math.floor(tokenStatus.expires_in_seconds / 60) + ' minutes'
    : 'N/A';
  const isExpired = tokenStatus.is_expired ? '❌ Expiré' : '✅ Valide';

  let html = `
    <p><strong>Token Status:</strong> ${isExpired}</p>
    <p><strong>Expire le:</strong> ${expiresAt}</p>
    <p><strong>Expire dans:</strong> ${expiresIn}</p>
  `;

  // System status
  const systemStatus = data.system;
  if (systemStatus && systemStatus.length > 0) {
    html += '<hr style="margin: 16px 0;">';
    html += '<p><strong>Système:</strong></p>';
    systemStatus.forEach((status) => {
      const date = new Date(status.updated_at).toLocaleString('fr-FR');
      html += `<p>• ${status.key}: ${date}</p>`;
    });
  }

  statusEl.innerHTML = html;
}

document.getElementById('token-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  const messageEl = document.getElementById('message');

  const accessToken = document.getElementById('access_token').value.trim();
  const refreshToken = document.getElementById('refresh_token').value.trim();

  submitBtn.disabled = true;
  submitBtn.textContent = 'Test en cours...';
  messageEl.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/admin/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    });

    const result = await response.json();

    if (result.success) {
      messageEl.className = 'alert alert-success';
      messageEl.textContent = '✅ ' + result.message;
      messageEl.style.display = 'block';

      // Refresh status
      setTimeout(() => {
        fetchStatus();
      }, 1000);
    } else {
      messageEl.className = 'alert alert-error';
      messageEl.textContent = '❌ ' + result.error;
      messageEl.style.display = 'block';
    }
  } catch (error) {
    messageEl.className = 'alert alert-error';
    messageEl.textContent = '❌ Erreur: ' + error.message;
    messageEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Tester et sauvegarder';
  }
});

// Initial load
fetchStatus();
