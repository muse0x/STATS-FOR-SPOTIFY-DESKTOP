import './style.css';
import {
  DefaultClientId,
  StatsRedirectUri,
  DefaultScopes,
  GenerateRandomString,
  GenerateCodeChallenge,
  ExchangeCodeForToken,
  HandleAuthCallback,
  GetValidAccessToken,
  GetCachedUser,
  Logout,
  GetCurrentUser,
  GetTopTracks,
  GetTopArtists,
  GetRecentlyPlayed,
  CreatePlaylistWithTracks
} from './spotify.js';
import { MockUser, MockTracks, MockArtists, MockRecentlyPlayed } from './mockData.js';
import {
  FormatListeningTime,
  GetStoredHistory,
  StoreHistoryData,
  ClearStoredHistory,
  GenerateSampleHistory
} from './historyParser.js';

const State = {
  IsLoggedIn: false,
  IsDemoMode: false,
  CurrentUser: null,
  ActiveTab: 'tracks',
  TimeRange: 'short_term',
  Loading: false,
  Data: { Tracks: [], Artists: [], Recent: [] },
  HistoryData: GetStoredHistory(),
  IsHistoryModalOpen: false,
  HistoryImporting: false
};

const AppElement = document.getElementById('app');
const DataCache = new Map();
let DataLoadRequestId = 0;

const FormatDuration = (Milliseconds) => `${Math.floor(Milliseconds / 60000)}:${String(Math.floor((Milliseconds % 60000) / 1000)).padStart(2, '0')}`;

function FormatTimeAgo(DateString) {
  const DiffMinutes = Math.floor((Date.now() - new Date(DateString).getTime()) / 60000);
  if (DiffMinutes < 1) return 'Just now';
  if (DiffMinutes < 60) return `${DiffMinutes}m ago`;
  const DiffHours = Math.floor(DiffMinutes / 60);
  return DiffHours < 24 ? `${DiffHours}h ago` : `${Math.floor(DiffHours / 24)}d ago`;
}

function ShowToast(Message, Type = 'success') {
  let Container = document.querySelector('.toast-container');
  if (!Container) {
    Container = document.createElement('div');
    Container.className = 'toast-container';
    document.body.appendChild(Container);
  }
  const Toast = document.createElement('div');
  Toast.className = `toast ${Type}`;
  Toast.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
  const ToastMessage = document.createElement('span');
  ToastMessage.textContent = Message;
  Toast.appendChild(ToastMessage);
  Container.appendChild(Toast);
  setTimeout(() => Toast.remove(), 4000);
}

