import {
  ALLOWED_DOC_TYPES,
  ALLOWED_PHOTO_TYPES,
  MAX_UPLOAD_BYTES,
  formatMaxUploadSize,
  isAllowedDocType,
  isAllowedPhotoType,
} from "@/lib/constants/uploads";

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; error: string };

function validateFileSize(file: File): UploadValidationResult {
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `"${file.name}" exceeds the ${formatMaxUploadSize()} upload limit.`,
    };
  }
  return { ok: true };
}

export function validatePhotoFile(file: File): UploadValidationResult {
  const sizeResult = validateFileSize(file);
  if (!sizeResult.ok) return sizeResult;

  if (!isAllowedPhotoType(file.type)) {
    return {
      ok: false,
      error: `"${file.name}" is not an allowed photo type. Use JPEG, PNG, or WebP.`,
    };
  }

  return { ok: true };
}

export function validateDocumentFile(file: File): UploadValidationResult {
  const sizeResult = validateFileSize(file);
  if (!sizeResult.ok) return sizeResult;

  if (!isAllowedDocType(file.type)) {
    return {
      ok: false,
      error: `"${file.name}" is not an allowed document type. Use PDF, Word, or an image.`,
    };
  }

  return { ok: true };
}

export function validatePhotoFiles(files: File[]): UploadValidationResult {
  for (const file of files) {
    const result = validatePhotoFile(file);
    if (!result.ok) return result;
  }
  return { ok: true };
}

export function validateDocumentFiles(files: File[]): UploadValidationResult {
  for (const file of files) {
    const result = validateDocumentFile(file);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/** Human-readable allowlists for form accept attributes. */
export const PHOTO_ACCEPT = ALLOWED_PHOTO_TYPES.join(",");
export const DOCUMENT_ACCEPT = ALLOWED_DOC_TYPES.join(",");
