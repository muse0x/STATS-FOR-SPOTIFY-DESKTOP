export const DefaultClientId = '2c07c58bb20c4f529f5e262b85b6b1ba';
export const StatsRedirectUri = 'https://www.statsforspotify.com/login/callback';

const TokenKey = 'spsv_access_token';
const RefreshKey = 'spsv_refresh_token';
const ExpiryKey = 'spsv_token_expiry';
const VerifierKey = 'spsv_code_verifier';
const UserCacheKey = 'spsv_cached_user';

export const DefaultScopes = [
  'user-top-read',
  'user-read-recently-played',
  'user-read-private',
  'user-read-email',
  'playlist-modify-public',
  'playlist-modify-private'
].join(' ');

export function GenerateRandomString(Length) {
  const Characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const RandomBytes = crypto.getRandomValues(new Uint8Array(Length));
  return Array.from(RandomBytes, Byte => Characters[Byte % Characters.length]).join('');
}

export async function GenerateCodeChallenge(Verifier) {
  const Digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(Verifier));
  return btoa(String.fromCharCode(...new Uint8Array(Digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function ExchangeCodeForToken(Code, RedirectUri = StatsRedirectUri, CustomClientId = DefaultClientId) {
  const Verifier = localStorage.getItem(VerifierKey);
  if (!Verifier) throw new Error('Code verifier not found in localStorage');

  const Response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CustomClientId,
      grant_type: 'authorization_code',
      code: Code,
      redirect_uri: RedirectUri,
      code_verifier: Verifier,
    }),
  });

  const Data = await Response.json();
  if (!Data.access_token) throw new Error(Data.error_description || Data.error || 'Failed to exchange token');

  localStorage.setItem(TokenKey, Data.access_token);
  if (Data.refresh_token) localStorage.setItem(RefreshKey, Data.refresh_token);
  localStorage.setItem(ExpiryKey, String(Date.now() + Data.expires_in * 1000));
  return Data.access_token;
}

export async function RefreshAccessToken(CustomClientId = DefaultClientId) {
  const RefreshToken = localStorage.getItem(RefreshKey);
  if (!RefreshToken) return null;

  try {
    const Response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: RefreshToken,
        client_id: CustomClientId,
      })
    });

    const Data = await Response.json();
    if (!Data.access_token) return null;

    localStorage.setItem(TokenKey, Data.access_token);
    if (Data.refresh_token) localStorage.setItem(RefreshKey, Data.refresh_token);
    localStorage.setItem(ExpiryKey, String(Date.now() + Data.expires_in * 1000));
    return Data.access_token;
  } catch {
    return null;
  }
}

export async function HandleAuthCallback() {
  const Code = new URLSearchParams(window.location.search).get('code');
  if (!Code) return null;

  try {
    const Token = await ExchangeCodeForToken(Code, StatsRedirectUri, DefaultClientId);
    window.history.replaceState({}, document.title, window.location.pathname);
    return Token;
  } catch (Error) {
    console.error('Callback auth error:', Error);
    return null;
  }
}

function GetAccessToken() {
  const Token = localStorage.getItem(TokenKey);
  const Expiry = Number(localStorage.getItem(ExpiryKey) || 0);
  return Token && Date.now() < Expiry ? Token : null;
}

export async function GetValidAccessToken() {
  const Token = GetAccessToken();
  if (Token) return Token;
  return RefreshAccessToken();
}

export function GetCachedUser() {
  try {
    const RawUser = localStorage.getItem(UserCacheKey);
    return RawUser ? JSON.parse(RawUser) : null;
  } catch {
    return null;
  }
}

function SetCachedUser(User) {
  if (User) localStorage.setItem(UserCacheKey, JSON.stringify(User));
}

export function Logout() {
  [TokenKey, RefreshKey, ExpiryKey, VerifierKey, UserCacheKey].forEach(Key => localStorage.removeItem(Key));
  window.location.reload();
}

async function FetchSpotifyApi(Endpoint) {
  let Token = await GetValidAccessToken();
  if (!Token) throw new Error('Not authenticated');

  let Response = await fetch(`https://api.spotify.com/v1${Endpoint}`, {
    headers: { Authorization: `Bearer ${Token}` }
  });

  if (Response.status === 401) {
    Token = await RefreshAccessToken();
    if (Token) {
      Response = await fetch(`https://api.spotify.com/v1${Endpoint}`, {
        headers: { Authorization: `Bearer ${Token}` }
      });
    }
  }

  if (Response.status === 401) {
    Logout();
    throw new Error('Spotify session expired. Please re-login.');
  }

  if (!Response.ok) {
    const ErrorData = await Response.json().catch(() => ({}));
    throw new Error(ErrorData.error?.message || `Spotify API error: ${Response.status}`);
  }

  return Response.json();
}

export const GetCurrentUser = async () => {
  const User = await FetchSpotifyApi('/me');
  SetCachedUser(User);
  return User;
};

export const GetTopTracks = (TimeRange = 'short_term', Limit = 50) => FetchSpotifyApi(`/me/top/tracks?time_range=${TimeRange}&limit=${Limit}`);
export const GetTopArtists = (TimeRange = 'short_term', Limit = 50) => FetchSpotifyApi(`/me/top/artists?time_range=${TimeRange}&limit=${Limit}`);
export const GetRecentlyPlayed = (Limit = 50) => FetchSpotifyApi(`/me/player/recently-played?limit=${Limit}`);

export async function CreatePlaylistWithTracks(UserId, PlaylistName, TrackUris) {
  const Token = await GetValidAccessToken();
  const Response = await fetch(`https://api.spotify.com/v1/users/${UserId}/playlists`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: PlaylistName, description: 'Created with Stats for Spotify Desktop App', public: false })
  });

  if (!Response.ok) throw new Error('Could not create playlist');
  const Playlist = await Response.json();

  if (TrackUris?.length) {
    await fetch(`https://api.spotify.com/v1/playlists/${Playlist.id}/tracks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: TrackUris.slice(0, 100) })
    });
  }

  return Playlist;
}
