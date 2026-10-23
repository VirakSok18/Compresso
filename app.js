// Compresso — Apple-Inspired Client-Side AVIF Converter
// Adheres to Apple Human Interface Guidelines and Emil Kowalski's Fluid Interface design principles

const dropZone = document.getElementById('dropZone');
const filePicker = document.getElementById('filePicker');
const qualitySlider = document.getElementById('qualitySlider');
const qualityLabel = document.getElementById('qualityLabel');
const stripExif = document.getElementById('stripExif');
const resultsWrapper = document.getElementById('resultsWrapper');
const resultsList = document.getElementById('resultsList');
const processedBadge = document.getElementById('processedBadge');
const clearAllBtn = document.getElementById('clearAllBtn');
const floatingBar = document.getElementById('floatingBar');
const statBefore = document.getElementById('statBefore');
const statAfter = document.getElementById('statAfter');
const statSaved = document.getElementById('statSaved');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const segmentBtns = document.querySelectorAll('.segment-btn');

let activeResolution = '2560';
let processedFiles = [];
let totalInputBytes = 0;
let totalOutputBytes = 0;

// 1. Resolution Segmented Control (Apple Pill Slider)
segmentBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    segmentBtns.forEach(b => b.classList.remove('active', 'font-semibold'));
    btn.classList.add('active', 'font-semibold');
    activeResolution = btn.dataset.res;
  });
});

// 2. Tactile Quality Slider Feedback
qualitySlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  let descriptor = 'Recommended';
  if (val <= 35) descriptor = 'Maximum Squeeze';
  else if (val <= 45) descriptor = 'Compact';
  else if (val <= 60) descriptor = 'Recommended';
  else if (val <= 75) descriptor = 'High Clarity';
  else descriptor = 'Near Lossless';

  qualityLabel.textContent = `${val}% (${descriptor})`;
});

// 3. Fluid Drag & Drop Handling (Direct Manipulation)
dropZone.addEventListener('click', () => filePicker.click());

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('border-apple-blue', 'bg-apple-blueLight/30', 'scale-[0.995]');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-apple-blue', 'bg-apple-blueLight/30', 'scale-[0.995]');
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

// 4. Batch Pipeline
async function handleBatchUpload(files) {
  resultsWrapper.classList.remove('hidden');

  for (const file of files) {
    await processSingleImage(file);
  }
}

// 5. Single Image Processing Pipeline
async function processSingleImage(file) {
  const quality = parseInt(qualitySlider.value, 10) / 100;
  const rowId = 'row-' + Math.random().toString(36).substring(2, 9);
  const ext = file.name.split('.').pop().toLowerCase();

  // Create Apple-Style Card Placeholder
  const row = document.createElement('div');
  row.id = rowId;
  row.className = 'glass-panel bg-white p-3.5 rounded-2xl shadow-apple-card flex items-center justify-between gap-4 transition-all duration-300';
  row.innerHTML = `
    <div class="flex items-center gap-3.5 min-w-0">
      <div class="w-12 h-12 rounded-xl bg-apple-surfaceMuted flex items-center justify-center text-apple-tertiary text-xs shrink-0 font-medium">
        <svg class="animate-spin text-apple-blue w-5 h-5" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      </div>
      <div class="min-w-0">
        <p class="font-medium text-xs text-apple-text truncate max-w-xs md:max-w-md">${file.name}</p>
        <p class="text-[11px] text-apple-secondary font-mono mt-0.5">${formatBytes(file.size)} • Processing</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-[11px] text-apple-blue font-medium animate-pulse">Compressing</span>
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

    if (activeResolution !== 'original') {
      const maxLimit = parseInt(activeResolution, 10);
      if (width > maxLimit || height > maxLimit) {
        if (width >= height) {
          height = Math.round((height * maxLimit) / width);
          width = maxLimit;
        } else {
          width = Math.round((width * maxLimit) / height);
          height = maxLimit;
        }
      }
    }

    // Render to Canvas (Strips metadata automatically)
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    URL.revokeObjectURL(imgUrl);

    // Convert to AVIF (or graceful WebP fallback if browser lacks native AVIF encode)
    let outputFormat = 'image/avif';
    let outputExt = '.avif';

    let outputBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), outputFormat, quality);
    });

    if (!outputBlob || outputBlob.type !== 'image/avif') {
      outputFormat = 'image/webp';
      outputExt = '.webp';
      outputBlob = await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), outputFormat, quality);
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
      <div class="flex items-center gap-3.5 min-w-0">
        <div class="w-12 h-12 rounded-xl bg-apple-surfaceMuted overflow-hidden border border-black/[0.06] shrink-0 relative">
          <img src="${thumbUrl}" alt="Preview" class="w-full h-full object-cover">
        </div>
        <div class="min-w-0">
          <p class="font-medium text-xs text-apple-text truncate max-w-xs md:max-w-md">${finalFileName}</p>
          <div class="flex items-center gap-2 text-[11px] text-apple-secondary font-mono mt-0.5">
            <span>${formatBytes(originalSize)}</span>
            <span class="text-apple-tertiary">→</span>
            <span class="font-semibold text-apple-text">${formatBytes(newSize)}</span>
            <span class="text-apple-blue font-semibold bg-apple-blueLight px-1.5 py-0.2 rounded border border-apple-blueBorder">-${savedPercent}%</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <a href="${downloadUrl}" download="${finalFileName}" class="apple-btn px-3 py-1.5 rounded-lg bg-apple-surfaceMuted hover:bg-apple-blue hover:text-white text-apple-text text-xs font-medium flex items-center gap-1.5 transition">
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
      <div class="flex items-center gap-3 text-red-500 text-xs">
        <span>⚠</span>
        <span class="truncate">${file.name}: ${err.message || 'Compression error'}</span>
      </div>
    `;
  }
}

// 6. Global Stats & Dynamic Island Bottom Bar
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
    floatingBar.classList.remove('translate-y-24', 'opacity-0', 'pointer-events-none');
    floatingBar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
  }
}

// 7. Clear All
clearAllBtn.addEventListener('click', () => {
  processedFiles = [];
  totalInputBytes = 0;
  totalOutputBytes = 0;
  resultsList.innerHTML = '';
  resultsWrapper.classList.add('hidden');
  filePicker.value = '';

  floatingBar.classList.add('translate-y-24', 'opacity-0', 'pointer-events-none');
  floatingBar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
});

// 8. Download All as ZIP (Bundled seamlessly)
downloadZipBtn.addEventListener('click', async () => {
  if (processedFiles.length === 0) return;

  downloadZipBtn.disabled = true;
  downloadZipBtn.innerHTML = `
    <svg class="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
    </svg>
    <span>Creating Archive...</span>
  `;

  try {
    const zip = new JSZip();
    for (const item of processedFiles) {
      zip.file(item.name, item.blob);
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipContent);
    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = `compresso_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(zipUrl);
  } catch (err) {
    alert('ZIP generation failed: ' + err.message);
  } finally {
    downloadZipBtn.disabled = false;
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
