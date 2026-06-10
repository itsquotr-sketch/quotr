export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedPhotoType = (typeof ALLOWED_PHOTO_TYPES)[number];
export type AllowedDocType = (typeof ALLOWED_DOC_TYPES)[number];

export function isAllowedPhotoType(type: string): type is AllowedPhotoType {
  return (ALLOWED_PHOTO_TYPES as readonly string[]).includes(type);
}

export function isAllowedDocType(type: string): type is AllowedDocType {
  return (ALLOWED_DOC_TYPES as readonly string[]).includes(type);
}

export function formatMaxUploadSize(): string {
  return "20 MB";
}
