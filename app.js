// Compresso — Batch-Based Apple-Inspired AVIF Compressor
// Group uploads into clean batch sections with live progress and independent ZIP downloads

const dropZone = document.getElementById('dropZone');
const filePicker = document.getElementById('filePicker');
const batchesContainer = document.getElementById('batchesContainer');

// Optimal Quality & Smart 2K Downscale
const QUALITY = 0.50;
const MAX_RESOLUTION = 2560;

let batchCounter = 1;

// 1. Drag & Drop Direct Manipulation
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
      createNewBatch(folderName || `Batch #${batchCounter++}`, files);
    }
  } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const files = Array.from(e.dataTransfer.files).filter(isImageFile);
    if (files.length > 0) {
      createNewBatch(`Batch #${batchCounter++}`, files);
    }
  }
});

filePicker.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    const files = Array.from(e.target.files).filter(isImageFile);
    if (files.length > 0) {
      createNewBatch(`Batch #${batchCounter++}`, files);
    }
    filePicker.value = '';
  }
});

function isImageFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const validExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp', 'gif'];
  return validExts.includes(ext) || file.type.startsWith('image/');
}

// 2. Recursive Folder Extraction
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

// 3. Create a Dedicated Batch Card Section
function createNewBatch(title, files) {
  const batchId = 'batch-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const total = files.length;

  const card = document.createElement('div');
  card.id = batchId;
  card.className = 'batch-card';
  card.innerHTML = `
    <div class="batch-header">
      <div class="batch-title-group">
        <div class="batch-title">
          <span>${title}</span>
          <span class="batch-badge" id="${batchId}-status">0%</span>
        </div>
        <div class="batch-subtitle" id="${batchId}-counter">
          Compressing 0 of ${total} images...
        </div>
      </div>
      <button class="download-batch-btn" id="${batchId}-downloadBtn" disabled>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Download Batch (.zip)</span>
      </button>
    </div>

    <!-- Progress Track -->
    <div class="progress-track">
      <div class="progress-fill" id="${batchId}-progress"></div>
    </div>

    <!-- Stats & Live Thumbnails -->
    <div class="batch-footer">
      <div class="batch-stats" id="${batchId}-stats">
        <span>Calculating size...</span>
      </div>
    </div>

    <!-- Preview Strip -->
    <div class="batch-thumbs" id="${batchId}-thumbs"></div>
  `;

  // Prepend so the newest batch appears cleanly at top
  batchesContainer.prepend(card);

  // Run the batch
  processBatch(batchId, title, files);
}

// 4. Batch Processing Runner
async function processBatch(batchId, title, files) {
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
  const convertedItems = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      const result = await compressImage(file);
      completed++;
      totalInBytes += result.originalSize;
      totalOutBytes += result.newSize;
      convertedItems.push(result);

      // Add thumbnail to strip (up to 20 previews)
      if (thumbsEl.children.length < 20) {
        const thumb = document.createElement('div');
        thumb.className = 'batch-thumb-item';
        thumb.innerHTML = `<img src="${result.thumbUrl}" alt="Thumb">`;
        thumbsEl.appendChild(thumb);
      }

      // Update UI Progress smoothly
      const percent = Math.round((completed / total) * 100);
      progressEl.style.width = `${percent}%`;
      statusEl.textContent = `${percent}%`;
      counterEl.textContent = `Compressing ${completed} of ${total} images...`;

      const savedPercent = (((totalInBytes - totalOutBytes) / totalInBytes) * 100).toFixed(1);
      statsEl.innerHTML = `
        <span>${formatBytes(totalInBytes)}</span>
        <span>→</span>
        <strong>${formatBytes(totalOutBytes)}</strong>
        <span style="color: var(--blue); font-weight: 600;">(-${savedPercent}%)</span>
      `;
    } catch (err) {
      console.error(`Error compressing ${file.name}:`, err);
      completed++;
    }
  }

  // Batch Complete State
  progressEl.classList.add('completed');
  statusEl.classList.add('completed');
  statusEl.textContent = 'Complete';
  const finalSaved = (((totalInBytes - totalOutBytes) / totalInBytes) * 100).toFixed(1);
  counterEl.textContent = `${total} images compressed • -${finalSaved}% saved`;

  // Enable Batch Download Button
  downloadBtn.disabled = false;
  downloadBtn.addEventListener('click', () => {
    downloadBatchZip(title, convertedItems, downloadBtn);
  });
}

// 5. High-Efficiency Image Compression Engine
async function compressImage(file) {
  let sourceBlob = file;
  const ext = file.name.split('.').pop().toLowerCase();

  // Decode iPhone HEIC/HEIF
  if (ext === 'heic' || ext === 'heif') {
    if (typeof heic2any !== 'undefined') {
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
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

  // Smart 2K Downscale
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

  // Render to Canvas (Automatically removes EXIF metadata)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  URL.revokeObjectURL(imgUrl);

  // Convert to AVIF (with WebP fallback)
  let outputFormat = 'image/avif';
  let outputExt = '.avif';

  let outputBlob = await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), outputFormat, QUALITY);
  });

  if (!outputBlob || outputBlob.type !== 'image/avif') {
    outputFormat = 'image/webp';
    outputExt = '.webp';
    outputBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), outputFormat, QUALITY);
    });
  }

  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const finalFileName = `${baseName}${outputExt}`;
  const thumbUrl = canvas.toDataURL('image/jpeg', 0.5);

  return {
    name: finalFileName,
    blob: outputBlob,
    originalSize: file.size,
    newSize: outputBlob.size,
    thumbUrl: thumbUrl,
  };
}

// 6. Instant Batch ZIP Downloader
async function downloadBatchZip(batchTitle, items, buttonEl) {
  if (!items || items.length === 0) return;

  if (typeof JSZip === 'undefined') {
    alert('ZIP engine is still loading. Please wait a moment.');
    return;
  }

  const originalText = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.style.opacity = '0.7';
  buttonEl.innerHTML = `<span>⏳ Zipping...</span>`;

  try {
    const zip = new JSZip();
    const usedNames = new Set();

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

      // STORE compression for instant speed
      zip.file(fileName, item.blob);
    }

    const zipContent = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
    });

    const safeTitle = batchTitle.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const zipUrl = URL.createObjectURL(zipContent);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `${safeTitle}_compresso.zip`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(zipUrl), 15000);
  } catch (err) {
    console.error('ZIP Error:', err);
    alert('Failed to generate ZIP: ' + err.message);
  } finally {
    buttonEl.disabled = false;
    buttonEl.style.opacity = '1';
    buttonEl.innerHTML = originalText;
  }
}
