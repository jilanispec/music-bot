
/* =========================================
   TANANG MUSIC - STANDALONE ANDROID APP
   Complete miniapp/app.js replacement
========================================= */

// -------------------------
// CONFIGURATION
// -------------------------

const API_BASE = "https://draft-bot-wp2s.onrender.com";

const $ = id => document.getElementById(id);

const STORAGE = {
  token: "tanang_auth_token",
  queue: "tanang_queue",
  room: "tanang_room_id"
};

let AUTH_TOKEN = localStorage.getItem(STORAGE.token) || "";

let player = null;
let playerReady = false;
let pendingVideoId = null;

let currentPlayMode = "audio";
let currentIndex = -1;
let lastRoomSongId = null;

let isSeeking = false;
let shuffleEnabled = false;
let zoomLevel = 1;

let progressTimer = null;
let roomRefreshTimer = null;

let queue = [];
let playlists = [];
let searchResults = [];

// -------------------------
// AUTHENTICATION
// -------------------------

function setAuthToken(token) {
  AUTH_TOKEN = token || "";

  if (AUTH_TOKEN) {
    localStorage.setItem(STORAGE.token, AUTH_TOKEN);
  } else {
    localStorage.removeItem(STORAGE.token);
  }
}

function authHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };

  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }

  return headers;
}

async function apiRequest(path, options = {}) {
  if (!API_BASE || API_BASE.includes("YOUR-BACKEND")) {
    throw new Error("Configure your backend URL first.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    setAuthToken("");
    throw new Error("Login required. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(data.detail || `API error ${response.status}`);
  }

  return data;
}

// Example login function.
// Backend must provide POST /auth/login returning {access_token:"..."}

async function login(username, password) {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  if (!data.access_token) {
    throw new Error("Backend did not return an access token.");
  }

  setAuthToken(data.access_token);

  await initializeApp();

  return data;
}

function logout() {
  setAuthToken("");
  location.reload();
}

// -------------------------
// SONG NORMALIZATION
// -------------------------

function normalizeSong(song) {
  if (!song || typeof song !== "object") return null;

  const id = song.id || song.video_id;

  if (!id) return null;

  return {
    ...song,
    id: String(id),
    video_id: String(id),
    title: song.title || "Unknown title",
    channel: song.channel || "YouTube",
    thumbnail: song.thumbnail || "",
    duration: song.duration || "",
    url: song.url || `https://www.youtube.com/watch?v=${id}`,
    media_type: song.media_type || "music"
  };
}

// -------------------------
// LOCAL QUEUE STORAGE
// -------------------------

function saveQueue() {
  try {
    localStorage.setItem(STORAGE.queue, JSON.stringify(queue));
  } catch (error) {
    console.warn("Queue save failed:", error);
  }
}

function loadSavedQueue() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE.queue) || "[]"
    );

    queue = Array.isArray(saved)
      ? saved.map(normalizeSong).filter(Boolean)
      : [];
  } catch {
    queue = [];
  }
}

// -------------------------
// PLAYER MODE
// -------------------------

function applyPlaybackMode(mode) {
  currentPlayMode = mode === "video" ? "video" : "audio";

  const button = $("videoModeButton");

  if (button) {
    button.textContent = currentPlayMode === "audio"
      ? "WATCH VIDEO"
      : "SWITCH TO AUDIO";
  }

  document.body.classList.toggle(
    "audio-mode",
    currentPlayMode === "audio"
  );
}

function togglePlaybackMode() {
  applyPlaybackMode(
    currentPlayMode === "audio" ? "video" : "audio"
  );
}

// -------------------------
// PLAYER STYLES
// -------------------------

(function addPlayerStyles() {
  const style = document.createElement("style");

  style.textContent = `
    #videoFrame {
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      transition: max-height .25s ease;
    }

    #youtubePlayer {
      width: 100%;
      height: 100%;
    }

    body.audio-mode #videoFrame {
      max-height: 115px;
    }

    body:not(.audio-mode) #videoFrame {
      max-height: 600px;
    }

    .video-mode-button {
      width: 100%;
      margin-top: 14px;
      padding: 13px;
      border: 1px solid #e5bd25;
      border-radius: 12px;
      background: #e5bd25;
      color: #090909;
      font-weight: 800;
      cursor: pointer;
    }
  `;

  document.head.appendChild(style);
})();

