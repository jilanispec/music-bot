
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API_BASE = "";
const INIT_DATA = tg?.initData || "";

const $ = id => document.getElementById(id);

let player = null;
let playerReady = false;
let currentIndex = -1;
let isSeeking = false;
let shuffleEnabled = false;
let progressTimer = null;
let zoomLevel = 1;

let queue = [];

try {
  queue = JSON.parse(localStorage.getItem("tanang_queue") || "[]");
  if (!Array.isArray(queue)) queue = [];
} catch {
  queue = [];
}

let playlists = [];
let searchResults = [];

const icons = {
  play: '<svg viewBox="0 0 24 24"><path d="m8 5 12 7-12 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5h3v14H8zM15 5h3v14h-3z"/></svg>',
  add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  remove: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  playlist: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>'
};

function saveQueue() {
  localStorage.setItem("tanang_queue", JSON.stringify(queue));
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": INIT_DATA
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || `API error ${response.status}`);
  }

  return data;
}

// Navigation
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});

document.querySelector(".brand")?.addEventListener("click", event => {
  event.preventDefault();
  showPage("homePage");
});

// YouTube player
window.onYouTubeIframeAPIReady = function () {
  playerReady = true;
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function updateProgress() {
  if (!player || isSeeking) return;

  try {
    const current = player.getCurrentTime() || 0;
    const duration = player.getDuration() || 0;

    $("seekBar").max = duration || 0;
    $("seekBar").value = current;

    $("currentTime").textContent = formatTime(current);
    $("totalTime").textContent = formatTime(duration);
  } catch (error) {
    console.warn("Progress update unavailable", error);
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
  if (!playerReady) {
    $("searchStatus").textContent = "Player is loading. Try again shortly.";
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
      origin: window.location.origin
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
        $("playingStatus").textContent = playing ? "PLAYING" : "PAUSED";

        if (state === YT.PlayerState.ENDED) {
          playNext();
        }

        updateProgress();
      },
      onError: event => {
        $("playingStatus").textContent = "UNAVAILABLE";
        $("searchStatus").textContent =
          `YouTube cannot play this video here. Error ${event.data}`;
      }
    }
  });
}

function playSong(song) {
  if (!song?.id) return;

  $("currentTitle").textContent = song.title || "Unknown title";
  $("currentChannel").textContent = song.channel || "YouTube";
  $("videoPlaceholder").style.display = "none";

  loadPlayer(song.id);
}

function playFromQueue(index) {
  if (index < 0 || index >= queue.length) return;

  currentIndex = index;
  playSong(queue[index]);
  renderQueue();
}

