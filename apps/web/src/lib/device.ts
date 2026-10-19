// Phone and browser capabilities used in the app: GPS, ids, clipboard.
// Some browser APIs exist only on HTTPS pages; a test server may run on plain HTTP,
// so each helper has a fallback or a clear message.

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number;
}

export function getPosition(timeoutMs = 20_000): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext)
      return reject(new Error('GPS is blocked because this site is not on HTTPS. Ask the administrator to enable it for this phone.'));
    if (!('geolocation' in navigator)) return reject(new Error('This device cannot provide a GPS position'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lng: round(p.coords.longitude), accuracy: Math.round(p.coords.accuracy) }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was refused. Allow location for this site in the browser settings.'
              : err.code === err.TIMEOUT
                ? 'No GPS fix yet. Move to open sky and try again.'
                : 'Could not read the GPS position.',
          ),
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/** Random v4 UUID. crypto.randomUUID exists only on HTTPS pages; getRandomValues works everywhere. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Copies text; navigator.clipboard is missing on plain-HTTP pages, so fall back to execCommand. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('Copy is not available in this browser');
}

/** Distance on the earth's surface in metres (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

/**
 * Shrinks a camera photo before it is stored or sent: longest side 1600 px, JPEG quality 0.8
 * (typically 200–400 KB instead of several MB, which matters on slow mobile data).
 */
export async function compressPhoto(file: File, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process the photo'))), 'image/jpeg', 0.8),
  );
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
