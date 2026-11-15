// R2 keys of a photo, always generated server-side from the album and photo ids (never from the
// browser), so they are unique per photo and confined to the album folder.
export const uploadKeys = (matchId: string, photoId: string) => ({
  original: `${matchId}/${photoId}`,
  preview: `${matchId}/${photoId}-preview.jpg`,
  thumb: `${matchId}/${photoId}-thumb.jpg`,
});

export const heroKey = (matchId: string, timestamp: number) => `${matchId}/hero-${timestamp}.jpg`;
