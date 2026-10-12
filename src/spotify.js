export const defaultClientId = '2c07c58bb20c4f529f5e262b85b6b1ba';
export const statsRedirectUri = 'https://www.statsforspotify.com/login/callback';

export const DEFAULT_CLIENT_ID = defaultClientId;
export const STATS_REDIRECT_URI = statsRedirectUri;

const tokenKey = 'spsv_access_token';
const refreshKey = 'spsv_refresh_token';
const expiryKey = 'spsv_token_expiry';
const verifierKey = 'spsv_code_verifier';
const userCacheKey = 'spsv_cached_user';

export const defaultScopes = [
  'user-top-read',
  'user-read-recently-played',
  'user-read-private',
  'user-read-email',
  'playlist-modify-public',
  'playlist-modify-private'
].join(' ');

export const SCOPES = defaultScopes;

export function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, byte => chars[byte % chars.length]).join('');
}

export async function generateCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function exchangeCodeForToken(code, redirectUri = statsRedirectUri, customClientId = defaultClientId) {
  const verifier = localStorage.getItem(verifierKey);
  if (!verifier) throw new Error('Code verifier not found in localStorage');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: customClientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || data.error || 'Failed to exchange token');

  localStorage.setItem(tokenKey, data.access_token);
  if (data.refresh_token) localStorage.setItem(refreshKey, data.refresh_token);
  localStorage.setItem(expiryKey, String(Date.now() + data.expires_in * 1000));
  return data.access_token;
}

export async function refreshAccessToken(customClientId = defaultClientId) {
  const refreshToken = localStorage.getItem(refreshKey);
  if (!refreshToken) return null;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: customClientId,
      })
    });

    const data = await res.json();
    if (!data.access_token) return null;

    localStorage.setItem(tokenKey, data.access_token);
    if (data.refresh_token) localStorage.setItem(refreshKey, data.refresh_token);
    localStorage.setItem(expiryKey, String(Date.now() + data.expires_in * 1000));
    return data.access_token;
  } catch {
    return null;
  }
}

export async function handleAuthCallback() {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) return null;

  try {
    const token = await exchangeCodeForToken(code, statsRedirectUri, defaultClientId);
    window.history.replaceState({}, document.title, window.location.pathname);
    return token;
  } catch (err) {
    console.error('Callback auth error:', err);
    return null;
  }
}

export function getAccessToken() {
  const token = localStorage.getItem(tokenKey);
  const expiry = Number(localStorage.getItem(expiryKey) || 0);
  return token && Date.now() < expiry ? token : null;
}

export async function getValidAccessToken() {
  const token = getAccessToken();
  if (token) return token;
  return refreshAccessToken();
}

export function getCachedUser() {
  try {
    const raw = localStorage.getItem(userCacheKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user) {
  if (user) localStorage.setItem(userCacheKey, JSON.stringify(user));
}

export function logout() {
  [tokenKey, refreshKey, expiryKey, verifierKey, userCacheKey].forEach(key => localStorage.removeItem(key));
  window.location.reload();
}

async function fetchSpotifyApi(endpoint) {
  let token = await getValidAccessToken();
  if (!token) throw new Error('Not authenticated');

  let res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (res.status === 401) {
    token = await refreshAccessToken();
    if (token) {
      res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    }
  }

  if (res.status === 401) {
    logout();
    throw new Error('Spotify session expired. Please re-login.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Spotify API error: ${res.status}`);
  }

  return res.json();
}

export const getCurrentUser = async () => {
  const user = await fetchSpotifyApi('/me');
  setCachedUser(user);
  return user;
};

export const getTopTracks = (timeRange = 'short_term', limit = 50) => fetchSpotifyApi(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`);
export const getTopArtists = (timeRange = 'short_term', limit = 50) => fetchSpotifyApi(`/me/top/artists?time_range=${timeRange}&limit=${limit}`);
export const getRecentlyPlayed = (limit = 50) => fetchSpotifyApi(`/me/player/recently-played?limit=${limit}`);

export async function createPlaylistWithTracks(userId, name, uris) {
  const token = await getValidAccessToken();
  const res = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: 'Created with Stats for Spotify Desktop App', public: false })
  });

  if (!res.ok) throw new Error('Could not create playlist');
  const playlist = await res.json();

  if (uris?.length) {
    await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: uris.slice(0, 100) })
    });
  }

  return playlist;
}
