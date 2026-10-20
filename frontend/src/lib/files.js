// File types the backend can extract text from (backend/routers/documents.py
// ALLOWED_FILE_TYPES). Keep the two lists in sync.
export const SUPPORTED_FILE_TYPES = [
  { ext: 'pdf', label: 'PDF', mime: 'application/pdf' },
  {
    ext: 'docx',
    label: 'Word',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  {
    ext: 'pptx',
    label: 'PowerPoint',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  { ext: 'md', label: 'Markdown', mime: 'text/markdown' },
  { ext: 'txt', label: 'Text', mime: 'text/plain' },
];

// Extensions plus MIME types, so mobile file pickers offer the right files
export const ACCEPT_ATTRIBUTE = SUPPORTED_FILE_TYPES.flatMap(({ ext, mime }) => [`.${ext}`, mime]).join(',');

export const SUPPORTED_EXTENSIONS_LABEL = 'PDF, DOCX, PPTX, MD or TXT';

// Must match the server's MAX_UPLOAD_MB (default 20). The server still
// enforces its own limit and its 413 message is shown if they differ.
export const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 20;

export function fileExtension(name = '') {
  const match = /\.([a-z0-9]{1,10})$/i.exec(name);
  return match ? match[1].toLowerCase() : '';
}

export function fileTypeLabel(ext) {
  return SUPPORTED_FILE_TYPES.find((t) => t.ext === ext)?.label ?? (ext ? ext.toUpperCase() : 'File');
}

// Returns a message explaining why the file can't be uploaded, or null
export function validateFile(file) {
  const ext = fileExtension(file.name);
  if (!SUPPORTED_FILE_TYPES.some((t) => t.ext === ext)) {
    return `Unsupported file type. Upload a ${SUPPORTED_EXTENSIONS_LABEL} file.`;
  }
  if (file.size === 0) {
    return 'This file is empty.';
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `This file is larger than ${MAX_UPLOAD_MB} MB.`;
  }
  return null;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Strips the extension for display: "biology-notes.pdf" -> "biology-notes"
export function displayName(filename = '') {
  return filename.replace(/\.[a-z0-9]{1,10}$/i, '') || filename;
}
