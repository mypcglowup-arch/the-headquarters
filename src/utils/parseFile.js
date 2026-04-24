import Papa from 'papaparse';

const IMAGE_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp',
};

export async function parseUploadedFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (IMAGE_MIME[ext]) {
    const rawDataUrl = await readAsDataUrl(file);
    const dataUrl = await resizeImage(rawDataUrl, IMAGE_MIME[ext]);
    const base64 = dataUrl.split(',')[1];
    return { type: 'image', name: file.name, base64, mimeType: IMAGE_MIME[ext], preview: dataUrl };
  }

  if (ext === 'pdf') {
    const base64 = await readAsBase64(file);
    return { type: 'pdf', name: file.name, base64, mimeType: 'application/pdf' };
  }

  if (ext === 'csv') {
    const text = await readAsText(file);
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = result.data;
    if (!rows.length) return { type: 'csv', name: file.name, text: 'Empty CSV file.' };
    const headers = Object.keys(rows[0]);
    const preview = rows.slice(0, 80)
      .map((row) => headers.map((h) => `${h}: ${row[h] ?? ''}`).join(' | '))
      .join('\n');
    const text_ = `[${rows.length} rows · columns: ${headers.join(', ')}]\n\n${preview}${rows.length > 80 ? `\n... +${rows.length - 80} more rows` : ''}`;
    return { type: 'csv', name: file.name, text: text_ };
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const { read, utils } = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) return { type: 'xlsx', name: file.name, text: 'Empty spreadsheet.' };
    const headers = Object.keys(rows[0]);
    const preview = rows.slice(0, 80)
      .map((row) => headers.map((h) => `${h}: ${row[h]}`).join(' | '))
      .join('\n');
    const text_ = `[Sheet: ${sheetName} · ${rows.length} rows · columns: ${headers.join(', ')}]\n\n${preview}${rows.length > 80 ? `\n... +${rows.length - 80} more rows` : ''}`;
    return { type: 'xlsx', name: file.name, text: text_ };
  }

  return null;
}

function resizeImage(dataUrl, mimeType, maxSide = 1568) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= maxSide && h <= maxSide) { resolve(dataUrl); return; }
      const scale = maxSide / Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(mimeType, 0.92));
    };
    img.onerror = () => resolve(dataUrl); // fallback: use original if resize fails
    img.src = dataUrl;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readAsBase64(file) {
  return readAsDataUrl(file).then((r) => r.split(',')[1]);
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
