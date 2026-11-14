
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API_BASE = "";
const INIT_DATA = tg?.initData || "";

let player = null;
let playerReady = false;
let currentIndex = -1;
let isSeeking = false;
let progressTimer = null;

let queue = JSON.parse(localStorage.getItem("tanang_queue") || "[]");
let playlists = [];
let searchResults = [];

const $ = id => document.getElementById(id);

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": INIT_DATA
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || `API error ${response.status}`);
  }

  return data;
}

function saveQueue() {
  localStorage.setItem("tanang_queue", JSON.stringify(queue));
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });
}

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
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

    const bar = $("seekBar");
    if (bar) {
      bar.max = duration || 0;
      bar.value = current;
    }

    if ($("currentTime")) $("currentTime").textContent = formatTime(current);
    if ($("totalTime")) $("totalTime").textContent = formatTime(duration);
  } catch (error) {
    console.warn("Progress update unavailable", error);
  }
}

function startProgressTimer() {
  clearInterval(progressTimer);
  progressTimer = setInterval(updateProgress, 500);
}

function loadPlayer(videoId) {
  if (!playerReady) {
    $("searchStatus").textContent = "Player is loading. Try again shortly.";
    return;
  }

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
        const playing = event.data === YT.PlayerState.PLAYING;

        if ($("playPauseButton")) {
          $("playPauseButton").textContent = playing ? "Ⅱ" : "▶";
        }

        if (event.data === YT.PlayerState.ENDED) playNext();
        updateProgress();
      },
      onError: event => {
        $("searchStatus").textContent =
          `This video cannot be played here. YouTube error: ${event.data}`;
      }
    }
  });
}

function playSong(song) {
  if (!song?.id) return;

  $("currentTitle").textContent = song.title;
  $("currentChannel").textContent = song.channel || "YouTube";

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
    let next;
    do {
      next = Math.floor(Math.random() * queue.length);
    } while (next === currentIndex);

    playFromQueue(next);
    return;
  }

  if (currentIndex + 1 < queue.length) {
    playFromQueue(currentIndex + 1);
  }
}

function playPrevious() {
  if (currentIndex > 0) playFromQueue(currentIndex - 1);
}

let shuffleEnabled = false;

const shuffleButton = $("shuffleButton");

if (shuffleButton) {
  shuffleButton.addEventListener("click", () => {
    shuffleEnabled = !shuffleEnabled;
    shuffleButton.classList.toggle("active", shuffleEnabled);
    shuffleButton.textContent = shuffleEnabled ? "🔀 ON" : "🔀";
  });
}

$("playPauseButton").addEventListener("click", () => {
  if (!player || typeof player.getPlayerState !== "function") return;

  if (player.getPlayerState() === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
});

$("nextButton").addEventListener("click", playNext);
$("previousButton").addEventListener("click", playPrevious);

// Seek bar
const seekBar = $("seekBar");

if (seekBar) {
  seekBar.addEventListener("input", () => {
    isSeeking = true;
    if ($("currentTime")) {
      $("currentTime").textContent = formatTime(Number(seekBar.value));
    }
  });

  seekBar.addEventListener("change", () => {
    if (player && typeof player.seekTo === "function") {
      player.seekTo(Number(seekBar.value), true);
    }
    isSeeking = false;
    updateProgress();
  });
}

// Full-screen
const fullscreenButton = $("fullscreenButton");

if (fullscreenButton) {
  fullscreenButton.addEventListener("click", async () => {
    const frame = $("youtubePlayer");
    const iframe = frame?.querySelector("iframe");

    try {
      if (iframe?.requestFullscreen) {
        await iframe.requestFullscreen();
      } else if (frame?.requestFullscreen) {
        await frame.requestFullscreen();
      } else {
        alert("Full-screen is not supported by this device.");
      }
    } catch (error) {
      console.error(error);
      alert("YouTube controls may be needed for full-screen.");
    }
  });
}

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

    if (!response.ok) throw new Error(`Search error ${response.status}`);

    const data = await response.json();
    searchResults = (data.results || []).slice(0, 10);

    if (!searchResults.length) {
      $("searchStatus").textContent = "No results found.";
      return;
    }

    $("searchStatus").textContent = `${searchResults.length} results found`;
    renderResults();
  } catch (error) {
    console.error(error);
    $("searchStatus").textContent = "Search unavailable. Try again.";
  }
}

