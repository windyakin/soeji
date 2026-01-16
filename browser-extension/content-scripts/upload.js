// Content script for NAI - Soeji Uploader

// Use browser API if available (Firefox), otherwise chrome (Chrome)
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

class SoejiUploader {
  constructor() {
    this.observer = null;
    this.processTimeout = null;
    this.config = null;
    // Upload queue management
    this.uploadQueue = [];
    this.activeUploads = 0;
    this.maxConcurrentUploads = 3;
    // Track uploaded/uploading images by blob URL (memory only)
    this.uploadedImages = new Set();
    // Track if current batch has any errors (for result badge display)
    this.currentBatchHasError = false;
    // Timer ID for hiding result badge
    this.resultBadgeTimeout = null;
    this.init();
  }

  async init() {
    console.log('[Soeji] Content script loaded');

    // Get configuration from background script
    await this.loadConfig();

    // Listen for configuration changes from popup
    browserAPI.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        this.handleConfigChange(changes);
      }
    });

    if (!this.config) {
      console.log('[Soeji] Extension not configured. Click the extension icon to set up.');
      return;
    }

    console.log('[Soeji] Extension initialized');

    // Process existing images
    this.processImages();

    // Watch for new images (NAI uses dynamic rendering)
    this.startObserver();
  }

  async loadConfig() {
    const response = await this.sendMessage({ type: 'GET_CONFIG' });
    console.log('[Soeji] Configuration:', response);

    if (response.configured) {
      this.config = {
        backendUrl: response.backendUrl,
        apiKey: response.apiKey
      };
    } else {
      this.config = null;
    }
  }

  handleConfigChange(changes) {
    console.log('[Soeji] Configuration changed:', changes);

    // Update config with changed values
    if (changes.backendUrl) {
      if (!this.config) {
        this.config = { backendUrl: '', apiKey: '' };
      }
      this.config.backendUrl = changes.backendUrl.newValue || '';
    }
    if (changes.apiKey) {
      if (!this.config) {
        this.config = { backendUrl: '', apiKey: '' };
      }
      this.config.apiKey = changes.apiKey.newValue || '';
    }

    // If config was previously null and now has backendUrl, initialize
    if (this.config && this.config.backendUrl && !this.observer) {
      console.log('[Soeji] Configuration updated, starting observer');
      this.processImages();
      this.startObserver();
    }
  }

  async sendMessage(message) {
    try {
      // Chrome MV3 and Firefox both support promise-based sendMessage
      const response = await browserAPI.runtime.sendMessage(message);
      return response || {};
    } catch (error) {
      console.error('[Soeji] Message error:', error);
      return {};
    }
  }

  processImages() {
    const images = document.querySelectorAll('img.image-grid-image:not([data-soeji-processed])');
    console.log('[Soeji] Found images:', images.length);
    images.forEach((img) => this.injectButton(img));
  }

  startObserver() {
    this.observer = new MutationObserver((mutations) => {
      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }
      if (hasNewNodes) {
        // Debounce to avoid excessive processing
        clearTimeout(this.processTimeout);
        this.processTimeout = setTimeout(() => this.processImages(), 100);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  injectButton(imgElement) {
    imgElement.setAttribute('data-soeji-processed', 'true');

    // Find the button container by looking for sibling elements with buttons
    const container = this.findButtonContainer(imgElement);
    console.log('[Soeji] Found container:', container);
    if (!container) {
      console.log('[Soeji] Could not find button container for image');
      return;
    }

    // Check if already injected in this container
    if (container.querySelector('.soeji-button-wrapper')) {
      return;
    }

    // Create a wrapper div to match NAI's structure
    // NAI uses: <div class="sc-1f65f26d-0" data-projection-id="..." style="height: 100%;">
    const wrapper = document.createElement('div');
    wrapper.style.height = '100%';
    wrapper.className = 'soeji-button-wrapper';

    // Create upload button matching NAI's button style
    const button = document.createElement('button');
    // Use NAI's button classes for consistent styling
    // Icon is rendered via CSS ::before pseudo-element (Base64 SVG)
    button.className = 'sc-2f2fb315-2 sc-2b71468b-1 kKotZl bzOrRh soeji-upload-btn';
    button.title = 'Upload to Soeji';
    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleUpload(imgElement, button);
    };

    // Create status badge (top-right)
    const badge = document.createElement('span');
    badge.className = 'soeji-badge soeji-badge-hidden';
    button.appendChild(badge);

    // Create queue count badge (bottom-right)
    const queueBadge = document.createElement('span');
    queueBadge.className = 'soeji-queue-badge soeji-queue-badge-hidden';
    button.appendChild(queueBadge);

    // Check if this image was already uploaded in this session
    this.updateUploadedState(imgElement, button);

    // Watch for src changes on the image element
    const srcObserver = new MutationObserver(() => {
      this.updateUploadedState(imgElement, button);
    });
    srcObserver.observe(imgElement, { attributes: true, attributeFilter: ['src'] });

    wrapper.appendChild(button);

    // Insert before the seed button (the last button without data-projection-id wrapper)
    // Structure: div.sc-2b71468b-0 > [div[data-projection-id] x 3] > button (seed)
    const seedButton = container.querySelector(':scope > button');
    if (seedButton) {
      container.insertBefore(wrapper, seedButton);
    } else {
      container.appendChild(wrapper);
    }
  }

  findButtonContainer(imgElement) {
    // NAI DOM structure (inside .display-grid-bottom):
    // <div style="display: flex; flex-direction: row; gap: 10px;">
    //   <div class="sc-2b71468b-0">  <-- This is the button container we want
    //     <div data-projection-id="9" style="height: 100%;"><button>...</button></div>
    //     <div data-projection-id="10" style="height: 100%;"><button>...</button></div>
    //     <div data-projection-id="11" style="height: 100%;"><button>...</button></div>
    //     <button>Seed button (with span[style*="visibility"])</button>
    //   </div>
    // </div>

    let current = imgElement.parentElement;
    let attempts = 0;
    const maxAttempts = 25;

    while (current && attempts < maxAttempts) {
      // Look for .display-grid-bottom which contains the button area
      const displayGridBottom = current.querySelector('.display-grid-bottom');
      if (displayGridBottom) {
        // Find the container with flex-direction: row that has data-projection-id buttons
        const rowContainer = displayGridBottom.querySelector('div[style*="flex-direction: row"]');
        if (rowContainer) {
          // Find the div that contains both data-projection-id divs and a seed button
          const buttonContainer = rowContainer.querySelector('div[class*="sc-2b71468b-0"]');
          if (buttonContainer) {
            // Verify it has the seed button (span with visibility style)
            const seedSpan = buttonContainer.querySelector('button span[style*="visibility"]');
            if (seedSpan) {
              return buttonContainer;
            }
          }
        }
      }

      current = current.parentElement;
      attempts++;
    }

    return null;
  }

  updateUploadedState(imgElement, button) {
    const blobUrl = imgElement.src;
    if (this.uploadedImages.has(blobUrl)) {
      button.classList.add('soeji-uploaded');
    } else {
      button.classList.remove('soeji-uploaded');
    }
  }

  async handleUpload(imgElement, button) {
    const blobUrl = imgElement.src;

    // Check if this image is already queued or uploaded
    if (this.uploadedImages.has(blobUrl)) {
      return; // Already in queue or uploaded
    }

    // If starting a new batch (queue was empty), reset error flag and cancel result badge timer
    if (this.uploadQueue.length === 0 && this.activeUploads === 0) {
      this.currentBatchHasError = false;
      if (this.resultBadgeTimeout) {
        clearTimeout(this.resultBadgeTimeout);
        this.resultBadgeTimeout = null;
      }
    }

    // Track this image as uploading/uploaded
    this.uploadedImages.add(blobUrl);
    this.updateUploadedState(imgElement, button);

    // Add to queue with blob URL (not element reference)
    this.uploadQueue.push({ blobUrl });
    this.updateQueueBadge();

    // Process queue
    this.processQueue();
  }

  processQueue() {
    while (this.activeUploads < this.maxConcurrentUploads && this.uploadQueue.length > 0) {
      const item = this.uploadQueue.shift();
      this.activeUploads++;
      this.updateQueueBadge();
      this.executeUpload(item.blobUrl);
    }
  }

  async executeUpload(blobUrl) {
    let isError = true;
    try {
      // Extract image blob from blob URL
      const blob = await this.extractImageBlobFromUrl(blobUrl);

      // Upload directly to backend (CORS is configured on backend)
      const result = await this.uploadToBackend(blob);

      if (result.success) {
        // Duplicate is treated as error
        isError = result.duplicate;
        console.log('[Soeji] Upload success:', blobUrl, result.duplicate ? '(duplicate)' : '');
      } else {
        console.error('[Soeji] Upload failed:', blobUrl, result.error);
      }
    } catch (error) {
      console.error('[Soeji] Upload error:', blobUrl, error);
    }

    // Track error for batch result
    if (isError) {
      this.currentBatchHasError = true;
    }

    // Process next
    this.activeUploads--;
    this.updateQueueBadge();
    this.processQueue();

    // Show result status on all buttons (only when queue is empty)
    if (this.activeUploads === 0 && this.uploadQueue.length === 0) {
      const status = this.currentBatchHasError ? 'error' : 'success';
      this.showResultStatus(status);
    }
  }

  showResultStatus(status) {
    // Cancel any existing result badge timer
    if (this.resultBadgeTimeout) {
      clearTimeout(this.resultBadgeTimeout);
      this.resultBadgeTimeout = null;
    }

    const allButtons = document.querySelectorAll('.soeji-upload-btn');
    allButtons.forEach((button) => {
      const badge = button.querySelector('.soeji-badge');
      if (badge) {
        // Clear previous state
        badge.classList.remove('soeji-badge-hidden', 'soeji-badge-queued', 'soeji-badge-uploading', 'soeji-badge-success', 'soeji-badge-error');
        badge.textContent = '';

        // Remove existing spinner if any
        const existingSpinner = badge.querySelector('.soeji-spinner');
        if (existingSpinner) {
          existingSpinner.remove();
        }

        // Set result state (icon is shown via CSS ::before)
        badge.classList.add(`soeji-badge-${status}`);
      }
    });

    // Hide after 3 seconds
    this.resultBadgeTimeout = setTimeout(() => {
      allButtons.forEach((button) => {
        const badge = button.querySelector('.soeji-badge');
        if (badge) {
          badge.classList.remove(`soeji-badge-${status}`);
          badge.classList.add('soeji-badge-hidden');
        }
      });
      this.resultBadgeTimeout = null;
    }, 3000);
  }

  updateQueueBadge() {
    const totalPending = this.uploadQueue.length + this.activeUploads;

    // Update all buttons with global status
    const allButtons = document.querySelectorAll('.soeji-upload-btn');
    allButtons.forEach((button) => {
      // Update queue count badge (bottom-right)
      const queueBadge = button.querySelector('.soeji-queue-badge');
      if (queueBadge) {
        if (totalPending > 0) {
          queueBadge.textContent = totalPending;
          queueBadge.classList.remove('soeji-queue-badge-hidden');
        } else {
          queueBadge.classList.add('soeji-queue-badge-hidden');
          queueBadge.textContent = '';
        }
      }

      // Update status badge (top-right) based on global state
      const badge = button.querySelector('.soeji-badge');
      if (badge) {
        badge.classList.remove('soeji-badge-hidden', 'soeji-badge-queued', 'soeji-badge-uploading', 'soeji-badge-success', 'soeji-badge-error');

        // Remove existing spinner if any
        const existingSpinner = badge.querySelector('.soeji-spinner');
        if (existingSpinner) {
          existingSpinner.remove();
        }

        if (this.activeUploads > 0) {
          // Uploading - add spinner element
          badge.classList.add('soeji-badge-uploading');
          badge.textContent = '';
          const spinner = document.createElement('span');
          spinner.className = 'soeji-spinner';
          badge.appendChild(spinner);
        } else if (this.uploadQueue.length > 0) {
          // Queued but not uploading yet
          badge.classList.add('soeji-badge-queued');
          badge.textContent = '…';
        } else {
          // Idle
          badge.classList.add('soeji-badge-hidden');
          badge.textContent = '';
        }
      }
    });
  }

  async uploadToBackend(blob) {
    const formData = new FormData();
    formData.append('file', blob, this.generateFilename());

    const headers = {};
    if (this.config.apiKey) {
      headers['X-Watcher-Key'] = this.config.apiKey;
    }

    const response = await fetch(`${this.config.backendUrl}/api/upload`, {
      method: 'POST',
      headers,
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }

    return {
      success: true,
      duplicate: result.duplicate || false,
      image: result.image || result.existingImage
    };
  }

  async extractImageBlobFromUrl(blobUrl) {
    if (!blobUrl.startsWith('blob:')) {
      throw new Error('Could not extract image data (not a blob URL)');
    }

    const response = await fetch(blobUrl);
    const blob = await response.blob();

    // Verify it's a PNG
    const arrayBuffer = await blob.slice(0, 8).arrayBuffer();
    const signature = new Uint8Array(arrayBuffer);
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const isPng = pngSignature.every((byte, i) => signature[i] === byte);

    if (!isPng) {
      throw new Error('Not a PNG file');
    }

    return blob;
  }

  generateFilename() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `NAI_${timestamp}.png`;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SoejiUploader());
} else {
  new SoejiUploader();
}