// -------------------------
// NAVIGATION
// -------------------------

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageId
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.go);
  });
});

document.querySelector(".brand")?.addEventListener("click", event => {
  event.preventDefault();
  showPage("homePage");
});

// -------------------------
// YOUTUBE PLAYER
// -------------------------

window.onYouTubeIframeAPIReady = function () {
  playerReady = true;

  if (pendingVideoId) {
    const id = pendingVideoId;
    pendingVideoId = null;
    loadPlayer(id);
  }
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function updateProgress() {
  if (!player || isSeeking) return;

  try {
    const current = player.getCurrentTime() || 0;
    const duration = player.getDuration() || 0;

    $("seekBar").max = duration;
    $("seekBar").value = current;

    $("currentTime").textContent = formatTime(current);
    $("totalTime").textContent = formatTime(duration);
  } catch (error) {
    console.warn("Progress unavailable:", error);
  }
}

function startProgressTimer() {
  clearInterval(progressTimer);
  progressTimer = setInterval(updateProgress, 500);
}

function updatePlayButton(playing) {
  $("playPauseIcon").innerHTML = playing
    ? '<path d="M8 5h3v14H8zM15 5h3v14h-3z"/>'
    : '<path d="m8 5 12 7-12 7z"/>';
}

function loadPlayer(videoId) {
  if (!videoId) return;

  if (!playerReady || !window.YT?.Player) {
    pendingVideoId = videoId;

    $("playingStatus").textContent = "PLAYER LOADING";

    return;
  }

  $("videoPlaceholder").style.display = "none";
  $("playingStatus").textContent = "LOADING";

  if (player && typeof player.loadVideoById === "function") {
    player.loadVideoById(videoId);
    startProgressTimer();
    return;
  }

  player = new YT.Player("youtubePlayer", {
    videoId,

    playerVars: {
      playsinline: 1,
      controls: 1,
      rel: 0,
      fs: 1,
      enablejsapi: 1,
      origin: location.origin
    },

    events: {
      onReady: event => {
        event.target.playVideo();
        startProgressTimer();
      },

      onStateChange: event => {
        const state = event.data;

        const playing = state === YT.PlayerState.PLAYING;

        updatePlayButton(playing);

        $("playingStatus").textContent =
          playing ? "PLAYING" :
          state === YT.PlayerState.BUFFERING ? "BUFFERING" :
          state === YT.PlayerState.ENDED ? "ENDED" : "PAUSED";

        if (state === YT.PlayerState.ENDED) {
          playNext();
        }

        updateProgress();
      },

      onError: event => {
        $("playingStatus").textContent = "UNAVAILABLE";

        $("searchStatus").textContent =
          `YouTube playback error ${event.data}`;
      }
    }
  });
}

function playSong(rawSong) {
  const song = normalizeSong(rawSong);

  if (!song) return;

  $("currentTitle").textContent = song.title;
  $("currentChannel").textContent = song.channel;

  $("videoPlaceholder").style.display = "none";

  if (song.media_type === "video") {
    applyPlaybackMode("video");
  }

  loadPlayer(song.id);
}

function playFromQueue(index) {
  if (index < 0 || index >= queue.length) return;

  currentIndex = index;

  const song = normalizeSong(queue[index]);

  if (!song) return;

  lastRoomSongId = song.id;

  playSong(song);
  renderQueue();
}

function playNext() {
  if (!queue.length) return;

  if (shuffleEnabled && queue.length > 1) {
    let next = currentIndex;

    while (next === currentIndex) {
      next = Math.floor(Math.random() * queue.length);
    }

    playFromQueue(next);
    return;
  }

  if (currentIndex + 1 < queue.length) {
    playFromQueue(currentIndex + 1);
  } else {
    $("playingStatus").textContent = "QUEUE ENDED";
  }
}

function playPrevious() {
  if (!queue.length) return;

  if (
    player &&
    player.getCurrentTime &&
    player.getCurrentTime() > 3
  ) {
    player.seekTo(0, true);
    return;
  }

  if (currentIndex > 0) {
    playFromQueue(currentIndex - 1);
  }
}

// -------------------------
// PLAYER CONTROLS
// -------------------------

$("videoModeButton")?.addEventListener("click", togglePlaybackMode);

$("shuffleButton")?.addEventListener("click", () => {
  shuffleEnabled = !shuffleEnabled;

  $("shuffleButton").classList.toggle("active", shuffleEnabled);

  $("shuffleButton").setAttribute(
    "aria-pressed",
    String(shuffleEnabled)
  );
});

$("playPauseButton")?.addEventListener("click", () => {
  if (!player || !window.YT) return;

  if (player.getPlayerState() === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
});

$("previousButton")?.addEventListener("click", playPrevious);
$("nextButton")?.addEventListener("click", playNext);

$("seekBar")?.addEventListener("input", () => {
  isSeeking = true;

  $("currentTime").textContent =
    formatTime(Number($("seekBar").value));
});

$("seekBar")?.addEventListener("change", () => {
  if (player?.seekTo) {
    player.seekTo(Number($("seekBar").value), true);
  }

  isSeeking = false;

  updateProgress();
});

$("fullscreenButton")?.addEventListener("click", async () => {
  const frame = $("videoFrame");

  try {
    if (frame.requestFullscreen) {
      await frame.requestFullscreen();
    } else if (frame.webkitRequestFullscreen) {
      frame.webkitRequestFullscreen();
    } else {
      alert("Use the YouTube player's full-screen control.");
    }
  } catch (error) {
    console.error(error);
    alert("Full-screen unavailable.");
  }
});

// -------------------------
// ZOOM
// -------------------------

function applyZoom() {
  $("youtubePlayer").style.transform = `scale(${zoomLevel})`;
}

$("zoomInButton")?.addEventListener("click", () => {
  zoomLevel = Math.min(zoomLevel + 0.1, 1.5);
  applyZoom();
});

$("zoomOutButton")?.addEventListener("click", () => {
  zoomLevel = Math.max(zoomLevel - 0.1, 1);
  applyZoom();
});

$("zoomResetButton")?.addEventListener("click", () => {
  zoomLevel = 1;
  applyZoom();
});

// -------------------------
// SEARCH
// -------------------------

async function searchMusic() {
  const query = $("searchInput").value.trim();

  if (query.length < 2) {
    $("searchStatus").textContent =
      "Enter at least 2 characters.";

    return;
  }

  $("searchStatus").textContent = "Searching...";
  $("searchResults").innerHTML = "";

  try {
    const response = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=10`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Search failed");
    }

    searchResults = (data.results || [])
      .map(normalizeSong)
      .filter(Boolean)
      .slice(0, 10);

    $("resultCount").textContent =
      `${searchResults.length} RESULTS`;

    if (!searchResults.length) {
      $("searchStatus").textContent = "No songs found.";
      return;
    }

    $("searchStatus").textContent = "";

    renderResults();

  } catch (error) {
    console.error(error);

    $("searchStatus").textContent =
      `Search unavailable: ${error.message}`;
  }
}

function makeIconButton(icon, label, className, action) {
  const button = document.createElement("button");

  button.className = `action-icon ${className || ""}`;

  button.type = "button";

  button.setAttribute("aria-label", label);
  button.title = label;

  button.innerHTML = icon;

  button.addEventListener("click", action);

  return button;
}

function renderResults() {
  const container = $("searchResults");

  container.innerHTML = "";

  searchResults.forEach((song, index) => {
    const row = document.createElement("div");

    row.className = "song-row";

    const number = document.createElement("span");

    number.className = "song-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const details = document.createElement("div");

    details.className = "song-details";

    const title = document.createElement("h3");

    title.textContent = song.title;

    const subtitle = document.createElement("p");

    subtitle.textContent =
      `${song.channel} · ${song.duration || "Unknown duration"}`;

    details.append(title, subtitle);

    const actions = document.createElement("div");

    actions.className = "song-actions";

    actions.append(
      makeIconButton(icons.play, "Play song", "primary", () => {
        let index = queue.findIndex(item => item.id === song.id);

        if (index === -1) {
          queue.push(song);
          index = queue.length - 1;
        }

        currentIndex = index;

        saveQueue();
        playSong(song);
        renderQueue();
      }),

      makeIconButton(icons.add, "Add to queue", "", () => {
        addToQueue(song);
      })
    );

    row.append(number, details, actions);

    container.appendChild(row);
  });
}

$("searchButton")?.addEventListener("click", searchMusic);

$("searchInput")?.addEventListener("keydown", event => {
  if (event.key === "Enter") searchMusic();
});

function addToQueue(rawSong) {
  const song = normalizeSong(rawSong);

  if (!song) return;

  if (queue.some(item => item.id === song.id)) {
    $("searchStatus").textContent = "Already in queue.";
    return;
  }

  queue.push(song);

  saveQueue();
  renderQueue();

  $("searchStatus").textContent = "Added to local queue.";
}

// -------------------------
// QUEUE
// -------------------------

function renderQueue() {
  const container = $("queueList");

  container.innerHTML = "";

  if (!queue.length) {
    container.innerHTML =
      '<div class="empty-state">Your queue is empty.</div>';

    return;
  }

  queue.forEach((rawSong, index) => {
    const song = normalizeSong(rawSong);

    if (!song) return;

    const row = document.createElement("div");

    row.className = "song-row";

    const number = document.createElement("span");

    number.className = "song-number";

    number.textContent = String(index + 1).padStart(2, "0");

    const details = document.createElement("div");

    details.className = "song-details";

    const title = document.createElement("h3");

    title.textContent = song.title;

    const subtitle = document.createElement("p");

    subtitle.textContent =
      `${song.channel} · ${song.duration}`;

    details.append(title, subtitle);

    const actions = document.createElement("div");

    actions.className = "song-actions";

    actions.append(
      makeIconButton(icons.play, "Play song", "primary", () => {
        playFromQueue(index);
      }),

      makeIconButton(icons.remove, "Remove song", "danger", () => {
        queue.splice(index, 1);

        if (currentIndex === index) {
          currentIndex = -1;
        } else if (currentIndex > index) {
          currentIndex--;
        }

        saveQueue();
        renderQueue();
      })
    );

    if (index === currentIndex) {
      row.classList.add("playing");
    }

    row.append(number, details, actions);

    container.appendChild(row);
  });
}

$("clearQueueButton")?.addEventListener("click", () => {
  queue = [];
  currentIndex = -1;
  lastRoomSongId = null;

  saveQueue();
  renderQueue();
});

// -------------------------
// PLAYLISTS
// -------------------------

async function loadPlaylists() {
  $("playlistList").innerHTML =
    '<div class="empty-state">Loading playlists...</div>';

  try {
    const data = await apiRequest("/playlists");

    playlists = Array.isArray(data)
      ? data
      : data.playlists || [];

    renderPlaylists();

  } catch (error) {
    console.error(error);

    $("playlistList").innerHTML = "";

    const message = document.createElement("div");

    message.className = "empty-state";

    message.textContent =
      `Could not load playlists: ${error.message}`;

    $("playlistList").appendChild(message);
  }
}

async function createPlaylist() {
  const name = $("playlistName").value.trim();

  if (!name) {
    alert("Enter a playlist name.");
    return;
  }

  try {
    await apiRequest("/playlists", {
      method: "POST",
      body: JSON.stringify({ name })
    });

    $("playlistName").value = "";

    await loadPlaylists();

  } catch (error) {
    alert(`Could not create playlist: ${error.message}`);
  }
}

async function deletePlaylist(playlistId) {
  if (!confirm("Delete this playlist?")) return;

  try {
    await apiRequest(
      `/playlists/${encodeURIComponent(playlistId)}`,
      { method: "DELETE" }
    );

    await loadPlaylists();

  } catch (error) {
    alert(`Could not delete playlist: ${error.message}`);
  }
}

async function saveQueueToPlaylist(playlistId) {
  if (!queue.length) {
    alert("Your queue is empty.");
    return;
  }

  try {
    for (const song of queue) {
      await apiRequest(
        `/playlists/${encodeURIComponent(playlistId)}/songs`,
        {
          method: "POST",
          body: JSON.stringify({ song })
        }
      );
    }

    await loadPlaylists();

    alert("Queue saved to playlist.");

  } catch (error) {
    alert(`Could not save queue: ${error.message}`);
  }
}

function renderPlaylists() {
  const container = $("playlistList");

  container.innerHTML = "";

  if (!playlists.length) {
    container.innerHTML =
      '<div class="empty-state">No playlists created yet.</div>';

    return;
  }

  playlists.forEach(playlist => {
    const card = document.createElement("div");

    card.className = "playlist-card";

    const title = document.createElement("h3");

    title.textContent = playlist.name;

    const count = document.createElement("p");

    count.textContent =
      `${(playlist.songs || []).length} songs`;

    const actions = document.createElement("div");

    actions.className = "playlist-actions";

    const saveButton = document.createElement("button");

    saveButton.className = "action-icon";

    saveButton.setAttribute(
      "aria-label",
      "Save queue to playlist"
    );

    saveButton.title = "Save queue to playlist";

    saveButton.innerHTML = icons.playlist;

    saveButton.addEventListener("click", () => {
      saveQueueToPlaylist(playlist.playlist_id);
    });

    const deleteButton = makeIconButton(
      icons.remove,
      "Delete playlist",
      "danger",
      () => deletePlaylist(playlist.playlist_id)
    );

    actions.append(saveButton, deleteButton);

    card.append(title, count, actions);

    container.appendChild(card);
  });
}

$("createPlaylist")?.addEventListener("click", createPlaylist);

$("playlistName")?.addEventListener("keydown", event => {
  if (event.key === "Enter") createPlaylist();
});

// -------------------------
// STANDALONE ROOM SYSTEM
// -------------------------

function getRoomId() {
  const params = new URLSearchParams(location.search);

  const urlRoom = params.get("room");

  if (urlRoom) {
    localStorage.setItem(STORAGE.room, urlRoom);
    return urlRoom;
  }

  return localStorage.getItem(STORAGE.room) || null;
}

let roomId = getRoomId();

function setRoomId(id) {
  roomId = id || null;

  if (roomId) {
    localStorage.setItem(STORAGE.room, roomId);
  } else {
    localStorage.removeItem(STORAGE.room);
  }

  updateRoomDisplay();
}

function updateRoomDisplay() {
  if (!roomId) {
    $("roomBadge").textContent = "NO ROOM";
    $("settingsRoom").textContent = "No room selected";
    return;
  }

  $("roomBadge").textContent = `ROOM #${roomId}`;
  $("settingsRoom").textContent = `Room #${roomId}`;
}

async function loadRoomQueue() {
  if (!roomId) return;

  try {
    const data = await apiRequest(
      `/rooms/${encodeURIComponent(roomId)}`
    );

    const room = data.room || data;

    if (!room || data.success === false) {
      throw new Error("Room data unavailable.");
    }

    queue = Array.isArray(room.queue)
      ? room.queue.map(normalizeSong).filter(Boolean)
      : [];

    saveQueue();

    const playback = room.playback || {};

    const currentSong = normalizeSong(room.current_song);

    if (currentSong) {
      currentIndex = queue.findIndex(
        song => song.id === currentSong.id
      );

      applyPlaybackMode(
        currentSong.media_type ||
        playback.mode ||
        "audio"
      );

      if (currentSong.id !== lastRoomSongId) {
        lastRoomSongId = currentSong.id;

        const song = currentIndex >= 0
          ? queue[currentIndex]
          : currentSong;

        playSong(song);
      }

    } else {
      currentIndex = -1;
      lastRoomSongId = null;

      if (playback.mode) {
        applyPlaybackMode(playback.mode);
      }
    }

    renderQueue();

    $("searchStatus").textContent = queue.length
      ? `${queue.length} songs loaded from room #${roomId}`
      : `Room #${roomId} is ready. Queue is empty.`;

  } catch (error) {
    console.error("ROOM LOAD ERROR:", error);

    $("searchStatus").textContent =
      `Could not load room: ${error.message}`;
  }
}

function startRoomRefresh() {
  if (!roomId) return;

  clearInterval(roomRefreshTimer);

  roomRefreshTimer = setInterval(() => {
    if (!document.hidden) loadRoomQueue();
  }, 4000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && roomId) {
    loadRoomQueue();
  }
});

// -------------------------
// INITIALIZATION
// -------------------------

async function initializeApp() {
  applyPlaybackMode("audio");

  updateRoomDisplay();

  loadSavedQueue();

  renderQueue();

  if (AUTH_TOKEN) {
    await loadPlaylists();
  } else {
    $("playlistList").innerHTML =
      '<div class="empty-state">Please log in to use playlists.</div>';
  }

  if (roomId && AUTH_TOKEN) {
    await loadRoomQueue();
    startRoomRefresh();
  } else if (!roomId) {
    $("searchStatus").textContent =
      "Welcome to TANANG MUSIC.";
  }
}

initializeApp();