function renderResults() {
  $("searchResults").innerHTML = "";

  searchResults.forEach(song => {
    const card = document.createElement("div");
    card.className = "result-card";

    const img = document.createElement("img");
    img.src = song.thumbnail || "";
    img.alt = "Song thumbnail";

    const info = document.createElement("div");
    info.className = "result-info";

    const title = document.createElement("h3");
    title.textContent = song.title;

    const channel = document.createElement("p");
    channel.textContent = `${song.channel || "Unknown"} · ${song.duration || ""}`;

    info.append(title, channel);

    const actions = document.createElement("div");
    actions.className = "result-actions";

    const playButton = document.createElement("button");
    playButton.textContent = "PLAY";
    playButton.addEventListener("click", () => {
      if (!queue.some(item => item.id === song.id)) {
        queue.push(song);
        saveQueue();
      }

      currentIndex = queue.findIndex(item => item.id === song.id);
      playSong(song);
      renderQueue();
    });

    const addButton = document.createElement("button");
    addButton.className = "add-button";
    addButton.textContent = "ADD";
    addButton.addEventListener("click", () => addToQueue(song));

    actions.append(playButton, addButton);
    card.append(img, info, actions);
    $("searchResults").appendChild(card);
  });
}

$("searchButton").addEventListener("click", searchMusic);

$("searchInput").addEventListener("keydown", event => {
  if (event.key === "Enter") searchMusic();
});

// Queue
function addToQueue(song) {
  if (queue.some(item => item.id === song.id)) return;

  queue.push(song);
  saveQueue();
  renderQueue();
}

function renderQueue() {
  $("queueList").innerHTML = "";

  if (!queue.length) {
    $("queueList").textContent = "Your queue is empty.";
    return;
  }

  queue.forEach((song, index) => {
    const card = document.createElement("div");
    card.className = "queue-card";

    const title = document.createElement("h3");
    title.textContent = `${index + 1}. ${song.title}`;

    const channel = document.createElement("p");
    channel.textContent = song.channel || "YouTube";

    const play = document.createElement("button");
    play.className = "secondary-button";
    play.textContent = "PLAY";
    play.addEventListener("click", () => playFromQueue(index));

    const remove = document.createElement("button");
    remove.className = "secondary-button";
    remove.textContent = "REMOVE";
    remove.addEventListener("click", () => {
      queue.splice(index, 1);

      if (currentIndex === index) currentIndex = -1;
      else if (currentIndex > index) currentIndex--;

      saveQueue();
      renderQueue();
    });

    card.append(title, channel, play, remove);
    $("queueList").appendChild(card);
  });
}

$("clearQueueButton").addEventListener("click", () => {
  queue = [];
  currentIndex = -1;
  saveQueue();
  renderQueue();
});

// Permanent playlists
async function loadPlaylists() {
  $("playlistList").textContent = "Loading playlists...";

  try {
    const data = await apiRequest("/playlists");
    playlists = Array.isArray(data) ? data : data.playlists || [];
    renderPlaylists();
  } catch (error) {
    console.error(error);
    $("playlistList").textContent = `Could not load playlists: ${error.message}`;
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
      await apiRequest(`/playlists/${encodeURIComponent(playlistId)}/songs`, {
        method: "POST",
        body: JSON.stringify({ song })
      });
    }

    await loadPlaylists();
    alert("Queue saved to playlist.");
  } catch (error) {
    alert(`Could not save queue: ${error.message}`);
  }
}

function renderPlaylists() {
  $("playlistList").innerHTML = "";

  if (!playlists.length) {
    $("playlistList").textContent = "No playlists created yet.";
    return;
  }

  playlists.forEach(playlist => {
    const card = document.createElement("div");
    card.className = "playlist-card";

    const title = document.createElement("h3");
    title.textContent = playlist.name;

    const count = document.createElement("p");
    count.textContent = `${(playlist.songs || []).length} songs`;

    const saveButton = document.createElement("button");
    saveButton.className = "secondary-button";
    saveButton.textContent = "SAVE QUEUE TO PLAYLIST";
    saveButton.addEventListener("click", () =>
      saveQueueToPlaylist(playlist.playlist_id)
    );

    const deleteButton = document.createElement("button");
    deleteButton.className = "secondary-button";
    deleteButton.textContent = "DELETE";
    deleteButton.addEventListener("click", () =>
      deletePlaylist(playlist.playlist_id)
    );

    card.append(title, count, saveButton, deleteButton);
    $("playlistList").appendChild(card);
  });
}

$("createPlaylist").addEventListener("click", createPlaylist);

// Room label
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

if (roomId) {
  $("roomBadge").textContent = "ROOM #" + roomId;
  $("settingsRoom").textContent = "Room #" + roomId;
}

renderQueue();
loadPlaylists();
