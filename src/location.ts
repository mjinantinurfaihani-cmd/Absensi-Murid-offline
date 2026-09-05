export const ATTENDANCE_TARGET = {
  latitude: -6.945515441333451,
  longitude: 107.71434809536049,
  radiusMeters: 60,
};

export function haversineDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number = ATTENDANCE_TARGET.latitude,
  longitude2: number = ATTENDANCE_TARGET.longitude,
): number {
  const earthRadiusMeters = 6371000;
  const deltaLatitude = ((latitude2 - latitude1) * Math.PI) / 180;
  const deltaLongitude = ((longitude2 - longitude1) * Math.PI) / 180;
  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos((latitude1 * Math.PI) / 180) *
      Math.cos((latitude2 * Math.PI) / 180) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

export function isWithinTargetRadius(
  latitude: number,
  longitude: number,
  targetLatitude: number = ATTENDANCE_TARGET.latitude,
  targetLongitude: number = ATTENDANCE_TARGET.longitude,
  radiusMeters: number = ATTENDANCE_TARGET.radiusMeters,
): boolean {
  return haversineDistanceMeters(latitude, longitude, targetLatitude, targetLongitude) <= radiusMeters;
}

export async function requestAttendanceLocation(): Promise<{ lat: number; lon: number; distanceMeters: number }> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new Error('Browser tidak mendukung fitur lokasi.');
  }

  try {
    const permissionStatus = await navigator.permissions?.query?.({ name: 'geolocation' as PermissionName }).catch(() => null);
    if (permissionStatus && permissionStatus.state === 'denied') {
      throw new Error('Izin lokasi diblokir. Aktifkan izin Lokasi pada pengaturan browser lalu coba lagi.');
    }
  } catch {
    // Permission query failure should not block the flow; the geolocation request itself will surface the actual issue.
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const distanceMeters = haversineDistanceMeters(lat, lon);

        if (distanceMeters > ATTENDANCE_TARGET.radiusMeters) {
          const errorMsg = `Peringatan: Anda berada ${distanceMeters.toFixed(0)} meter dari area sekolah. Silakan pindahkan ke dalam area pembelajaran (maksimal 60 meter dari titik absensi sekolah).`;
          reject(new Error(errorMsg));
          return;
        }

        resolve({ lat, lon, distanceMeters });
      },
      (error) => {
        const code = error?.code ?? 0;
        if (code === 1) {
          reject(new Error('Izin lokasi ditolak. Izinkan Lokasi agar absensi dapat diproses.'));
          return;
        }
        if (code === 2) {
          reject(new Error('Lokasi perangkat tidak tersedia saat ini. Coba lagi dalam beberapa detik.'));
          return;
        }
        if (code === 3) {
          reject(new Error('Permintaan lokasi timeout. Pastikan GPS aktif dan coba lagi.'));
          return;
        }
        reject(new Error('Gagal mengambil lokasi perangkat.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      },
    );
  });
}
