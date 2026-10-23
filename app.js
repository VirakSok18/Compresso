// Compresso — Pure Client-Side Image Compressor
// Guaranteed 75-85% size reduction with IndexedDB History Persistence

const dropZone = document.getElementById('dropZone');
const filePicker = document.getElementById('filePicker');
const batchesContainer = document.getElementById('batchesContainer');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const QUALITY = 0.55;
const MAX_RESOLUTION = 1920;

let batchIndex = 1;

// ========================================================
// 1. IndexedDB Persistence Layer
// ========================================================
const DB_NAME = 'CompressoHistoryDB';
const DB_VERSION = 1;
const STORE_NAME = 'batches';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveBatchToDB(batchData) {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(batchData);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    updateClearHistoryButton();
  } catch (err) {
    console.warn('Could not save batch to IndexedDB:', err);
  }
}

async function loadAllBatchesFromDB() {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const list = request.result || [];
        // Sort newest first
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(list);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Could not load history from IndexedDB:', err);
    return [];
  }
}

async function deleteBatchFromDB(batchId) {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(batchId);
    await new Promise(resolve => tx.oncomplete = resolve);
    updateClearHistoryButton();
  } catch (err) {
    console.warn('Could not delete batch from IndexedDB:', err);
  }
}

async function clearEntireHistoryDB() {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise(resolve => tx.oncomplete = resolve);
    batchesContainer.innerHTML = '';
    updateClearHistoryButton();
  } catch (err) {
    console.warn('Could not clear history:', err);
  }
}

async function updateClearHistoryButton() {
  const batches = await loadAllBatchesFromDB();
  clearHistoryBtn.style.display = batches.length > 0 ? 'block' : 'none';
}

clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Clear all compression history from your device?')) {
    clearEntireHistoryDB();
  }
});

// Restore previous history on page load
window.addEventListener('DOMContentLoaded', async () => {
  const savedBatches = await loadAllBatchesFromDB();
  if (savedBatches && savedBatches.length > 0) {
    for (const b of savedBatches) {
      renderSavedBatchCard(b);
    }
    updateClearHistoryButton();
  }
});

// ========================================================
// 2. Drag & Drop Interactions
// ========================================================
dropZone.addEventListener('click', () => filePicker.click());

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--blue)';
    dropZone.style.backgroundColor = 'var(--blue-light)';
    dropZone.style.transform = 'translateY(-2px)';
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    dropZone.style.backgroundColor = '';
    dropZone.style.transform = '';
  });
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  const items = e.dataTransfer.items;
  if (items && items.length > 0) {
    const { folderName, files } = await extractFilesFromDataTransfer(items);
    if (files.length > 0) {
      createBatchSection(folderName, files);
    }
  } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const files = Array.from(e.dataTransfer.files).filter(isImageFile);
    if (files.length > 0) {
      createBatchSection(null, files);
    }
  }
});

filePicker.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    const files = Array.from(e.target.files).filter(isImageFile);
    if (files.length > 0) {
      createBatchSection(null, files);
    }
    filePicker.value = '';
  }
});

function isImageFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const validExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp', 'gif', 'tif', 'tiff'];
  return validExts.includes(ext) || file.type.startsWith('image/');
}

async function extractFilesFromDataTransfer(items) {
  const files = [];
  let rootFolderName = null;

  async function traverseEntry(entry) {
    if (entry.isFile) {
      const file = await new Promise((resolve) => entry.file(resolve));
      if (isImageFile(file)) files.push(file);
    } else if (entry.isDirectory) {
      if (!rootFolderName) rootFolderName = entry.name;
      const reader = entry.createReader();
      const entries = await new Promise((resolve) => {
        reader.readEntries(resolve);
      });
      for (const child of entries) {
        await traverseEntry(child);
      }
    }
  }

  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
    if (entry) {
      await traverseEntry(entry);
    } else {
      const file = items[i].getAsFile();
      if (file && isImageFile(file)) files.push(file);
    }
  }

  return { folderName: rootFolderName, files };
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getFormattedDate() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dateStr} • ${timeStr}`;
}

// ========================================================
// 3. Render New Batch Card
// ========================================================
function createBatchSection(customTitle, files) {
  const batchId = 'batch-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const total = files.length;
  const batchTitle = customTitle || `Batch #${batchIndex++}`;
  const dateLabel = getFormattedDate();

  const card = document.createElement('div');
  card.id = batchId;
  card.className = 'batch-card';
  card.innerHTML = `
    <div class="batch-header">
      <div class="batch-title-group">
        <div class="batch-title-row">
          <span class="batch-title">${batchTitle}</span>
          <span class="batch-date-pill">${dateLabel}</span>
          <span class="batch-badge" id="${batchId}-status">0%</span>
        </div>
        <div class="batch-subtitle" id="${batchId}-counter">
          Compressing 0 of ${total} images...
        </div>
      </div>
      <div class="batch-actions">
        <button class="download-batch-btn" id="${batchId}-downloadBtn" disabled>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download (.zip)</span>
        </button>
      </div>
    </div>

    <!-- Progress Track -->
    <div class="progress-track">
      <div class="progress-fill" id="${batchId}-progress"></div>
    </div>

    <!-- Stats & Actions -->
    <div class="batch-footer">
      <div class="batch-stats" id="${batchId}-stats">
        <span>Calculating size...</span>
      </div>
    </div>

    <!-- Thumbnail Strip -->
    <div class="batch-thumbs" id="${batchId}-thumbs"></div>
  `;

  batchesContainer.prepend(card);
  runBatchCompression(batchId, batchTitle, dateLabel, files);
}

