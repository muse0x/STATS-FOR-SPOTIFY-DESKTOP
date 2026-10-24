const HistoryStorageKey = 'spsv_extended_history';

export const FormatListeningTime = (Milliseconds) => {
  if (!Milliseconds || Milliseconds < 60000) return '< 1m';
  const Hours = Math.floor(Milliseconds / 3600000);
  const Minutes = Math.floor((Milliseconds % 3600000) / 60000);
  return Hours > 0 ? `${Hours}h ${Minutes}m` : `${Minutes}m`;
};

export function ParseSpotifyRecords(Records) {
  if (!Array.isArray(Records) || !Records.length) return null;

  const Tracks = Object.create(null);
  const Artists = Object.create(null);
  let TotalMs = 0;
  let TotalPlays = 0;

  for (const Record of Records) {
    const TrackName = Record.master_metadata_track_name || Record.trackName;
    const ArtistName = Record.master_metadata_album_artist_name || Record.artistName;
    const Milliseconds = Number(Record.ms_played ?? Record.msPlayed ?? 0);

    if (!TrackName || !ArtistName || Milliseconds < 15000) continue;

    TotalMs += Milliseconds;
    TotalPlays++;

    const ArtistKey = ArtistName.trim().toLowerCase();
    const TrackKey = `${TrackName.trim().toLowerCase()}___${ArtistKey}`;
    if (!Object.hasOwn(Tracks, TrackKey)) {
      Tracks[TrackKey] = { name: TrackName, artist: ArtistName, plays: 0, totalMs: 0 };
    }
    Tracks[TrackKey].plays++;
    Tracks[TrackKey].totalMs += Milliseconds;

    if (!Object.hasOwn(Artists, ArtistKey)) {
      Artists[ArtistKey] = { name: ArtistName, plays: 0, totalMs: 0 };
    }
    Artists[ArtistKey].plays++;
    Artists[ArtistKey].totalMs += Milliseconds;
  }

  return { totalMs: TotalMs, totalPlays: TotalPlays, tracks: Tracks, artists: Artists, importedAt: Date.now() };
}

function MergeHistoryEntries(Current, Next) {
  for (const Key in Next) {
    if (!Object.hasOwn(Next, Key)) continue;
    if (!Object.hasOwn(Current, Key)) {
      Current[Key] = Next[Key];
      continue;
    }

    Current[Key].plays += Next[Key].plays;
    Current[Key].totalMs += Next[Key].totalMs;
  }
}

export function MergeSpotifyHistory(Current, Next) {
  if (!Next) return Current;
  if (!Current) return Next;

  Current.totalMs += Next.totalMs;
  Current.totalPlays += Next.totalPlays;
  MergeHistoryEntries(Current.tracks, Next.tracks);
  MergeHistoryEntries(Current.artists, Next.artists);
  return Current;
}

export function StoreHistoryData(HistoryData) {
  localStorage.setItem(HistoryStorageKey, JSON.stringify(HistoryData));
}

export function GetStoredHistory() {
  try {
    const RawHistory = localStorage.getItem(HistoryStorageKey);
    return RawHistory ? JSON.parse(RawHistory) : null;
  } catch {
    return null;
  }
}

export function ClearStoredHistory() {
  localStorage.removeItem(HistoryStorageKey);
}

export function GenerateSampleHistory(TracksList) {
  const Records = [];
  const BaseTracks = TracksList?.length ? TracksList : [
    { name: 'Cruel Summer', artists: [{ name: 'Taylor Swift' }], duration_ms: 178000 },
    { name: 'Starboy', artists: [{ name: 'The Weeknd' }], duration_ms: 230000 },
    { name: 'As It Was', artists: [{ name: 'Harry Styles' }], duration_ms: 167000 },
    { name: 'Blinding Lights', artists: [{ name: 'The Weeknd' }], duration_ms: 200000 },
    { name: 'Espresso', artists: [{ name: 'Sabrina Carpenter' }], duration_ms: 175000 },
    { name: 'Greedy', artists: [{ name: 'Tate McRae' }], duration_ms: 131000 },
    { name: 'vampire', artists: [{ name: 'Olivia Rodrigo' }], duration_ms: 219000 },
    { name: 'Paint The Town Red', artists: [{ name: 'Doja Cat' }], duration_ms: 231000 },
  ];

  BaseTracks.forEach((Track, Index) => {
    const ArtistName = Track.artists?.[0]?.name || 'Artist';
    const Plays = Math.max(15, 280 - Index * 28 + Math.floor(Math.random() * 20));
    const Duration = Track.duration_ms || 180000;
    for (let PlayIndex = 0; PlayIndex < Plays; PlayIndex++) {
      Records.push({
        trackName: Track.name,
        artistName: ArtistName,
        msPlayed: Math.floor(Duration * (0.8 + Math.random() * 0.4))
      });
    }
  });

  return ParseSpotifyRecords(Records);
}
