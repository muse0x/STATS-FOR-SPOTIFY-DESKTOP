import './style.css';
import {
  defaultClientId,
  statsRedirectUri,
  defaultScopes,
  generateRandomString,
  generateCodeChallenge,
  exchangeCodeForToken,
  handleAuthCallback,
  getValidAccessToken,
  getCachedUser,
  logout,
  getCurrentUser,
  getTopTracks,
  getTopArtists,
  getRecentlyPlayed,
  createPlaylistWithTracks
} from './spotify.js';
import { mockUser, mockTracks, mockArtists, mockRecentlyPlayed } from './mockData.js';
import {
  formatListeningTime,
  parseSpotifyRecords,
  getStoredHistory,
  clearStoredHistory,
  generateSampleHistory
} from './historyParser.js';

const state = {
  isLoggedIn: false,
  isDemoMode: false,
  currentUser: null,
  activeTab: 'tracks',
  timeRange: 'short_term',
  loading: false,
  data: { tracks: [], artists: [], recent: [] },
  historyData: getStoredHistory(),
  isHistoryModalOpen: false
};

const appElement = document.getElementById('app');

const formatDuration = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

function formatTimeAgo(dateString) {
  const diffMinutes = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return diffHours < 24 ? `${diffHours}h ago` : `${Math.floor(diffHours / 24)}d ago`;
}

function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function calculateTopGenres(artists) {
  const counts = {};
  let total = 0;
  artists.forEach(artist => (artist.genres || []).forEach(genre => {
    counts[genre] = (counts[genre] || 0) + 1;
    total++;
  }));

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count, percentage: Math.round((count / (total || 1)) * 100) }));
}

async function loadData() {
  state.loading = true;
  render();

  try {
    if (state.isDemoMode) {
      await new Promise(resolve => setTimeout(resolve, 150));
      state.data.tracks = mockTracks[state.timeRange] || mockTracks.short_term;
      state.data.artists = mockArtists[state.timeRange] || mockArtists.short_term;
      state.data.recent = mockRecentlyPlayed;
    } else {
      const loaders = {
        tracks: async () => { state.data.tracks = (await getTopTracks(state.timeRange, 50)).items || []; },
        artists: async () => { state.data.artists = (await getTopArtists(state.timeRange, 50)).items || []; },
        genres: async () => { state.data.artists = (await getTopArtists(state.timeRange, 50)).items || []; },
        recent: async () => { state.data.recent = (await getRecentlyPlayed(50)).items || []; },
      };
      await loaders[state.activeTab]?.();
    }
  } catch (err) {
    console.error('Error fetching data:', err);
    showToast(`Failed to load stats: ${err.message}`, 'error');
  } finally {
    state.loading = false;
    render();
  }
}

async function handleCreatePlaylist() {
  if (state.isDemoMode) return showToast('Created Spotify Playlist "Top Tracks (4 Weeks)" [Demo Mode]');
  if (!state.currentUser || !state.data.tracks.length) return;

  const rangeLabels = { short_term: 'Last 4 Weeks', medium_term: 'Last 6 Months', long_term: 'All Time' };
  try {
    const playlist = await createPlaylistWithTracks(
      state.currentUser.id,
      `Top Tracks (${rangeLabels[state.timeRange] || 'Top'}) — Stats for Spotify`,
      state.data.tracks.map(track => track.uri).filter(Boolean)
    );
    showToast(`Created Playlist "${playlist.name}" with ${state.data.tracks.length} tracks!`);
  } catch (err) {
    showToast(`Failed to create playlist: ${err.message}`, 'error');
  }
}

const renderRank = (index) => `<span class="item-rank ${index < 3 ? `top-${index + 1}` : ''}">${index + 1}</span>`;