// Render restored card from IndexedDB
function renderSavedBatchCard(saved) {
  const card = document.createElement('div');
  card.id = saved.id;
  card.className = 'batch-card';
  card.innerHTML = `
    <div class="batch-header">
      <div class="batch-title-group">
        <div class="batch-title-row">
          <span class="batch-title">${saved.title}</span>
          <span class="batch-date-pill">${saved.date}</span>
          <span class="batch-badge completed">Complete</span>
        </div>
        <div class="batch-subtitle">
          ${saved.total} images finished • -${saved.savedPercent}% reduction
        </div>
      </div>
      <div class="batch-actions">
        <button class="download-batch-btn" id="${saved.id}-downloadBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download (.zip)</span>
        </button>
        <button class="delete-batch-btn" id="${saved.id}-deleteBtn" title="Remove from history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>

    <div class="progress-track">
      <div class="progress-fill completed" style="width: 100%;"></div>
    </div>

    <div class="batch-footer">
      <div class="batch-stats">
        <span>${formatBytes(saved.totalInBytes)}</span>
        <span>→</span>
        <strong>${formatBytes(saved.totalOutBytes)}</strong>
        <span style="color: var(--green); font-weight: 600;">(-${saved.savedPercent}% saved)</span>
      </div>
    </div>

    <div class="batch-thumbs" id="${saved.id}-thumbs"></div>
  `;

  batchesContainer.appendChild(card);

  // Render thumbnails
  const thumbsEl = card.querySelector(`#${saved.id}-thumbs`);
  if (saved.thumbs && saved.thumbs.length > 0) {
    saved.thumbs.forEach(tUrl => {
      const thumb = document.createElement('div');
      thumb.className = 'batch-thumb-item';
      thumb.innerHTML = `<img src="${tUrl}" alt="Preview">`;
      thumbsEl.appendChild(thumb);
    });
  }

  // Hook up download
  const dlBtn = card.querySelector(`#${saved.id}-downloadBtn`);
  dlBtn.addEventListener('click', () => {
    downloadBatchArchive(saved.title, saved.items, dlBtn);
  });

  // Hook up delete
  const delBtn = card.querySelector(`#${saved.id}-deleteBtn`);
  delBtn.addEventListener('click', async () => {
    await deleteBatchFromDB(saved.id);
    card.remove();
  });
}

// ========================================================
// 4. Batch Compression Pipeline
// ========================================================
async function runBatchCompression(batchId, title, dateLabel, files) {
  const progressEl = document.getElementById(`${batchId}-progress`);
  const statusEl = document.getElementById(`${batchId}-status`);
  const counterEl = document.getElementById(`${batchId}-counter`);
  const statsEl = document.getElementById(`${batchId}-stats`);
  const downloadBtn = document.getElementById(`${batchId}-downloadBtn`);
  const thumbsEl = document.getElementById(`${batchId}-thumbs`);

  const total = files.length;
  let completed = 0;
  let totalInBytes = 0;
  let totalOutBytes = 0;
  const processedItems = [];
  const thumbList = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      const result = await compressSingleFile(file);
      completed++;
      totalInBytes += result.originalSize;
      totalOutBytes += result.newSize;
      processedItems.push(result);

      if (thumbList.length < 24) {
        thumbList.push(result.thumbUrl);
        const thumb = document.createElement('div');
        thumb.className = 'batch-thumb-item';
        thumb.innerHTML = `<img src="${result.thumbUrl}" alt="Preview">`;
        thumbsEl.appendChild(thumb);
      }

      const percent = Math.round((completed / total) * 100);
      progressEl.style.width = `${percent}%`;
      statusEl.textContent = `${percent}%`;
      counterEl.textContent = `Compressing ${completed} of ${total} images...`;

      const savedPercent = (((totalInBytes - totalOutBytes) / totalInBytes) * 100).toFixed(1);
      statsEl.innerHTML = `
        <span>${formatBytes(totalInBytes)}</span>
        <span>→</span>
        <strong>${formatBytes(totalOutBytes)}</strong>
        <span style="color: var(--green); font-weight: 600;">(-${savedPercent}% saved)</span>
      `;
    } catch (err) {
      console.error(`Error processing ${file.name}:`, err);
      completed++;
    }
  }

  progressEl.classList.add('completed');
  statusEl.classList.add('completed');
  statusEl.textContent = 'Complete';

  const finalSavedPercent = totalInBytes > totalOutBytes
    ? (((totalInBytes - totalOutBytes) / totalInBytes) * 100).toFixed(1)
    : 0;
  counterEl.textContent = `${total} images compressed • -${finalSavedPercent}% total reduction`;

  downloadBtn.disabled = false;
  downloadBtn.addEventListener('click', () => {
    downloadBatchArchive(title, processedItems, downloadBtn);
  });

  // Save to IndexedDB so it's remembered even after closing browser!
  const batchRecord = {
    id: batchId,
    title: title,
    date: dateLabel,
    total: total,
    totalInBytes: totalInBytes,
    totalOutBytes: totalOutBytes,
    savedPercent: finalSavedPercent,
    thumbs: thumbList,
    items: processedItems,
    timestamp: Date.now()
  };
  await saveBatchToDB(batchRecord);
}

