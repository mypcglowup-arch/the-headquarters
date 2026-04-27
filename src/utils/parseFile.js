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

  // Excel files (.xlsx / .xls) are intentionally rejected.
  // Rationale: the SheetJS / xlsx package has known prototype-pollution and
  // ReDoS vulnerabilities (CVE-2023-30533 et al.) with no fix available
  // upstream. Parsing binary spreadsheets from user uploads is a direct attack
  // surface — we removed the dependency entirely. CSV covers the same use case
  // safely (papaparse is well-audited and parses text only).
  if (ext === 'xlsx' || ext === 'xls') {
    return {
      type: 'rejected',
      name: file.name,
      reason: 'xlsx-not-supported',
      message: 'Excel files (.xlsx/.xls) are not supported for security reasons. Please save your spreadsheet as CSV (File → Save As → CSV) and upload again.',
      messageFr: 'Les fichiers Excel (.xlsx/.xls) ne sont pas supportés pour des raisons de sécurité. Convertis ton tableur en CSV (Fichier → Enregistrer sous → CSV) et upload à nouveau.',
    };
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