const tabRenderers = {
  tracks: () => `
    <div class="list-container">
      ${!state.data.tracks.length ? '<p style="color:var(--text-muted); padding:2rem; text-align:center;">No tracks found.</p>' : ''}
      ${state.data.tracks.map((track, index) => {
        const key = `${track.name.trim().toLowerCase()}___${track.artists?.[0]?.name?.trim().toLowerCase()}`;
        const stat = state.historyData?.tracks?.[key];
        return `
          <a class="list-item" href="${track.external_urls?.spotify || '#'}" target="_blank" rel="noreferrer">
            ${renderRank(index)}
            <img class="item-image" src="${track.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100'}" alt="${track.name}" />
            <div class="item-info">
              <div class="item-title">${track.name}</div>
              <div class="item-subtitle">${(track.artists || []).map(artist => artist.name).join(', ')}</div>
            </div>
            ${stat ? `
              <div class="item-extra-stats">
                <span class="stats-plays"><i class="fa-solid fa-play"></i> ${stat.plays} plays</span>
                <span class="stats-time"><i class="fa-regular fa-clock"></i> ${formatListeningTime(stat.totalMs)}</span>
              </div>
            ` : `
              <div class="item-extra">${formatDuration(track.duration_ms)}</div>
            `}
          </a>
        `;
      }).join('')}
    </div>
  `,
  artists: () => `
    <div class="list-container">
      ${!state.data.artists.length ? '<p style="color:var(--text-muted); padding:2rem; text-align:center;">No artists found.</p>' : ''}
      ${state.data.artists.map((artist, index) => {
        const stat = state.historyData?.artists?.[artist.name.trim().toLowerCase()];
        return `
          <a class="list-item" href="${artist.external_urls?.spotify || '#'}" target="_blank" rel="noreferrer">
            ${renderRank(index)}
            <img class="item-image circle" src="${artist.images?.[0]?.url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}" alt="${artist.name}" />
            <div class="item-info">
              <div class="item-title">${artist.name}</div>
              <div class="item-subtitle">${(artist.genres || []).slice(0, 3).map(genre => `<span class="item-genres-pill">${genre}</span>`).join('')}</div>
            </div>
            ${stat ? `
              <div class="item-extra-stats">
                <span class="stats-plays"><i class="fa-solid fa-play"></i> ${stat.plays} plays</span>
                <span class="stats-time"><i class="fa-regular fa-clock"></i> ${formatListeningTime(stat.totalMs)}</span>
              </div>
            ` : `
              <div class="item-extra"><i class="fa-solid fa-fire" style="color:var(--spotify-green); margin-right:4px;"></i>${artist.popularity || 0}%</div>
            `}
          </a>
        `;
      }).join('')}
    </div>
  `,
  genres: () => {
    const genres = calculateTopGenres(state.data.artists);
    return `
      <div class="genres-grid">
        ${!genres.length ? '<p style="color:var(--text-muted); padding:2rem; text-align:center;">No genres calculated.</p>' : ''}
        ${genres.map(genre => {
          let genreTotalMs = 0;
          if (state.historyData) {
            state.data.artists
              .filter(artist => (artist.genres || []).includes(genre.name))
              .forEach(artist => {
                const stat = state.historyData.artists?.[artist.name.trim().toLowerCase()];
                if (stat) genreTotalMs += stat.totalMs;
              });
          }
          return `
            <div class="genre-card">
              <div class="genre-header">
                <span class="genre-name">${genre.name}</span>
                <span class="genre-count">${genre.percentage}% ${genreTotalMs > 0 ? `• ${formatListeningTime(genreTotalMs)}` : ''}</span>
              </div>
              <div class="genre-bar-bg"><div class="genre-bar-fill" style="width:${Math.max(genre.percentage * 2, 8)}%;"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },
  recent: () => `
    <div class="list-container">
      ${!state.data.recent.length ? '<p style="color:var(--text-muted); padding:2rem; text-align:center;">No recently played tracks found.</p>' : ''}
      ${state.data.recent.map((item, index) => {
        const track = item.track || item;
        return `
          <a class="list-item" href="${track.external_urls?.spotify || '#'}" target="_blank" rel="noreferrer">
            <span class="item-rank">${index + 1}</span>
            <img class="item-image" src="${track.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100'}" alt="${track.name}" />
            <div class="item-info">
              <div class="item-title">${track.name}</div>
              <div class="item-subtitle">${(track.artists || []).map(artist => artist.name).join(', ')}</div>
            </div>
            <div class="item-extra played-time"><i class="fa-regular fa-clock"></i> ${formatTimeAgo(item.played_at || new Date())}</div>
          </a>
        `;
      }).join('')}
    </div>
  `
};

