// Compresso — Ultra-Clean Minimalist Client-Side AVIF Converter
// 100% Client-side, Zero Server Uploads, Privacy First

const dropZone = document.getElementById('dropZone');
const filePicker = document.getElementById('filePicker');
const resultsWrapper = document.getElementById('resultsWrapper');
const resultsList = document.getElementById('resultsList');
const processedBadge = document.getElementById('processedBadge');
const clearAllBtn = document.getElementById('clearAllBtn');
const floatingBar = document.getElementById('floatingBar');
const statBefore = document.getElementById('statBefore');
const statAfter = document.getElementById('statAfter');
const statSaved = document.getElementById('statSaved');
const downloadZipBtn = document.getElementById('downloadZipBtn');

// Smart Defaults: 50% Quality (up to 95% squeeze) + 2560px 2K downscale
const QUALITY = 0.50;
const MAX_RESOLUTION = 2560;

let processedFiles = [];
let totalInputBytes = 0;
let totalOutputBytes = 0;

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

dropZone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleBatchUpload(Array.from(e.dataTransfer.files));
  }
});

filePicker.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleBatchUpload(Array.from(e.target.files));
  }
});

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// 2. Batch Pipeline
async function handleBatchUpload(files) {
  resultsWrapper.style.display = 'flex';

  for (const file of files) {
    await processSingleImage(file);
  }
}

// 3. Single Image Processing Pipeline
async function processSingleImage(file) {
  const rowId = 'row-' + Math.random().toString(36).substring(2, 9);
  const ext = file.name.split('.').pop().toLowerCase();

  // Create Card Placeholder
  const row = document.createElement('div');
  row.id = rowId;
  row.className = 'result-row';
  row.innerHTML = `
    <div class="result-left">
      <div class="thumb-box">
        <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" style="animation: spin 1s linear infinite; color: var(--blue);">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" style="opacity: 0.25;"></circle>
          <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" style="opacity: 0.75;"></path>
        </svg>
      </div>
      <div class="result-meta">
        <div class="result-filename">${file.name}</div>
        <div class="result-stats">${formatBytes(file.size)} • Processing...</div>
      </div>
    </div>
    <div>
      <span style="font-size: 11px; color: var(--blue); font-weight: 500;">Compressing</span>
    </div>
  `;
  resultsList.prepend(row);

  try {
    let sourceBlob = file;

    // Decode iPhone HEIC/HEIF in browser
    if (ext === 'heic' || ext === 'heif') {
      if (typeof heic2any !== 'undefined') {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
        sourceBlob = Array.isArray(converted) ? converted[0] : converted;
      }
    }

    // Load into HTML Image
    const imgUrl = URL.createObjectURL(sourceBlob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imgUrl;
    });

    // Smart Clamping / Downscaling
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

    // Render to Canvas (Automatically strips all metadata)
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    URL.revokeObjectURL(imgUrl);

    // Convert to AVIF (or graceful WebP fallback if browser lacks native AVIF canvas encode)
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

    const originalSize = file.size;
    const newSize = outputBlob.size;
    const savedPercent = (((originalSize - newSize) / originalSize) * 100).toFixed(1);

    totalInputBytes += originalSize;
    totalOutputBytes += newSize;

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const finalFileName = `${baseName}${outputExt}`;
    const downloadUrl = URL.createObjectURL(outputBlob);

    processedFiles.push({
      name: finalFileName,
      blob: outputBlob,
    });

    updateGlobalStats();

    // Render live thumbnail
    const thumbUrl = canvas.toDataURL('image/jpeg', 0.6);

    // Update with Apple Card styling
    row.innerHTML = `
      <div class="result-left">
        <div class="thumb-box">
          <img src="${thumbUrl}" alt="Preview">
        </div>
        <div class="result-meta">
          <div class="result-filename">${finalFileName}</div>
          <div class="result-stats">
            <span>${formatBytes(originalSize)}</span>
            <span>→</span>
            <strong style="color: var(--text);">${formatBytes(newSize)}</strong>
            <span class="saved-pill">-${savedPercent}%</span>
          </div>
        </div>
      </div>
      <div>
        <a href="${downloadUrl}" download="${finalFileName}" class="save-button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Save</span>
        </a>
      </div>
    `;

  } catch (err) {
    row.innerHTML = `
      <div style="color: #FF3B30; font-size: 12px; display: flex; align-items: center; gap: 8px;">
        <span>⚠</span>
        <span>${file.name}: ${err.message || 'Compression error'}</span>
      </div>
    `;
  }
}

// 4. Global Stats & Floating Bar
function updateGlobalStats() {
  processedBadge.textContent = processedFiles.length;
  statBefore.textContent = formatBytes(totalInputBytes);
  statAfter.textContent = formatBytes(totalOutputBytes);

  if (totalInputBytes > 0) {
    const totalSavedPct = (((totalInputBytes - totalOutputBytes) / totalInputBytes) * 100).toFixed(1);
    statSaved.textContent = `-${totalSavedPct}%`;
  }

  // Materialize floating bottom bar
  if (processedFiles.length > 0) {
    floatingBar.classList.add('visible');
  }
}

// 5. Clear All
clearAllBtn.addEventListener('click', () => {
  processedFiles = [];
  totalInputBytes = 0;
  totalOutputBytes = 0;
  resultsList.innerHTML = '';
  resultsWrapper.style.display = 'none';
  filePicker.value = '';
  floatingBar.classList.remove('visible');
});

// 6. Download All as ZIP (Robust & Instant)
downloadZipBtn.addEventListener('click', async () => {
  if (!processedFiles || processedFiles.length === 0) return;

  if (typeof JSZip === 'undefined') {
    alert('ZIP engine is still loading. Please wait a moment and try again.');
    return;
  }

  downloadZipBtn.disabled = true;
  downloadZipBtn.style.opacity = '0.7';
  downloadZipBtn.innerHTML = `<span>⏳ Zipping...</span>`;

  try {
    const zip = new JSZip();
    const usedNames = new Set();

    // Deduplicate file names
    for (const item of processedFiles) {
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

      // Store without re-compression (near-instant, AVIF is already compressed)
      zip.file(fileName, item.blob);
    }

    const zipContent = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
    });

    const zipUrl = URL.createObjectURL(zipContent);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `compresso_${Date.now()}.zip`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Keep URL alive for 15s so browser download manager finishes saving
    setTimeout(() => {
      URL.revokeObjectURL(zipUrl);
    }, 15000);

  } catch (err) {
    console.error('ZIP Error:', err);
    alert('ZIP generation failed: ' + err.message);
  } finally {
    downloadZipBtn.disabled = false;
    downloadZipBtn.style.opacity = '1';
    downloadZipBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Download All (.zip)</span>
    `;
  }
});

// Keyframe for spinner
const style = document.createElement('style');
style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
