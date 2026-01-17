// Use browser API if available (Firefox), otherwise chrome (Chrome)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const backendUrlInput = document.getElementById('backendUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const testBtn = document.getElementById('test-btn');
  const statusDiv = document.getElementById('status');
  const toggleApiKeyBtn = document.getElementById('toggle-apikey');
  const clearApiKeyBtn = document.getElementById('clear-apikey');
  const eyeIcon = document.getElementById('eye-icon');
  const eyeOffIcon = document.getElementById('eye-off-icon');

  // Load saved settings
  const settings = await browserAPI.storage.local.get({
    backendUrl: '',
    apiKey: ''
  });

  backendUrlInput.value = settings.backendUrl;

  // Update API Key field state based on saved value
  updateApiKeyFieldState(settings.apiKey);

  // Show status message
  function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.classList.remove('hidden');
  }

  // Hide status message
  function hideStatus() {
    statusDiv.classList.add('hidden');
  }

  // Update API Key field state (locked/unlocked)
  function updateApiKeyFieldState(savedApiKey) {
    if (savedApiKey) {
      // API Key is saved - lock the field and show clear button
      apiKeyInput.value = '••••••••••••••••';
      apiKeyInput.disabled = true;
      apiKeyInput.type = 'password';
      toggleApiKeyBtn.style.display = 'none';
      clearApiKeyBtn.style.display = 'flex';
    } else {
      // No API Key saved - show editable field with toggle button
      apiKeyInput.value = '';
      apiKeyInput.disabled = false;
      apiKeyInput.type = 'password';
      apiKeyInput.classList.remove('apikey-visible');
      toggleApiKeyBtn.style.display = 'flex';
      clearApiKeyBtn.style.display = 'none';
      eyeIcon.style.display = 'block';
      eyeOffIcon.style.display = 'none';
    }
  }

  // Save settings
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const backendUrl = backendUrlInput.value.trim().replace(/\/$/, '');
    // Only get apiKey from input if it's not disabled (not already saved)
    const apiKey = apiKeyInput.disabled ? null : apiKeyInput.value.trim();

    if (!backendUrl) {
      showStatus('Please enter Backend URL', 'error');
      return;
    }

    try {
      // Only update apiKey if it was changed (not disabled)
      if (apiKey !== null) {
        await browserAPI.storage.local.set({ backendUrl, apiKey });
        updateApiKeyFieldState(apiKey);
      } else {
        await browserAPI.storage.local.set({ backendUrl });
      }
      showStatus('Settings saved!', 'success');
      setTimeout(hideStatus, 2000);
    } catch (error) {
      showStatus('Failed to save settings', 'error');
    }
  });

  // Toggle API Key visibility (only when not saved)
  toggleApiKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    if (isPassword) {
      apiKeyInput.classList.add('apikey-visible');
    } else {
      apiKeyInput.classList.remove('apikey-visible');
    }
    eyeIcon.style.display = isPassword ? 'none' : 'block';
    eyeOffIcon.style.display = isPassword ? 'block' : 'none';
  });

  // Clear API Key
  clearApiKeyBtn.addEventListener('click', async () => {
    try {
      await browserAPI.storage.local.set({ apiKey: '' });
      updateApiKeyFieldState('');
      showStatus('API Key cleared', 'success');
      setTimeout(hideStatus, 2000);
    } catch (error) {
      showStatus('Failed to clear API Key', 'error');
    }
  });

  // Test connection
  testBtn.addEventListener('click', async () => {
    const backendUrl = backendUrlInput.value.trim().replace(/\/$/, '');

    if (!backendUrl) {
      showStatus('Please enter Backend URL first', 'error');
      return;
    }

    showStatus('Testing connection...', 'info');
    testBtn.disabled = true;

    try {
      // Get API key: if field is disabled, use saved value; otherwise use input value
      let apiKey;
      if (apiKeyInput.disabled) {
        // Field is locked - use saved value
        const savedSettings = await browserAPI.storage.local.get({ apiKey: '' });
        apiKey = savedSettings.apiKey;
      } else {
        // Field is editable - use current input value
        apiKey = apiKeyInput.value.trim();
      }

      // Test authentication with /api/upload/test endpoint
      const headers = {};
      if (apiKey) {
        headers['X-Watcher-Key'] = apiKey;
      }

      const response = await fetch(`${backendUrl}/api/upload/test`, {
        method: 'GET',
        headers
      });

      if (response.ok) {
        showStatus('Connected! API Key is valid.', 'success');
      } else if (response.status === 401) {
        showStatus('Invalid API Key or authentication required.', 'error');
      } else {
        showStatus(`Server error: ${response.status}`, 'error');
      }
    } catch (error) {
      showStatus('Could not connect to server', 'error');
    } finally {
      testBtn.disabled = false;
    }
  });
});