function renderNavbar() {
  const user = state.currentUser;
  return `
    <header class="navbar">
      <div class="nav-container">
        <a class="brand" id="brand-home">
          <i class="fa-brands fa-spotify"></i>
          <span>Stats for Spotify</span>
        </a>
        <div class="nav-actions">
          ${user ? `
            <button class="btn-secondary" id="btn-open-history" title="Import Streaming History for plays and listening time">
              <i class="fa-solid fa-file-arrow-up"></i> Import History
            </button>
            <div class="user-profile-badge">
              <img class="user-avatar" src="${user.images?.[0]?.url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50'}" alt="Avatar" />
              <span>${user.display_name || 'Spotify User'}</span>
            </div>
            <button class="btn-logout" id="btn-logout" title="Log out"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
          ` : `
            <button class="btn-secondary" id="btn-demo-mode"><i class="fa-solid fa-play"></i> Live Demo</button>
          `}
        </div>
      </div>
    </header>
  `;
}

function renderHistoryModal() {
  if (!state.isHistoryModalOpen) return '';
  return `
    <div class="modal-overlay" id="history-modal-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title"><i class="fa-solid fa-file-arrow-up"></i> Import Streaming History</h2>
          <button class="btn-modal-close" id="btn-close-modal"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="modal-steps">
          <p><strong>Step 1:</strong> Request your listening history directly from Spotify.</p>
          <a class="privacy-direct-link" id="link-spotify-privacy" href="https://www.spotify.com/account/privacy/" target="_blank">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Spotify Privacy Settings
          </a>
          <p style="margin-top:0.3rem;">Under <strong>Download your data</strong>, request <strong>Account data</strong> or <strong>Extended streaming history</strong>.</p>
          <p style="margin-top:0.5rem;"><strong>Step 2:</strong> Drop your downloaded <code>StreamingHistory*.json</code> or <code>endsong*.json</code> files below.</p>
        </div>

        <div class="dropzone" id="history-dropzone">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <p>Drop your JSON files here</p>
          <span>or click to browse from computer</span>
          <input type="file" id="file-history-input" multiple accept=".json" style="display:none;" />
        </div>

        <div class="modal-actions-row">
          <button class="btn-secondary" id="btn-scan-downloads"><i class="fa-solid fa-magnifying-glass"></i> Auto-Scan Downloads</button>
          <button class="btn-secondary" id="btn-load-sample"><i class="fa-solid fa-wand-magic-sparkles"></i> Load Sample Data</button>
        </div>
      </div>
    </div>
  `;
}