function EscapeHtml(Value) {
  return String(Value ?? '').replace(/[&<>"']/g, Character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[Character]);
}

function SafeExternalUrl(Value) {
  try {
    const Url = new URL(Value);
    return Url.protocol === 'https:' ? Url.href : '#';
  } catch {
    return '#';
  }
}

function CalculateTopGenres(Artists) {
  const Counts = Object.create(null);
  let Total = 0;
  Artists.forEach(Artist => (Artist.genres || []).forEach(Genre => {
    Counts[Genre] = (Counts[Genre] || 0) + 1;
    Total++;
  }));

  return Object.entries(Counts)
    .sort((LeftGenre, RightGenre) => RightGenre[1] - LeftGenre[1])
    .slice(0, 15)
    .map(([Name, Count]) => ({ Name, Count, Percentage: Math.round((Count / (Total || 1)) * 100) }));
}

async function LoadData({ Force = false } = {}) {
  const RequestId = ++DataLoadRequestId;
  const Tab = State.ActiveTab;
  const DataKey = Tab === 'recent'
    ? 'recent'
    : `${Tab === 'tracks' ? 'tracks' : 'artists'}:${State.TimeRange}`;
  const CacheKey = `${State.IsDemoMode ? 'demo' : 'spotify'}:${DataKey}`;
  const DataProperty = { tracks: 'Tracks', artists: 'Artists', genres: 'Artists', recent: 'Recent' }[Tab];

  if (!Force && DataCache.has(CacheKey)) {
    State.Data[DataProperty] = DataCache.get(CacheKey);
    State.Loading = false;
    Render();
    return true;
  }

  State.Loading = true;
  Render();

  try {
    if (State.IsDemoMode) await new Promise(Resolve => setTimeout(Resolve, 150));

    const Loaders = State.IsDemoMode ? {
      tracks: () => MockTracks[State.TimeRange] || MockTracks.short_term,
      artists: () => MockArtists[State.TimeRange] || MockArtists.short_term,
      genres: () => MockArtists[State.TimeRange] || MockArtists.short_term,
      recent: () => MockRecentlyPlayed
    } : {
      tracks: () => GetTopTracks(State.TimeRange, 50),
      artists: () => GetTopArtists(State.TimeRange, 50),
      genres: () => GetTopArtists(State.TimeRange, 50),
      recent: () => GetRecentlyPlayed(50)
    };
    const Response = await Loaders[Tab]();
    const Items = State.IsDemoMode ? Response : Response?.items || [];

    if (RequestId !== DataLoadRequestId) return false;
    DataCache.set(CacheKey, Items);
    State.Data[DataProperty] = Items;
    return true;
  } catch (RequestError) {
    if (RequestId !== DataLoadRequestId) return false;
    console.error('Error fetching data:', RequestError);
    ShowToast(`Failed to load stats: ${RequestError.message}`, 'error');
    return false;
  } finally {
    if (RequestId === DataLoadRequestId) {
      State.Loading = false;
      Render();
    }
  }
}

async function HandleCreatePlaylist() {
  if (State.IsDemoMode) return ShowToast('Created Spotify Playlist "Top Tracks (4 Weeks)" [Demo Mode]');
  if (!State.CurrentUser || !State.Data.Tracks.length) return;

  const RangeLabels = { short_term: 'Last 4 Weeks', medium_term: 'Last 6 Months', long_term: 'All Time' };
  try {
    const Playlist = await CreatePlaylistWithTracks(
      State.CurrentUser.id,
      `Top Tracks (${RangeLabels[State.TimeRange] || 'Top'}) — Stats for Spotify`,
      State.Data.Tracks.map(Track => Track.uri).filter(Boolean)
    );
    ShowToast(`Created Playlist "${Playlist.name}" with ${State.Data.Tracks.length} tracks!`);
  } catch (RequestError) {
    ShowToast(`Failed to create playlist: ${RequestError.message}`, 'error');
  }
}

const RenderRank = (Index, Highlight = true) => `<span class="item-rank ${Highlight && Index < 3 ? `top-${Index + 1}` : ''}">${Index + 1}</span>`;

function RenderEmptyState(Message) {
  return `<p style="color:var(--text-muted); padding:2rem; text-align:center;">${EscapeHtml(Message)}</p>`;
}

function RenderHistoryStats(Stat) {
  return `
    <div class="item-extra-stats">
      <span class="stats-plays"><i class="fa-solid fa-play"></i> ${Stat.plays} plays</span>
      <span class="stats-time"><i class="fa-regular fa-clock"></i> ${FormatListeningTime(Stat.totalMs)}</span>
    </div>
  `;
}

function RenderListItem({ Url, ImageUrl, Name, Subtitle, Rank, ImageClass = 'item-image', Extra = '' }) {
  return `
    <a class="list-item" href="${EscapeHtml(SafeExternalUrl(Url))}" target="_blank" rel="noreferrer">
      ${Rank || ''}
      <img class="${ImageClass}" loading="lazy" decoding="async" src="${EscapeHtml(SafeExternalUrl(ImageUrl))}" alt="${EscapeHtml(Name)}" />
      <div class="item-info">
        <div class="item-title">${EscapeHtml(Name)}</div>
        <div class="item-subtitle">${Subtitle}</div>
      </div>
      ${Extra}
    </a>
  `;
}

const TabRenderers = {
  tracks: () => `
    <div class="list-container">
      ${State.Data.Tracks.length ? '' : RenderEmptyState('No tracks found.')}
      ${State.Data.Tracks.map((Track, Index) => {
        const TrackKey = `${Track.name.trim().toLowerCase()}___${Track.artists?.[0]?.name?.trim().toLowerCase()}`;
        const Stat = State.HistoryData?.tracks?.[TrackKey];
        const Extra = Stat ? RenderHistoryStats(Stat) : `<div class="item-extra">${FormatDuration(Track.duration_ms)}</div>`;
        return RenderListItem({
          Url: Track.external_urls?.spotify,
          ImageUrl: Track.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100',
          Name: Track.name,
          Subtitle: (Track.artists || []).map(Artist => EscapeHtml(Artist.name)).join(', '),
          Rank: RenderRank(Index),
          Extra
        });
      }).join('')}
    </div>
  `,
  artists: () => `
    <div class="list-container">
      ${State.Data.Artists.length ? '' : RenderEmptyState('No artists found.')}
      ${State.Data.Artists.map((Artist, Index) => {
        const Stat = State.HistoryData?.artists?.[Artist.name.trim().toLowerCase()];
        const Extra = Stat
          ? RenderHistoryStats(Stat)
          : `<div class="item-extra"><i class="fa-solid fa-fire" style="color:var(--spotify-green); margin-right:4px;"></i>${Artist.popularity || 0}%</div>`;
        return RenderListItem({
          Url: Artist.external_urls?.spotify,
          ImageUrl: Artist.images?.[0]?.url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
          Name: Artist.name,
          Subtitle: (Artist.genres || []).slice(0, 3).map(Genre => `<span class="item-genres-pill">${EscapeHtml(Genre)}</span>`).join(''),
          Rank: RenderRank(Index),
          ImageClass: 'item-image circle',
          Extra
        });
      }).join('')}
    </div>
  `,
  genres: () => {
    const Genres = CalculateTopGenres(State.Data.Artists);
    return `
      <div class="genres-grid">
        ${Genres.length ? '' : RenderEmptyState('No genres calculated.')}
        ${Genres.map(Genre => {
          const GenreTotalMs = State.HistoryData
            ? State.Data.Artists
              .filter(Artist => (Artist.genres || []).includes(Genre.Name))
              .reduce((Total, Artist) => Total + (State.HistoryData.artists?.[Artist.name.trim().toLowerCase()]?.totalMs || 0), 0)
            : 0;
          return `
            <div class="genre-card">
              <div class="genre-header">
                <span class="genre-name">${EscapeHtml(Genre.Name)}</span>
                <span class="genre-count">${Genre.Percentage}% ${GenreTotalMs ? `• ${FormatListeningTime(GenreTotalMs)}` : ''}</span>
              </div>
              <div class="genre-bar-bg"><div class="genre-bar-fill" style="width:${Math.max(Genre.Percentage * 2, 8)}%;"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },
  recent: () => `
    <div class="list-container">
      ${State.Data.Recent.length ? '' : RenderEmptyState('No recently played tracks found.')}
      ${State.Data.Recent.map((Item, Index) => {
        const Track = Item.track || Item;
        return RenderListItem({
          Url: Track.external_urls?.spotify,
          ImageUrl: Track.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100',
          Name: Track.name,
          Subtitle: (Track.artists || []).map(Artist => EscapeHtml(Artist.name)).join(', '),
          Rank: RenderRank(Index, false),
          Extra: `<div class="item-extra played-time"><i class="fa-regular fa-clock"></i> ${FormatTimeAgo(Item.played_at || new Date())}</div>`
        });
      }).join('')}
    </div>
  `
};

function RenderNavbar() {
  const User = State.CurrentUser;
  return `
    <header class="navbar">
      <div class="nav-container">
        <a class="brand" id="brand-home">
          <i class="fa-brands fa-spotify"></i>
          <span>Stats for Spotify</span>
        </a>
        <div class="nav-actions">
          ${User ? `
            <button class="btn-secondary" id="btn-open-history" title="Import Streaming History for plays and listening time">
              <i class="fa-solid fa-file-arrow-up"></i> Import History
            </button>
            <div class="user-profile-badge">
              <img class="user-avatar" src="${EscapeHtml(SafeExternalUrl(User.images?.[0]?.url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50'))}" alt="Avatar" />
              <span>${EscapeHtml(User.display_name || 'Spotify User')}</span>
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

function RenderHistoryModal() {
  if (!State.IsHistoryModalOpen) return '';
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

async function HandleLogin() {
  const Verifier = GenerateRandomString(64);
  localStorage.setItem('spsv_code_verifier', Verifier);
  const Challenge = await GenerateCodeChallenge(Verifier);

  if (window.electronAPI?.openPopupAuth) {
    ShowToast('Đang kết nối Spotify...');
    try {
      const AuthResult = await window.electronAPI.openPopupAuth({ scopes: DefaultScopes, challenge: Challenge });
      if (AuthResult?.code) {
        ShowToast('Xác thực thành công! Đang tải profile...');
        await ExchangeCodeForToken(AuthResult.code, StatsRedirectUri, DefaultClientId);
        State.IsLoggedIn = true;
        State.CurrentUser = await GetCurrentUser();
        await LoadData();
        ShowToast(`Chào mừng, ${State.CurrentUser.display_name || 'Spotify User'}!`);
      }
    } catch (RequestError) {
      ShowToast(`Đăng nhập bị hủy hoặc lỗi: ${RequestError.message}`, 'error');
    }
    return;
  }

  const Params = new URLSearchParams({
    client_id: DefaultClientId,
    response_type: 'code',
    redirect_uri: StatsRedirectUri,
    scope: DefaultScopes,
    code_challenge_method: 'S256',
    code_challenge: Challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${Params.toString()}`;
}

function Render() {
  if (!State.IsLoggedIn && !State.IsDemoMode) {
    AppElement.innerHTML = `
      ${RenderNavbar()}
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

    document.getElementById('btn-login-spotify')?.addEventListener('click', HandleLogin);
    document.getElementById('btn-trigger-demo')?.addEventListener('click', ActivateDemo);
    document.getElementById('btn-demo-mode')?.addEventListener('click', ActivateDemo);
    return;
  }

  const IsTimeframe = State.ActiveTab !== 'recent';
  const Content = State.Loading
    ? Array(10).fill('<div class="skeleton"></div>').join('')
    : (TabRenderers[State.ActiveTab]?.() || '');

  AppElement.innerHTML = `
    ${RenderNavbar()}
    <main class="main-wrapper">
      ${State.HistoryData ? `
        <div class="history-summary-banner">
          <div class="history-summary-info">
            <i class="fa-solid fa-chart-line"></i>
            <span>Total Streaming Time: <strong>${FormatListeningTime(State.HistoryData.totalMs)}</strong> across <strong>${State.HistoryData.totalPlays.toLocaleString()}</strong> plays</span>
          </div>
          <div class="history-banner-actions">
            <button class="btn-history-small" id="btn-update-history"><i class="fa-solid fa-rotate"></i> Update Data</button>
            <button class="btn-history-small" id="btn-clear-history" title="Clear imported history data"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      ` : ''}

      <nav class="section-tabs">
        <button class="tab-btn ${State.ActiveTab === 'tracks' ? 'active' : ''}" data-tab="tracks"><i class="fa-solid fa-music"></i> Top Tracks</button>
        <button class="tab-btn ${State.ActiveTab === 'artists' ? 'active' : ''}" data-tab="artists"><i class="fa-solid fa-microphone"></i> Top Artists</button>
        <button class="tab-btn ${State.ActiveTab === 'genres' ? 'active' : ''}" data-tab="genres"><i class="fa-solid fa-chart-pie"></i> Top Genres</button>
        <button class="tab-btn ${State.ActiveTab === 'recent' ? 'active' : ''}" data-tab="recent"><i class="fa-solid fa-clock-rotate-left"></i> Recently Played</button>
      </nav>

      ${IsTimeframe ? `
        <div class="timeframe-container">
          <div class="timeframe-group">
            <button class="timeframe-btn ${State.TimeRange === 'short_term' ? 'active' : ''}" data-range="short_term">4 Weeks</button>
            <button class="timeframe-btn ${State.TimeRange === 'medium_term' ? 'active' : ''}" data-range="medium_term">6 Months</button>
            <button class="timeframe-btn ${State.TimeRange === 'long_term' ? 'active' : ''}" data-range="long_term">All Time</button>
          </div>
          <div class="action-buttons">
            ${State.ActiveTab === 'tracks' ? '<button class="btn-accent" id="btn-create-playlist"><i class="fa-solid fa-plus"></i> Create Playlist</button>' : ''}
            <button class="btn-secondary" id="btn-refresh"><i class="fa-solid fa-rotate-right"></i> Refresh</button>
          </div>
        </div>
      ` : ''}

      ${Content}
    </main>
    ${RenderHistoryModal()}
  `;

  AttachEvents();
}

function ParseBrowserHistoryFiles(Files) {
  return new Promise((Resolve, Reject) => {
    const HistoryWorker = new Worker(new URL('./historyWorker.js', import.meta.url), { type: 'module' });

    HistoryWorker.addEventListener('message', ({ data: Data }) => {
      HistoryWorker.terminate();
      Resolve(Data);
    }, { once: true });
    HistoryWorker.addEventListener('error', ErrorEvent => {
      HistoryWorker.terminate();
      Reject(new Error(ErrorEvent.message || 'History worker failed'));
    }, { once: true });
    HistoryWorker.addEventListener('messageerror', () => {
      HistoryWorker.terminate();
      Reject(new Error('History worker returned invalid data'));
    }, { once: true });

    HistoryWorker.postMessage({ files: Files });
  });
}

function SaveHistoryData(HistoryData) {
  State.HistoryData = HistoryData;
  try {
    StoreHistoryData(HistoryData);
    return true;
  } catch (StorageError) {
    console.error('Failed to store Spotify history:', StorageError);
    return false;
  }
}

async function ImportHistory(LoadResult, SuccessMessage) {
  if (State.HistoryImporting) return ShowToast('A history import is already in progress', 'error');

  State.HistoryImporting = true;
  ShowToast('Processing Spotify history in the background...');
  try {
    const Result = await LoadResult();
    if (!Result) return;
    if (Result?.error) throw new Error(Result.error);
    if (!Result?.historyData?.totalPlays) return ShowToast('No valid streaming records found', 'error');

    const Saved = SaveHistoryData(Result.historyData);
    State.IsHistoryModalOpen = false;
    Render();
    ShowToast(`${SuccessMessage(Result)}${Saved ? '' : ' History is available for this session but could not be saved.'}`, Saved ? 'success' : 'error');
  } catch (ImportError) {
    console.error('Failed to import Spotify history:', ImportError);
    ShowToast('Failed to import Spotify history. Check the selected JSON files and try again.', 'error');
  } finally {
    State.HistoryImporting = false;
  }
}

function ProcessJsonFiles(Files) {
  return ImportHistory(() => ParseBrowserHistoryFiles(Files), Result =>
    `Imported ${Result.historyData.totalPlays.toLocaleString()} plays (${FormatListeningTime(Result.historyData.totalMs)})!`
  );
}

function AttachEvents() {
  document.getElementById('brand-home')?.addEventListener('click', () => {
    State.ActiveTab = 'tracks';
    LoadData();
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    if (State.IsDemoMode) {
      State.IsDemoMode = false;
      State.CurrentUser = null;
      DataLoadRequestId++;
      State.Loading = false;
      Render();
      return;
    }
    Logout();
  });

  document.querySelectorAll('.tab-btn').forEach(Button => {
    Button.addEventListener('click', (Event) => {
      const Tab = Event.currentTarget.dataset.tab;
      if (Tab !== State.ActiveTab) {
        State.ActiveTab = Tab;
        LoadData();
      }
    });
  });

  document.querySelectorAll('.timeframe-btn').forEach(Button => {
    Button.addEventListener('click', (Event) => {
      const Range = Event.currentTarget.dataset.range;
      if (Range !== State.TimeRange) {
        State.TimeRange = Range;
        LoadData();
      }
    });
  });

  document.getElementById('btn-create-playlist')?.addEventListener('click', HandleCreatePlaylist);
  document.getElementById('btn-refresh')?.addEventListener('click', async () => {
    const Reloaded = await LoadData({ Force: true });
    if (Reloaded) ShowToast('Stats reloaded from Spotify!');
  });

  const OpenModal = () => { State.IsHistoryModalOpen = true; Render(); };
  document.getElementById('btn-open-history')?.addEventListener('click', OpenModal);
  document.getElementById('btn-update-history')?.addEventListener('click', OpenModal);
  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    ClearStoredHistory();
    State.HistoryData = null;
    Render();
    ShowToast('Cleared imported streaming history');
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    State.IsHistoryModalOpen = false;
    Render();
  });

  document.getElementById('link-spotify-privacy')?.addEventListener('click', (Event) => {
    Event.preventDefault();
    const Url = 'https://www.spotify.com/account/privacy/';
    if (window.electronAPI?.openExternalUrl) {
      window.electronAPI.openExternalUrl(Url);
    } else {
      window.open(Url, '_blank');
    }
  });

  document.getElementById('btn-scan-downloads')?.addEventListener('click', async () => {
    await ImportHistory(
      () => window.electronAPI?.scanDownloadsHistory?.(),
      Result => `Found ${Result.files.length} files in Downloads! Imported ${Result.historyData.totalPlays.toLocaleString()} plays.`
    );
  });

  document.getElementById('btn-load-sample')?.addEventListener('click', () => {
    SaveHistoryData(GenerateSampleHistory(State.Data.Tracks));
    State.IsHistoryModalOpen = false;
    Render();
    ShowToast(`Loaded sample listening history: ${State.HistoryData.totalPlays.toLocaleString()} plays (${FormatListeningTime(State.HistoryData.totalMs)})!`);
  });

  const Dropzone = document.getElementById('history-dropzone');
  const FileInput = document.getElementById('file-history-input');

  Dropzone?.addEventListener('click', async () => {
    if (window.electronAPI?.selectHistoryFiles) {
      await ImportHistory(
        () => window.electronAPI.selectHistoryFiles(),
        Result => `Imported ${Result.historyData.totalPlays.toLocaleString()} plays from ${Result.files.length} files!`
      );
      return;
    }
    FileInput?.click();
  });

  FileInput?.addEventListener('change', (Event) => {
    if (Event.target.files?.length) ProcessJsonFiles(Array.from(Event.target.files));
  });

  Dropzone?.addEventListener('dragover', (Event) => {
    Event.preventDefault();
    Dropzone.classList.add('drag-active');
  });

  Dropzone?.addEventListener('dragleave', () => Dropzone.classList.remove('drag-active'));
  Dropzone?.addEventListener('drop', (Event) => {
    Event.preventDefault();
    Dropzone.classList.remove('drag-active');
    if (Event.dataTransfer.files?.length) ProcessJsonFiles(Array.from(Event.dataTransfer.files));
  });
}

function ActivateDemo() {
  State.IsDemoMode = true;
  State.CurrentUser = MockUser;
  State.ActiveTab = 'tracks';
  LoadData();
  ShowToast('Welcome to Stats for Spotify Demo Mode!');
}

async function InitializeApp() {
  const CachedUser = GetCachedUser();
  if (CachedUser) {
    State.IsLoggedIn = true;
    State.CurrentUser = CachedUser;
    Render();
  }

  const TokenFromCallback = await HandleAuthCallback();
  const Token = TokenFromCallback || (await GetValidAccessToken());
  if (Token) {
    try {
      State.IsLoggedIn = true;
      State.CurrentUser = await GetCurrentUser();
      await LoadData();
      return;
    } catch (AuthError) {
      console.warn('Token check failed:', AuthError);
      if (!CachedUser) State.IsLoggedIn = false;
    }
  }

  if (!CachedUser) Render();
}

InitializeApp();
