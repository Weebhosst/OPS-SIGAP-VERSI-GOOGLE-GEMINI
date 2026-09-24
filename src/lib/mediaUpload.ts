import { api } from './api';

export type MediaPurpose =
  | 'PATROL'
  | 'SERTIGAS'
  | 'HANDOVER'
  | 'TARUNA'
  | 'INCIDENT'
  | 'ATTENDANCE'
  | 'DOCUMENT'
  | 'TEMP';

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(',');
  if (!header || !encoded) throw new Error('Format foto tidak valid.');
  const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bytes = atob(encoded);
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new Blob([array], { type: mimeType });
}

export async function uploadDataUrlToR2(dataUrl: string, purpose: MediaPurpose): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const ticket = await api.createMediaUpload({
    purpose,
    contentType: blob.type || 'image/jpeg',
    sizeBytes: blob.size,
  });

  const response = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Upload foto ke object storage gagal (HTTP ${response.status}).`);
  }

  return ticket.mediaUrl;
}
