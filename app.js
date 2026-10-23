const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const qualityInput = document.getElementById('qualityInput');
const qualityVal = document.getElementById('qualityVal');
const maxResSelect = document.getElementById('maxResSelect');
const stripMetaCheckbox = document.getElementById('stripMetaCheckbox');
const actionToolbar = document.getElementById('actionToolbar');
const resultsList = document.getElementById('resultsList');
const totalCount = document.getElementById('totalCount');
const totalOriginalSize = document.getElementById('totalOriginalSize');
const totalNewSize = document.getElementById('totalNewSize');
const totalSavings = document.getElementById('totalSavings');
const clearBtn = document.getElementById('clearBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');

let processedFiles = [];
let totalBeforeBytes = 0;
let totalAfterBytes = 0;

// Quality Slider Label
qualityInput.addEventListener('input', (e) => {
  const v = e.target.value;
  qualityVal.textContent = `${v}% (${v <= 45 ? 'Maximum Compression' : v <= 65 ? 'Recommended' : 'High Quality'})`;
});

// Drag & Drop
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-indigo-500', 'bg-slate-900/80');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('border-indigo-500', 'bg-slate-900/80');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-indigo-500', 'bg-slate-900/80');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleFiles(Array.from(e.dataTransfer.files));
  }
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFiles(Array.from(e.target.files));
  }
});

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function handleFiles(files) {
  actionToolbar.classList.remove('hidden');

  for (const file of files) {
    await processOneFile(file);
  }
}

async function processOneFile(file) {
  const quality = parseInt(qualityInput.value, 10) / 100;
  const maxRes = maxResSelect.value;
  const rowId = 'file-' + Math.random().toString(36).substring(2, 9);

  // Render pending row
  const row = document.createElement('div');
  row.id = rowId;
  row.className = 'bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between text-xs transition';
  row.innerHTML = `
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-slate-400 font-mono text-[10px] shrink-0">
        ${file.name.split('.').pop().toUpperCase().slice(0, 4)}
      </div>
      <div class="min-w-0">
        <p class="font-medium text-slate-200 truncate max-w-xs md:max-w-md">${file.name}</p>
        <p class="text-slate-500 text-[11px]">${formatBytes(file.size)}</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-indigo-400 animate-pulse text-[11px]">Compressing...</span>
    </div>
  `;
  resultsList.prepend(row);

  try {
    let sourceBlob = file;

    // Handle iPhone HEIC decoding
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'heic' || ext === 'heif') {
      if (typeof heic2any !== 'undefined') {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        sourceBlob = Array.isArray(converted) ? converted[0] : converted;
      }
    }

    // Load into Image Bitmap / HTML Image
    const imgUrl = URL.createObjectURL(sourceBlob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imgUrl;
    });

    // Calculate dimensions (Max-Width downscaling)
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (maxRes !== 'original') {
      const maxLimit = parseInt(maxRes, 10);
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

    // Render to Canvas (automatically strips EXIF metadata!)
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    URL.revokeObjectURL(imgUrl);

    // Convert to AVIF (or fallback to WebP if browser canvas lacks AVIF encoder)
    let outputFormat = 'image/avif';
    let outputExt = '.avif';

    let avifBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), outputFormat, quality);
    });

    // Fallback if browser canvas does not natively support AVIF encode
    if (!avifBlob || avifBlob.type !== 'image/avif') {
      outputFormat = 'image/webp';
      outputExt = '.webp';
      avifBlob = await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), outputFormat, quality);
      });
    }

    const newSize = avifBlob.size;
    const originalSize = file.size;
    const savings = (((originalSize - newSize) / originalSize) * 100).toFixed(1);

    totalBeforeBytes += originalSize;
    totalAfterBytes += newSize;
    updateGlobalStats();

    const outputFileName = file.name.replace(/\.[^/.]+$/, "") + outputExt;
    const downloadUrl = URL.createObjectURL(avifBlob);

    processedFiles.push({
      name: outputFileName,
      blob: avifBlob,
    });

    // Update row with finished state
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-8 h-8 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono text-[10px] shrink-0 font-bold">
          AVIF
        </div>
        <div class="min-w-0">
          <p class="font-medium text-slate-200 truncate max-w-xs md:max-w-md">${outputFileName}</p>
          <div class="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <span>${formatBytes(originalSize)}</span>
            <span>→</span>
            <span class="text-emerald-400 font-bold">${formatBytes(newSize)}</span>
            <span class="text-indigo-400">(${savings}% saved)</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <a href="${downloadUrl}" download="${outputFileName}" class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition">
          Download
        </a>
      </div>
    `;
  } catch (err) {
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 text-red-400">
        <span>✖</span>
        <span class="truncate">${file.name}: ${err.message || 'Conversion failed'}</span>
      </div>
    `;
  }
}

function updateGlobalStats() {
  totalCount.textContent = processedFiles.length;
  totalOriginalSize.textContent = formatBytes(totalBeforeBytes);
  totalNewSize.textContent = formatBytes(totalAfterBytes);

  if (totalBeforeBytes > 0) {
    const saved = (((totalBeforeBytes - totalAfterBytes) / totalBeforeBytes) * 100).toFixed(1);
    totalSavings.textContent = `${saved}%`;
  }
}

// Clear All
clearBtn.addEventListener('click', () => {
  processedFiles = [];
  totalBeforeBytes = 0;
  totalAfterBytes = 0;
  resultsList.innerHTML = '';
  actionToolbar.classList.add('hidden');
  fileInput.value = '';
});

// Download All as ZIP
downloadAllBtn.addEventListener('click', async () => {
  if (processedFiles.length === 0) return;

  downloadAllBtn.disabled = true;
  downloadAllBtn.innerHTML = `<span>⏳</span> Zipping...`;

  try {
    const zip = new JSZip();
    for (const item of processedFiles) {
      zip.file(item.name, item.blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `compressed_photos_${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(zipUrl);
  } catch (err) {
    alert('Failed to generate ZIP: ' + err.message);
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.innerHTML = `<span>📦</span> Download All (ZIP)`;
  }
});