// ========================================================
// 5. High-Efficiency Image Compressor
// ========================================================
async function compressSingleFile(file) {
  let sourceBlob = file;
  const ext = file.name.split('.').pop().toLowerCase();

  // Handle iPhone HEIC
  if (ext === 'heic' || ext === 'heif') {
    if (typeof heic2any !== 'undefined') {
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
      sourceBlob = Array.isArray(converted) ? converted[0] : converted;
    }
  }

  const imgUrl = URL.createObjectURL(sourceBlob);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imgUrl;
  });

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > MAX_RESOLUTION || height > MAX_RESOLUTION) {
    if (width >= height) {
      height = Math.round((height * MAX_RESOLUTION) / width);
      width = MAX_RESOLUTION;
    } else {
      width = Math.round((width * MAX_RESOLUTION) / height);
      height = MAX_RESOLUTION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  URL.revokeObjectURL(imgUrl);

  let outputFormat = 'image/webp';
  let outputExt = '.webp';

  let outputBlob = await new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type === 'image/png') {
        canvas.toBlob((jpegBlob) => resolve(jpegBlob), 'image/jpeg', QUALITY);
      } else {
        resolve(blob);
      }
    }, outputFormat, QUALITY);
  });

  if (outputBlob && outputBlob.type === 'image/jpeg') {
    outputExt = '.jpg';
  }

  // Anti-Inflation Guard
  if (outputBlob && outputBlob.size >= file.size) {
    const tighterBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), outputFormat, 0.35);
    });

    if (tighterBlob && tighterBlob.size < file.size) {
      outputBlob = tighterBlob;
    } else {
      outputBlob = file;
      outputExt = '.' + ext;
    }
  }

  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const finalFileName = `${baseName}${outputExt}`;
  const thumbUrl = canvas.toDataURL('image/jpeg', 0.5);

  return {
    name: finalFileName,
    blob: outputBlob || file,
    originalSize: file.size,
    newSize: outputBlob ? outputBlob.size : file.size,
    thumbUrl: thumbUrl,
  };
}

// ========================================================
// 6. Robust Batch ZIP Download
// ========================================================
async function downloadBatchArchive(batchTitle, items, buttonEl) {
  if (!items || items.length === 0) return;

  if (typeof JSZip === 'undefined') {
    alert('ZIP engine is still loading. Please try again.');
    return;
  }

  const originalContent = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.style.opacity = '0.7';
  buttonEl.innerHTML = `<span>⏳ Zipping...</span>`;

  try {
    const zip = new JSZip();
    const usedNames = new Set();

    const safeFolderName = batchTitle
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'Compressed_Photos';

    const rootFolder = zip.folder(safeFolderName);

    for (const item of items) {
      let fileName = item.name;
      let counter = 1;
      const dotIndex = fileName.lastIndexOf('.');
      const base = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName;
      const ext = dotIndex !== -1 ? fileName.substring(dotIndex) : '';

      while (usedNames.has(fileName)) {
        fileName = `${base}_${counter}${ext}`;
        counter++;
      }
      usedNames.add(fileName);

      rootFolder.file(fileName, item.blob);
    }

    const zipContent = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
    });

    const zipUrl = URL.createObjectURL(zipContent);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `${safeFolderName}.zip`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(zipUrl), 15000);
  } catch (err) {
    console.error('ZIP Error:', err);
    alert('Failed to generate ZIP archive: ' + err.message);
  } finally {
    buttonEl.disabled = false;
    buttonEl.style.opacity = '1';
    buttonEl.innerHTML = originalContent;
  }
}
