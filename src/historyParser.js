const historyStorageKey = 'spsv_extended_history';

export const formatListeningTime = (ms) => {
  if (!ms || ms < 60000) return '< 1m';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export function parseSpotifyRecords(records) {
  if (!Array.isArray(records) || !records.length) return null;

  const tracks = {};
  const artists = {};
  let totalMs = 0;
  let totalPlays = 0;

  for (const item of records) {
    const trackName = item.master_metadata_track_name || item.trackName;
    const artistName = item.master_metadata_album_artist_name || item.artistName;
    const ms = Number(item.ms_played ?? item.msPlayed ?? 0);

    if (!trackName || !artistName || ms < 15000) continue;

    totalMs += ms;
    totalPlays++;

    const trackKey = `${trackName.trim().toLowerCase()}___${artistName.trim().toLowerCase()}`;
    if (!tracks[trackKey]) tracks[trackKey] = { name: trackName, artist: artistName, plays: 0, totalMs: 0 };
    tracks[trackKey].plays++;
    tracks[trackKey].totalMs += ms;

    const artistKey = artistName.trim().toLowerCase();
    if (!artists[artistKey]) artists[artistKey] = { name: artistName, plays: 0, totalMs: 0 };
    artists[artistKey].plays++;
    artists[artistKey].totalMs += ms;
  }

  return { totalMs, totalPlays, tracks, artists, importedAt: Date.now() };
}

export function mergeSpotifyHistory(current, next) {
  if (!next) return current;
  if (!current) return next;

  current.totalMs += next.totalMs;
  current.totalPlays += next.totalPlays;

  Object.entries(next.tracks).forEach(([key, track]) => {
    const currentTrack = current.tracks[key];
    if (!currentTrack) {
      current.tracks[key] = track;
      return;
    }
    currentTrack.plays += track.plays;
    currentTrack.totalMs += track.totalMs;
  });

  Object.entries(next.artists).forEach(([key, artist]) => {
    const currentArtist = current.artists[key];
    if (!currentArtist) {
      current.artists[key] = artist;
      return;
    }
    currentArtist.plays += artist.plays;
    currentArtist.totalMs += artist.totalMs;
  });

  return current;
}

export function storeHistoryData(historyData) {
  localStorage.setItem(historyStorageKey, JSON.stringify(historyData));
}

export function getStoredHistory() {
  try {
    const raw = localStorage.getItem(historyStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearStoredHistory() {
  localStorage.removeItem(historyStorageKey);
}

export function generateSampleHistory(tracksList, artistsList) {
  const records = [];
  const baseTracks = tracksList?.length ? tracksList : [
    { name: 'Cruel Summer', artists: [{ name: 'Taylor Swift' }], duration_ms: 178000 },
    { name: 'Starboy', artists: [{ name: 'The Weeknd' }], duration_ms: 230000 },
    { name: 'As It Was', artists: [{ name: 'Harry Styles' }], duration_ms: 167000 },
    { name: 'Blinding Lights', artists: [{ name: 'The Weeknd' }], duration_ms: 200000 },
    { name: 'Espresso', artists: [{ name: 'Sabrina Carpenter' }], duration_ms: 175000 },
    { name: 'Greedy', artists: [{ name: 'Tate McRae' }], duration_ms: 131000 },
    { name: 'vampire', artists: [{ name: 'Olivia Rodrigo' }], duration_ms: 219000 },
    { name: 'Paint The Town Red', artists: [{ name: 'Doja Cat' }], duration_ms: 231000 },
  ];

  baseTracks.forEach((track, index) => {
    const artistName = track.artists?.[0]?.name || 'Artist';
    const plays = Math.max(15, 280 - index * 28 + Math.floor(Math.random() * 20));
    const duration = track.duration_ms || 180000;
    for (let i = 0; i < plays; i++) {
      records.push({
        trackName: track.name,
        artistName: artistName,
        msPlayed: Math.floor(duration * (0.8 + Math.random() * 0.4))
      });
    }
  });

  return parseSpotifyRecords(records);
}