async function handleLogin() {
  const verifier = generateRandomString(64);
  localStorage.setItem('spsv_code_verifier', verifier);
  const challenge = await generateCodeChallenge(verifier);

  if (window.electronAPI?.openPopupAuth) {
    showToast('Đang kết nối Spotify...');
    try {
      const res = await window.electronAPI.openPopupAuth({ scopes: defaultScopes, challenge });
      if (res?.code) {
        showToast('Xác thực thành công! Đang tải profile...');
        await exchangeCodeForToken(res.code, statsRedirectUri, defaultClientId);
        state.isLoggedIn = true;
        state.currentUser = await getCurrentUser();
        await loadData();
        showToast(`Chào mừng, ${state.currentUser.display_name || 'Spotify User'}!`);
      }
    } catch (err) {
      showToast(`Đăng nhập bị hủy hoặc lỗi: ${err.message}`, 'error');
    }
    return;
  }

  const params = new URLSearchParams({
    client_id: defaultClientId,
    response_type: 'code',
    redirect_uri: statsRedirectUri,
    scope: defaultScopes,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function render() {
  if (!state.isLoggedIn && !state.isDemoMode) {
    appElement.innerHTML = `
      ${renderNavbar()}
      <main class="main-wrapper">
        <section class="hero-section">
          <h1 class="hero-title">Your personal <span class="highlight">Spotify</span> listening analytics.</h1>
          <p class="hero-desc">Discover your most-played tracks, favorite artists, top genres, and recently played songs with real-time analytics.</p>
          <div style="margin-bottom: 2.5rem;">
            <button class="btn-spotify-login" id="btn-login-spotify" style="font-size:1.15rem; padding:1.05rem 2.5rem;">
              <i class="fa-brands fa-spotify" style="font-size:1.4rem;"></i> Login with Spotify
            </button>
            <p class="demo-mode-tip" style="margin-top:1.5rem;">
              Or test drive with sample analytics: <button class="btn-demo-link" id="btn-trigger-demo">Click here to launch Interactive Demo Mode</button>.
            </p>
          </div>
        </section>
      </main>
    `;

    document.getElementById('btn-login-spotify')?.addEventListener('click', handleLogin);
    document.getElementById('btn-trigger-demo')?.addEventListener('click', activateDemo);
    document.getElementById('btn-demo-mode')?.addEventListener('click', activateDemo);
    return;
  }

  const isTimeframe = state.activeTab !== 'recent';
  const content = state.loading
    ? Array(10).fill('<div class="skeleton"></div>').join('')
    : (tabRenderers[state.activeTab]?.() || '');

  appElement.innerHTML = `
    ${renderNavbar()}
    <main class="main-wrapper">
      ${state.historyData ? `
        <div class="history-summary-banner">
          <div class="history-summary-info">
            <i class="fa-solid fa-chart-line"></i>
            <span>Total Streaming Time: <strong>${formatListeningTime(state.historyData.totalMs)}</strong> across <strong>${state.historyData.totalPlays.toLocaleString()}</strong> plays</span>
          </div>
          <div class="history-banner-actions">
            <button class="btn-history-small" id="btn-update-history"><i class="fa-solid fa-rotate"></i> Update Data</button>
            <button class="btn-history-small" id="btn-clear-history" title="Clear imported history data"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      ` : ''}

      <nav class="section-tabs">
        <button class="tab-btn ${state.activeTab === 'tracks' ? 'active' : ''}" data-tab="tracks"><i class="fa-solid fa-music"></i> Top Tracks</button>
        <button class="tab-btn ${state.activeTab === 'artists' ? 'active' : ''}" data-tab="artists"><i class="fa-solid fa-microphone"></i> Top Artists</button>
        <button class="tab-btn ${state.activeTab === 'genres' ? 'active' : ''}" data-tab="genres"><i class="fa-solid fa-chart-pie"></i> Top Genres</button>
        <button class="tab-btn ${state.activeTab === 'recent' ? 'active' : ''}" data-tab="recent"><i class="fa-solid fa-clock-rotate-left"></i> Recently Played</button>
      </nav>

      ${isTimeframe ? `
        <div class="timeframe-container">
          <div class="timeframe-group">
            <button class="timeframe-btn ${state.timeRange === 'short_term' ? 'active' : ''}" data-range="short_term">4 Weeks</button>
            <button class="timeframe-btn ${state.timeRange === 'medium_term' ? 'active' : ''}" data-range="medium_term">6 Months</button>
            <button class="timeframe-btn ${state.timeRange === 'long_term' ? 'active' : ''}" data-range="long_term">All Time</button>
          </div>
          <div class="action-buttons">
            ${state.activeTab === 'tracks' ? '<button class="btn-accent" id="btn-create-playlist"><i class="fa-solid fa-plus"></i> Create Playlist</button>' : ''}
            <button class="btn-secondary" id="btn-refresh"><i class="fa-solid fa-rotate-right"></i> Refresh</button>
          </div>
        </div>
      ` : ''}

      ${content}
    </main>
    ${renderHistoryModal()}
  `;

  attachEvents();
}

async function processJsonFiles(files) {
  const allRecords = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (Array.isArray(json)) allRecords.push(...json);
    } catch (e) {
      console.warn('Error reading file:', file.name, e);
    }
  }

  if (!allRecords.length) return showToast('No valid streaming records found', 'error');

  state.historyData = parseSpotifyRecords(allRecords);
  state.isHistoryModalOpen = false;
  render();
  showToast(`Imported ${state.historyData.totalPlays.toLocaleString()} plays (${formatListeningTime(state.historyData.totalMs)})!`);
}

function attachEvents() {
  document.getElementById('brand-home')?.addEventListener('click', () => {
    state.activeTab = 'tracks';
    loadData();
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    if (state.isDemoMode) {
      state.isDemoMode = false;
      state.currentUser = null;
      render();
      return;
    }
    logout();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      if (tab !== state.activeTab) {
        state.activeTab = tab;
        loadData();
      }
    });
  });

  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const range = e.currentTarget.dataset.range;
      if (range !== state.timeRange) {
        state.timeRange = range;
        loadData();
      }
    });
  });

  document.getElementById('btn-create-playlist')?.addEventListener('click', handleCreatePlaylist);
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    loadData();
    showToast('Stats reloaded from Spotify!');
  });

  const openModal = () => { state.isHistoryModalOpen = true; render(); };
  document.getElementById('btn-open-history')?.addEventListener('click', openModal);
  document.getElementById('btn-update-history')?.addEventListener('click', openModal);
  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    clearStoredHistory();
    state.historyData = null;
    render();
    showToast('Cleared imported streaming history');
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    state.isHistoryModalOpen = false;
    render();
  });

  document.getElementById('link-spotify-privacy')?.addEventListener('click', (e) => {
    e.preventDefault();
    const url = 'https://www.spotify.com/account/privacy/';
    if (window.electronAPI?.openExternalUrl) {
      window.electronAPI.openExternalUrl(url);
    } else {
      window.open(url, '_blank');
    }
  });

  document.getElementById('btn-scan-downloads')?.addEventListener('click', async () => {
    showToast('Scanning Downloads folder...');
    const res = await window.electronAPI?.scanDownloadsHistory?.();
    if (res?.records?.length) {
      state.historyData = parseSpotifyRecords(res.records);
      state.isHistoryModalOpen = false;
      render();
      showToast(`Found ${res.files.length} files in Downloads! Imported ${state.historyData.totalPlays.toLocaleString()} plays.`);
      return;
    }
    showToast('No Spotify JSON files found in Downloads', 'error');
  });

  document.getElementById('btn-load-sample')?.addEventListener('click', () => {
    state.historyData = generateSampleHistory(state.data.tracks, state.data.artists);
    state.isHistoryModalOpen = false;
    render();
    showToast(`Loaded sample listening history: ${state.historyData.totalPlays.toLocaleString()} plays (${formatListeningTime(state.historyData.totalMs)})!`);
  });

  const dropzone = document.getElementById('history-dropzone');
  const fileInput = document.getElementById('file-history-input');

  dropzone?.addEventListener('click', async () => {
    if (window.electronAPI?.selectHistoryFiles) {
      const res = await window.electronAPI.selectHistoryFiles();
      if (res?.records?.length) {
        state.historyData = parseSpotifyRecords(res.records);
        state.isHistoryModalOpen = false;
        render();
        showToast(`Imported ${state.historyData.totalPlays.toLocaleString()} plays from selected files!`);
      }
      return;
    }
    fileInput?.click();
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files?.length) processJsonFiles(Array.from(e.target.files));
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-active');
  });

  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');
    if (e.dataTransfer.files?.length) processJsonFiles(Array.from(e.dataTransfer.files));
  });
}

function activateDemo() {
  state.isDemoMode = true;
  state.currentUser = mockUser;
  state.activeTab = 'tracks';
  loadData();
  showToast('Welcome to Stats for Spotify Demo Mode!');
}

async function init() {
  const cachedUser = getCachedUser();
  if (cachedUser) {
    state.isLoggedIn = true;
    state.currentUser = cachedUser;
    render();
  }

  const tokenFromCallback = await handleAuthCallback();
  const token = tokenFromCallback || (await getValidAccessToken());
  if (token) {
    try {
      state.isLoggedIn = true;
      state.currentUser = await getCurrentUser();
      await loadData();
      return;
    } catch (e) {
      console.warn('Token check failed:', e);
      if (!cachedUser) state.isLoggedIn = false;
    }
  }

  if (!cachedUser) render();
}

init();
