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
    this.uploadedImages = new Set(); // blob URLs that have been uploaded or are uploading
    this.currentBatchHasError = false; // Track if any error occurred in current batch
    this.resultBadgeTimeout = null; // Timer ID for hiding result badge
    // Store button reference for badge updates
    this.currentButton = null;
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
    button.className = 'sc-2f2fb315-2 sc-2b71468b-1 kKotZl bzOrRh soeji-upload-btn';
    button.innerHTML = this.getIcon('upload');
    button.title = 'Upload to Soeji';
    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleUpload(imgElement, button);
    };

    // Create progress badge (top-right)
    const progressBadge = document.createElement('span');
    progressBadge.className = 'soeji-badge soeji-badge-hidden';
    button.appendChild(progressBadge);

    // Create queue count badge (bottom-right)
    const queueBadge = document.createElement('span');
    queueBadge.className = 'soeji-queue-badge soeji-queue-badge-hidden';
    button.appendChild(queueBadge);

    wrapper.appendChild(button);

    // Store button reference for badge updates
    this.currentButton = button;

    // Set initial opacity based on whether image is already uploaded
    this.updateButtonOpacity(button, imgElement);

    // Watch for image src changes to update button state
    const imgObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'src') {
          this.updateButtonState(button, imgElement);
        }
      }
    });
    imgObserver.observe(imgElement, { attributes: true, attributeFilter: ['src'] });

    // Watch for streaming image sibling changes (generation start/complete)
    const parent = imgElement.parentElement;
    if (parent) {
      const siblingObserver = new MutationObserver(() => {
        this.updateButtonState(button, imgElement);
      });
      siblingObserver.observe(parent, { childList: true });
    }

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

  getIcon(type) {
    const icons = {
      upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      loading: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="soeji-spin"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
      success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      duplicate: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    };
    return icons[type] || icons.upload;
  }

  isStreamingImage(imgElement) {
    // Check if .image-grid-streaming-image exists as a sibling element
    // This indicates the image is still being generated
    const parent = imgElement.parentElement;
    if (!parent) return false;
    return parent.querySelector('img.image-grid-streaming-image') !== null;
  }

  updateButtonState(button, imgElement) {
    // Check if image is still being generated (streaming)
    if (this.isStreamingImage(imgElement)) {
      button.disabled = true;
      button.classList.add('soeji-disabled');
      button.title = 'Image is generating...';
    } else {
      button.disabled = false;
      button.classList.remove('soeji-disabled');
      button.title = 'Upload to Soeji';

      // Update uploaded state
      const src = imgElement.src;
      if (this.uploadedImages.has(src)) {
        button.classList.add('soeji-uploaded');
      } else {
        button.classList.remove('soeji-uploaded');
      }
    }
  }

  updateButtonOpacity(button, imgElement) {
    // Delegate to updateButtonState for unified handling
    this.updateButtonState(button, imgElement);
  }

  updateBadges() {
    if (!this.currentButton) return;

    const progressBadge = this.currentButton.querySelector('.soeji-badge');
    const queueBadge = this.currentButton.querySelector('.soeji-queue-badge');

    if (!progressBadge || !queueBadge) return;

    const uploadingCount = this.uploadQueue.filter(i => i.status === 'uploading').length;
    const pendingCount = this.uploadQueue.filter(i => i.status === 'pending').length;
    const totalActive = uploadingCount + pendingCount;

    // Update queue count badge (bottom-right)
    if (totalActive > 0) {
      queueBadge.textContent = totalActive.toString();
      queueBadge.classList.remove('soeji-queue-badge-hidden');
    } else {
      queueBadge.classList.add('soeji-queue-badge-hidden');
    }

    // Update progress badge (top-right) - show spinner if uploading
    if (uploadingCount > 0 || pendingCount > 0) {
      // Clear any pending result badge timeout
      if (this.resultBadgeTimeout) {
        clearTimeout(this.resultBadgeTimeout);
        this.resultBadgeTimeout = null;
      }
      this.showProgressBadge(progressBadge, 'uploading');
    }
  }

  showProgressBadge(badge, state) {
    // Remove all state classes
    badge.classList.remove('soeji-badge-hidden', 'soeji-badge-uploading', 'soeji-badge-success', 'soeji-badge-error');

    if (state === 'uploading') {
      badge.classList.add('soeji-badge-uploading');
      // Clear text and add spinner
      badge.textContent = '';
      const spinner = document.createElement('span');
      spinner.className = 'soeji-spinner';
      badge.appendChild(spinner);
    } else if (state === 'success') {
      badge.classList.add('soeji-badge-success');
      badge.textContent = '✓';
    } else if (state === 'error') {
      badge.classList.add('soeji-badge-error');
      badge.textContent = '!';
    } else {
      badge.classList.add('soeji-badge-hidden');
      badge.textContent = '';
    }
  }

  showResultStatus() {
    if (!this.currentButton) return;

    const progressBadge = this.currentButton.querySelector('.soeji-badge');
    if (!progressBadge) return;

    // Show result based on whether there were errors
    if (this.currentBatchHasError) {
      this.showProgressBadge(progressBadge, 'error');
      this.currentButton.title = 'Some uploads failed';
    } else {
      this.showProgressBadge(progressBadge, 'success');
      this.currentButton.title = 'All uploads completed';
    }

    // Reset error flag for next batch
    this.currentBatchHasError = false;

    // Hide badge after 3 seconds
    this.resultBadgeTimeout = setTimeout(() => {
      this.showProgressBadge(progressBadge, 'hidden');
      this.currentButton.title = 'Upload to Soeji';
      this.resultBadgeTimeout = null;
    }, 3000);
  }

  async handleUpload(imgElement, button) {
    // Skip streaming images (still being generated)
    if (this.isStreamingImage(imgElement)) {
      console.log('[Soeji] Skipping streaming image');
      return;
    }

    const blobUrl = imgElement.src;

    // Check if this image is already in the queue (uploading or pending)
    const isInQueue = this.uploadQueue.some(item => item.blobUrl === blobUrl);
    if (isInQueue) {
      console.log('[Soeji] Image already in queue:', blobUrl);
      return;
    }

    // Add to uploaded images set and update button opacity
    this.uploadedImages.add(blobUrl);
    this.updateButtonOpacity(button, imgElement);

    // Create queue item
    const queueItem = {
      id: crypto.randomUUID(),
      blobUrl: blobUrl,
      status: 'pending'
    };

    // Add to queue
    this.uploadQueue.push(queueItem);
    console.log('[Soeji] Added to queue:', queueItem.id, 'Queue length:', this.uploadQueue.length);

    // Update badges and process queue
    this.updateBadges();
    this.processQueue();
  }

  processQueue() {
    // Find a pending item to process
    const pendingItem = this.uploadQueue.find(item => item.status === 'pending');
    if (!pendingItem) {
      return;
    }

    // Check if we already have an uploading item (process one at a time for simplicity)
    const uploadingItem = this.uploadQueue.find(item => item.status === 'uploading');
    if (uploadingItem) {
      return;
    }

    // Start uploading
    pendingItem.status = 'uploading';
    this.updateBadges();
    this.executeUpload(pendingItem);
  }

  async executeUpload(item) {
    try {
      // Extract image blob from blob URL
      const blob = await this.extractImageBlob(item.blobUrl);

      // Upload directly to backend (CORS is configured on backend)
      const result = await this.uploadToBackend(blob);

      if (result.success) {
        if (result.duplicate) {
          item.status = 'duplicate';
          console.log('[Soeji] Duplicate:', item.id);
        } else {
          item.status = 'success';
          console.log('[Soeji] Success:', item.id);
        }
      } else {
        item.status = 'error';
        this.currentBatchHasError = true;
        // Remove from uploadedImages so user can retry
        this.uploadedImages.delete(item.blobUrl);
        this.updateButtonOpacity(this.currentButton, { src: item.blobUrl });
        console.log('[Soeji] Error:', item.id, result.error);
      }
    } catch (error) {
      console.error('[Soeji] Upload error:', error);
      item.status = 'error';
      this.currentBatchHasError = true;
      // Remove from uploadedImages so user can retry
      this.uploadedImages.delete(item.blobUrl);
      this.updateButtonOpacity(this.currentButton, { src: item.blobUrl });
    }

    // Remove completed item from queue
    const index = this.uploadQueue.findIndex(i => i.id === item.id);
    if (index !== -1) {
      this.uploadQueue.splice(index, 1);
    }

    // Update badges
    this.updateBadges();

    // Check if queue is empty
    const hasActiveItems = this.uploadQueue.some(i => i.status === 'uploading' || i.status === 'pending');
    if (!hasActiveItems) {
      // Queue is complete, show result status
      this.showResultStatus();
    } else {
      // Process next item
      this.processQueue();
    }
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

  async extractImageBlob(blobUrl) {
    if (blobUrl.startsWith('blob:')) {
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

    throw new Error('Could not extract image data (not a blob URL)');
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
