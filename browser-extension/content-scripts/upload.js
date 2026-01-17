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
    this.currentBatchHasError = false; // Track if any error occurred in current batch
    this.resultBadgeTimeout = null; // Timer ID for hiding result badge
    // Store button reference for badge updates
    this.currentButton = null;
    // History item tracking - Map-based centralized management
    // Key: blob URL, Value: { status, index }
    // - status: 'pending'|'uploading'|'success'|'duplicate'|'error'|'hidden'
    // - index: DOM index (0 = newest/top)
    this.history = new Map();
    this.historyBadgeTimeouts = new Map(); // blob URL -> timeout ID (for auto-hide)
    this.historyObserver = null; // MutationObserver for history container (for index shift)
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

    // Watch for history container changes (for badge re-sync when new items added)
    this.startHistoryObserver();
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

  startHistoryObserver() {
    // Watch for changes in the history container to shift indices when new items are added
    const checkAndObserve = () => {
      const historyContainer = document.getElementById('historyContainer');
      if (!historyContainer) {
        // Retry after a short delay if container not found yet
        setTimeout(checkAndObserve, 500);
        return;
      }

      const container = historyContainer.querySelector('.sc-5d63727e-2');
      if (!container) {
        setTimeout(checkAndObserve, 500);
        return;
      }

      // Store current item count
      let previousItemCount = container.querySelectorAll('.sc-5d63727e-28').length;

      this.historyObserver = new MutationObserver(() => {
        const currentItemCount = container.querySelectorAll('.sc-5d63727e-28').length;

        if (currentItemCount > previousItemCount) {
          // New items were added at the top (index 0)
          // Shift all existing indices by the number of new items
          const addedCount = currentItemCount - previousItemCount;
          this.shiftHistoryIndices(addedCount);
          console.log('[Soeji] History items added:', addedCount, 'Shifted indices');
          // Re-sync badges after addition
          this.syncHistoryBadges();
        } else if (currentItemCount < previousItemCount) {
          // Items were deleted - handle index adjustment using bgHash comparison
          console.log('[Soeji] History items deleted:', previousItemCount - currentItemCount);
          this.handleHistoryDeletion();
        } else {
          // Count unchanged but content may have changed - just re-sync
          this.syncHistoryBadges();
        }

        previousItemCount = currentItemCount;
      });

      this.historyObserver.observe(container, {
        childList: true
      });

      console.log('[Soeji] History observer started');
    };

    checkAndObserve();
  }

  shiftHistoryIndices(count) {
    // Shift all indices in history Map by count (new items added at top)
    for (const [blobUrl, data] of this.history) {
      data.index += count;
    }
  }

  handleHistoryDeletion() {
    // Handle deletion of history items by comparing bgHash
    const historyItems = this.getHistoryItems();
    const maxIndex = historyItems.length - 1;

    for (const [blobUrl, data] of this.history) {
      // If index exceeds DOM length, clamp to last element
      const checkIndex = Math.min(data.index, maxIndex);
      const domElement = historyItems[checkIndex];

      if (!domElement) {
        // No DOM elements at all - delete this entry
        console.log('[Soeji] History item deleted (no DOM element):', blobUrl);
        this.history.delete(blobUrl);
        const timeout = this.historyBadgeTimeouts.get(blobUrl);
        if (timeout) {
          clearTimeout(timeout);
          this.historyBadgeTimeouts.delete(blobUrl);
        }
        continue;
      }

      const currentBgHash = this.getBackgroundImageHash(domElement);

      if (currentBgHash === data.bgHash) {
        // Match found - update index if it was clamped
        if (checkIndex !== data.index) {
          console.log('[Soeji] Index adjusted for:', blobUrl, 'from', data.index, 'to', checkIndex);
          data.index = checkIndex;
        }
      } else {
        // bgHash mismatch - try shifting index down by 1
        const shiftedIndex = data.index - 1;
        if (shiftedIndex >= 0) {
          const shiftedElement = historyItems[shiftedIndex];
          const shiftedBgHash = shiftedElement ? this.getBackgroundImageHash(shiftedElement) : null;

          if (shiftedBgHash === data.bgHash) {
            // Found at shifted position
            console.log('[Soeji] Index shifted for:', blobUrl, 'from', data.index, 'to', shiftedIndex);
            data.index = shiftedIndex;
            continue;
          }
        }

        // Not found - this entry was deleted
        console.log('[Soeji] History item deleted (bgHash mismatch):', blobUrl);
        this.history.delete(blobUrl);
        const timeout = this.historyBadgeTimeouts.get(blobUrl);
        if (timeout) {
          clearTimeout(timeout);
          this.historyBadgeTimeouts.delete(blobUrl);
        }
      }
    }

    this.syncHistoryBadges();
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
    // Icon is rendered via CSS ::before pseudo-element (no innerHTML needed)
    button.className = 'sc-2f2fb315-2 sc-2b71468b-1 kKotZl bzOrRh soeji-upload-btn';
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

  isStreamingImage(imgElement) {
    // Check if .image-grid-streaming-image exists as a sibling element
    // This indicates the image is still being generated
    const parent = imgElement.parentElement;
    if (!parent) return false;
    return parent.querySelector('img.image-grid-streaming-image') !== null;
  }

  getHistoryItems() {
    // Get all history items from the container
    const historyContainer = document.getElementById('historyContainer');
    if (!historyContainer) return [];

    const container = historyContainer.querySelector('.sc-5d63727e-2');
    if (!container) return [];

    return Array.from(container.querySelectorAll('.sc-5d63727e-28'));
  }

  getSelectedHistoryIndex() {
    // Find the currently selected history item index
    // Returns the index if found, -1 otherwise
    const items = this.getHistoryItems();
    if (items.length === 0) return -1;

    // Find the selected item by checking border-color
    // Selected: rgb(245, 243, 194), Non-selected: transparent or rgba(0, 0, 0, 0)
    for (let i = 0; i < items.length; i++) {
      const computedStyle = window.getComputedStyle(items[i]);
      const borderColor = computedStyle.borderColor;
      const isSelected = borderColor !== 'transparent' &&
                         borderColor !== 'rgba(0, 0, 0, 0)';
      if (isSelected) {
        return i;
      }
    }
    return -1;
  }

  getBackgroundImageHash(element) {
    // Hash the entire background-image style (including base64 data)
    const style = window.getComputedStyle(element);
    const bgImage = style.backgroundImage;
    if (!bgImage || bgImage === 'none') return null;
    return this.hashString(bgImage);
  }

  hashString(str) {
    // djb2 hash algorithm - produces short, consistent hash
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    // Convert to unsigned 32-bit and then to hex string (8 chars)
    return (hash >>> 0).toString(16).padStart(8, '0');
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

      // Update uploaded state (check if in history map)
      const src = imgElement.src;
      if (this.history.has(src)) {
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

  // Sync history badges with current history Map state
  // Called whenever history state changes
  syncHistoryBadges() {
    const historyItems = this.getHistoryItems(); // DOM elements (0 = newest)
    if (!historyItems || historyItems.length === 0) return;

    // Build a reverse lookup: index -> data
    const indexToData = new Map();
    for (const [blobUrl, data] of this.history) {
      indexToData.set(data.index, { blobUrl, ...data });
    }

    // Clear all existing badges, set data-history-key, and manage delete button state
    historyItems.forEach((item, index) => {
      const existingBadge = item.querySelector('.soeji-history-badge');
      if (existingBadge) existingBadge.remove();

      const data = indexToData.get(index);
      const deleteBtn = item.querySelector('button[aria-label="delete image(s)"]');

      // Set data-history-key for debugging
      if (data) {
        const keyId = data.blobUrl.split('/').pop() || data.blobUrl;
        item.setAttribute('data-history-key', keyId);

        // Disable delete button while uploading/pending
        if (deleteBtn) {
          const isUploading = data.status === 'uploading' || data.status === 'pending';
          deleteBtn.disabled = isUploading;
          if (isUploading) {
            deleteBtn.style.opacity = '0.3';
            deleteBtn.style.pointerEvents = 'none';
          } else {
            deleteBtn.style.opacity = '';
            deleteBtn.style.pointerEvents = '';
          }
        }
      } else {
        item.setAttribute('data-history-key', `(none:${index})`);
        // Re-enable delete button for items not in history
        if (deleteBtn) {
          deleteBtn.disabled = false;
          deleteBtn.style.opacity = '';
          deleteBtn.style.pointerEvents = '';
        }
      }
    });

    // For each entry in history Map, create badge at the corresponding DOM index
    for (const [, data] of this.history) {
      if (data.status === 'hidden') continue;

      const historyElement = historyItems[data.index];
      if (!historyElement) continue;

      this.createHistoryBadge(historyElement, data.status);
    }
  }

  // Create a badge on a history element with the given state
  createHistoryBadge(historyElement, state) {
    // Ensure history element has position: relative for absolute positioning
    const computedStyle = window.getComputedStyle(historyElement);
    if (computedStyle.position === 'static') {
      historyElement.style.position = 'relative';
    }

    // Create new badge
    const badge = document.createElement('span');
    badge.className = 'soeji-history-badge';

    if (state === 'uploading' || state === 'pending') {
      badge.classList.add('soeji-history-badge-uploading');
      const spinner = document.createElement('span');
      spinner.className = 'soeji-spinner';
      badge.appendChild(spinner);
    } else if (state === 'success') {
      badge.classList.add('soeji-history-badge-success');
      badge.textContent = '✓';
    } else if (state === 'duplicate') {
      badge.classList.add('soeji-history-badge-duplicate');
      badge.textContent = '✓';
    } else if (state === 'error') {
      badge.classList.add('soeji-history-badge-error');
      badge.textContent = '!';
    } else {
      badge.classList.add('soeji-history-badge-hidden');
    }

    historyElement.appendChild(badge);
  }

  // Update history item status and sync badges
  updateHistoryStatus(blobUrl, status, index = null, bgHash = null) {
    // Clear any existing timeout for this blob
    const existingTimeout = this.historyBadgeTimeouts.get(blobUrl);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.historyBadgeTimeouts.delete(blobUrl);
    }

    // Get existing entry to preserve index and bgHash if not provided
    const existing = this.history.get(blobUrl);
    const finalIndex = index !== null ? index : (existing ? existing.index : 0);
    const finalBgHash = bgHash !== null ? bgHash : (existing ? existing.bgHash : null);

    // Update status in history Map (preserve index and bgHash)
    this.history.set(blobUrl, { status, index: finalIndex, bgHash: finalBgHash });

    // Sync badges
    this.syncHistoryBadges();

    // Set auto-hide timeout for success/duplicate
    if (status === 'success' || status === 'duplicate') {
      const timeout = setTimeout(() => {
        const current = this.history.get(blobUrl);
        if (current) {
          this.history.set(blobUrl, { status: 'hidden', index: current.index, bgHash: current.bgHash });
        }
        this.historyBadgeTimeouts.delete(blobUrl);
        this.syncHistoryBadges();
      }, 3000);
      this.historyBadgeTimeouts.set(blobUrl, timeout);
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

    // Get the currently selected history item index and its background-image hash
    const historyIndex = this.getSelectedHistoryIndex();
    const historyItems = this.getHistoryItems();
    const bgHash = historyIndex >= 0 && historyItems[historyIndex]
      ? this.getBackgroundImageHash(historyItems[historyIndex])
      : null;
    console.log('[Soeji] Selected history index:', historyIndex, 'bgHash:', bgHash);

    // Add to history map with pending status, index, and bgHash, update button opacity
    this.updateHistoryStatus(blobUrl, 'pending', historyIndex, bgHash);
    this.updateButtonOpacity(button, imgElement);

    // Create queue item (no historyIndex - use blobUrl to reference history)
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
    // Update history status to uploading
    this.updateHistoryStatus(item.blobUrl, 'uploading');

    try {
      // Extract image blob from blob URL
      const blob = await this.extractImageBlob(item.blobUrl);

      // Upload directly to backend (CORS is configured on backend)
      const result = await this.uploadToBackend(blob);

      if (result.success) {
        if (result.duplicate) {
          item.status = 'duplicate';
          console.log('[Soeji] Duplicate:', item.id);
          // Update history status to duplicate
          this.updateHistoryStatus(item.blobUrl, 'duplicate');
        } else {
          item.status = 'success';
          console.log('[Soeji] Success:', item.id);
          // Update history status to success
          this.updateHistoryStatus(item.blobUrl, 'success');
        }
      } else {
        item.status = 'error';
        this.currentBatchHasError = true;
        // Update history status to error (keep badge visible for retry)
        this.updateHistoryStatus(item.blobUrl, 'error');
        console.log('[Soeji] Error:', item.id, result.error);
      }
    } catch (error) {
      console.error('[Soeji] Upload error:', error);
      item.status = 'error';
      this.currentBatchHasError = true;
      // Update history status to error (keep badge visible for retry)
      this.updateHistoryStatus(item.blobUrl, 'error');
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
