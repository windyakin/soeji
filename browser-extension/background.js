// Background service worker for Soeji Uploader

// Use browser API if available (Firefox), otherwise chrome (Chrome)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Helper to get storage (handles both Promise and callback APIs)
function getStorage(keys) {
  return new Promise((resolve, reject) => {
    try {
      const result = browserAPI.storage.local.get(keys, (data) => {
        if (browserAPI.runtime.lastError) {
          reject(browserAPI.runtime.lastError);
        } else {
          resolve(data);
        }
      });
      // If it returns a promise (Firefox), use it
      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Soeji Background] Received message:', message.type);

  if (message.type === 'GET_CONFIG') {
    getConfiguration()
      .then((result) => {
        console.log('[Soeji Background] Config result:', result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error('[Soeji Background] Config error:', error);
        sendResponse({ configured: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  // Unknown message type
  console.log('[Soeji Background] Unknown message type:', message.type);
  return false;
});

async function getConfiguration() {
  try {
    const settings = await getStorage(['backendUrl', 'apiKey']);
    console.log('[Soeji Background] Storage contents:', settings);

    if (!settings.backendUrl) {
      return { configured: false };
    }

    return {
      configured: true,
      backendUrl: settings.backendUrl,
      apiKey: settings.apiKey || ''
    };
  } catch (error) {
    console.error('[Soeji Background] Storage error:', error);
    return { configured: false };
  }
}