function playNext() {
  if (!queue.length) return;

  if (shuffleEnabled && queue.length > 1) {
    let nextIndex = currentIndex;

    while (nextIndex === currentIndex) {
      nextIndex = Math.floor(Math.random() * queue.length);
    }

    playFromQueue(nextIndex);
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

  if (player && player.getCurrentTime && player.getCurrentTime() > 3) {
    player.seekTo(0, true);
    return;
  }

  if (currentIndex > 0) {
    playFromQueue(currentIndex - 1);
  }
}

// Player controls
$("shuffleButton").addEventListener("click", () => {
  shuffleEnabled = !shuffleEnabled;
  $("shuffleButton").classList.toggle("active", shuffleEnabled);
  $("shuffleButton").setAttribute("aria-pressed", String(shuffleEnabled));
});

$("playPauseButton").addEventListener("click", () => {
  if (!player || !player.getPlayerState) return;

  if (player.getPlayerState() === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
});

$("previousButton").addEventListener("click", playPrevious);
$("nextButton").addEventListener("click", playNext);

$("seekBar").addEventListener("input", () => {
  isSeeking = true;
  $("currentTime").textContent = formatTime(Number($("seekBar").value));
});

$("seekBar").addEventListener("change", () => {
  if (player && player.seekTo) {
    player.seekTo(Number($("seekBar").value), true);
  }

  isSeeking = false;
  updateProgress();
});

$("fullscreenButton").addEventListener("click", async () => {
  const frame = $("videoFrame");

  try {
    if (frame.requestFullscreen) {
      await frame.requestFullscreen();
    } else if (frame.webkitRequestFullscreen) {
      frame.webkitRequestFullscreen();
    } else {
      alert("Use the YouTube player's full-screen control on this device.");
    }
  } catch (error) {
    console.error(error);
    alert("Full-screen is unavailable in this Telegram view.");
  }
});

// Zoom display
function applyZoom() {
  $("youtubePlayer").style.transform = `scale(${zoomLevel})`;
}

$("zoomInButton").addEventListener("click", () => {
  zoomLevel = Math.min(zoomLevel + 0.1, 1.5);
  applyZoom();
});

$("zoomOutButton").addEventListener("click", () => {
  zoomLevel = Math.max(zoomLevel - 0.1, 1);
  applyZoom();
});

$("zoomResetButton").addEventListener("click", () => {
  zoomLevel = 1;
  applyZoom();
});

// Search
async function searchMusic() {
  const query = $("searchInput").value.trim();

  if (query.length < 2) {
    $("searchStatus").textContent = "Enter at least 2 characters.";
    return;
  }

  $("searchStatus").textContent = "Searching...";
  $("searchResults").innerHTML = "";

  try {
    const response = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=10`
    );

    if (!response.ok) {
      throw new Error(`Search error ${response.status}`);
    }

    const data = await response.json();
    searchResults = (data.results || []).slice(0, 10);

    $("resultCount").textContent = `${searchResults.length} RESULTS`;

    if (!searchResults.length) {
      $("searchStatus").textContent = "No songs found.";
      return;
    }

    $("searchStatus").textContent = "";
    renderResults();
  } catch (error) {
    console.error(error);
    $("searchStatus").textContent = `Search unavailable: ${error.message}`;
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

  searchResults.slice(0, 10).forEach((song, index) => {
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
      `${song.channel || "YouTube"} · ${song.duration || "Unknown duration"}`;

    details.append(title, subtitle);

    const actions = document.createElement("div");
    actions.className = "song-actions";

    actions.append(
      makeIconButton(icons.play, "Play song", "primary", () => {
        const existingIndex = queue.findIndex(item => item.id === song.id);

        if (existingIndex === -1) {
          queue.push(song);
          saveQueue();
          currentIndex = queue.length - 1;
        } else {
          currentIndex = existingIndex;
        }

        playSong(song);
        renderQueue();
      }),
      makeIconButton(icons.add, "Add to queue", "", () => addToQueue(song))
    );

    row.append(number, details, actions);
    container.appendChild(row);
  });
}

$("searchButton").addEventListener("click", searchMusic);

$("searchInput").addEventListener("keydown", event => {
  if (event.key === "Enter") searchMusic();
});

function addToQueue(song) {
  if (queue.some(item => item.id === song.id)) {
    $("searchStatus").textContent = "This song is already in your queue.";
    return;
  }

  queue.push(song);
  saveQueue();
  renderQueue();
  $("searchStatus").textContent = "Added to your queue.";
}

// Queue
function renderQueue() {
  const container = $("queueList");
  container.innerHTML = "";

  if (!queue.length) {
    container.innerHTML = '<div class="empty-state">Your queue is empty.</div>';
    return;
  }

  queue.forEach((song, index) => {
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
    subtitle.textContent = song.channel || "YouTube";

    details.append(title, subtitle);

    const actions = document.createElement("div");
    actions.className = "song-actions";

    actions.append(
      makeIconButton(icons.play, "Play song", "primary", () => playFromQueue(index)),
      makeIconButton(icons.remove, "Remove from queue", "danger", () => {
        queue.splice(index, 1);

        if (currentIndex === index) currentIndex = -1;
        else if (currentIndex > index) currentIndex--;

        saveQueue();
        renderQueue();
      })
    );

    row.append(number, details, actions);
    container.appendChild(row);
  });
}

$("clearQueueButton").addEventListener("click", () => {
  queue = [];
  currentIndex = -1;
  saveQueue();
  renderQueue();
});

// Playlists
async function loadPlaylists() {
  $("playlistList").innerHTML =
    '<div class="empty-state">Loading playlists...</div>';

  try {
    const data = await apiRequest("/playlists");
    playlists = Array.isArray(data) ? data : data.playlists || [];
    renderPlaylists();
  } catch (error) {
    console.error(error);
    $("playlistList").innerHTML = "";
    const message = document.createElement("div");
    message.className = "empty-state";
    message.textContent = `Could not load playlists: ${error.message}`;
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
    await apiRequest(`/playlists/${encodeURIComponent(playlistId)}`, {
      method: "DELETE"
    });

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
    count.textContent = `${(playlist.songs || []).length} songs`;

    const actions = document.createElement("div");
    actions.className = "playlist-actions";

    const saveButton = document.createElement("button");
    saveButton.className = "action-icon";
    saveButton.setAttribute("aria-label", "Save queue to playlist");
    saveButton.title = "Save queue to playlist";
    saveButton.innerHTML = icons.playlist;
    saveButton.addEventListener("click", () =>
      saveQueueToPlaylist(playlist.playlist_id)
    );

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

$("createPlaylist").addEventListener("click", createPlaylist);

$("playlistName").addEventListener("keydown", event => {
  if (event.key === "Enter") createPlaylist();
});

// Room display
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

if (roomId) {
  $("roomBadge").textContent = `ROOM #${roomId}`;
  $("settingsRoom").textContent = `Room #${roomId}`;
}

// Initial render
renderQueue();
loadPlaylists();
