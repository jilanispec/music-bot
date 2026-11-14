
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const API_BASE = "";

let player = null;
let playerReady = false;
let currentIndex = -1;

let queue = JSON.parse(localStorage.getItem("tanang_queue") || "[]");
let playlists = JSON.parse(localStorage.getItem("tanang_playlists") || "[]");
let searchResults = [];

const $ = id => document.getElementById(id);

function saveData() {
  localStorage.setItem("tanang_queue", JSON.stringify(queue));
  localStorage.setItem("tanang_playlists", JSON.stringify(playlists));
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

// Official YouTube IFrame API
window.onYouTubeIframeAPIReady = function () {
  playerReady = true;
};

function loadPlayer(videoId) {
  if (!playerReady) {
    $("searchStatus").textContent =
      "Player is loading. Please try again in a moment.";
    return;
  }

  if (player && typeof player.loadVideoById === "function") {
    player.loadVideoById(videoId);
    return;
  }

  player = new YT.Player("youtubePlayer", {
    videoId: videoId,
    playerVars: {
      playsinline: 1,
      controls: 1,
      rel: 0,
      fs: 1,
      origin: window.location.origin
    },
    events: {
      onReady: () => {
        player.playVideo();
      },
      onStateChange: event => {
        if (event.data === YT.PlayerState.PLAYING) {
          $("playPauseButton").textContent = "Ⅱ";
        } else {
          $("playPauseButton").textContent = "▶";
        }

        if (event.data === YT.PlayerState.ENDED) {
          playNext();
        }
      },
      onError: event => {
        $("searchStatus").textContent =
          "This video cannot be played here. Try another result. Error: " +
          event.data;
      }
    }
  });
}

function playSong(song) {
  if (!song || !song.id) return;

  $("currentTitle").textContent = song.title;
  $("currentChannel").textContent = song.channel || "YouTube";

  loadPlayer(song.id);
}

function playFromQueue(index) {
  if (index < 0 || index >= queue.length) return;

  currentIndex = index;
  playSong(queue[index]);
}

function playNext() {
  if (currentIndex + 1 < queue.length) {
    playFromQueue(currentIndex + 1);
  }
}

function playPrevious() {
  if (currentIndex > 0) {
    playFromQueue(currentIndex - 1);
  }
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
      `${API_BASE}/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      throw new Error("Search API returned " + response.status);
    }

    const data = await response.json();
    searchResults = data.results || [];

    if (!searchResults.length) {
      $("searchStatus").textContent = "No results found.";
      return;
    }

    $("searchStatus").textContent =
      `${searchResults.length} results found`;

    renderResults();
  } catch (error) {
    console.error(error);
    $("searchStatus").textContent =
      "Search unavailable. Please try again.";
  }
}

function renderResults() {
  $("searchResults").innerHTML = "";

  searchResults.forEach((song, index) => {
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
    channel.textContent =
      `${song.channel || "Unknown"} · ${song.duration || ""}`;

    info.append(title, channel);

    const actions = document.createElement("div");
    actions.className = "result-actions";

    const playButton = document.createElement("button");
    playButton.textContent = "PLAY";
    playButton.addEventListener("click", () => {
      const songToPlay = song;

      if (!queue.some(item => item.id === song.id)) {
        queue.push(song);
        saveData();
        renderQueue();
      }

      currentIndex = queue.findIndex(item => item.id === songToPlay.id);
      playSong(songToPlay);
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
  saveData();
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
      saveData();
      renderQueue();
    });

    card.append(title, channel, play, remove);
    $("queueList").appendChild(card);
  });
}

$("clearQueueButton").addEventListener("click", () => {
  queue = [];
  currentIndex = -1;
  saveData();
  renderQueue();
});

// Playlists
function renderPlaylists() {
  $("playlistList").innerHTML = "";

  if (!playlists.length) {
    $("playlistList").textContent = "No playlists created yet.";
    return;
  }

  playlists.forEach((playlist, index) => {
    const card = document.createElement("div");
    card.className = "playlist-card";

    const title = document.createElement("h3");
    title.textContent = playlist.name;

    const count = document.createElement("p");
    count.textContent = `${playlist.songs.length} songs`;

    const addCurrentQueue = document.createElement("button");
    addCurrentQueue.className = "secondary-button";
    addCurrentQueue.textContent = "SAVE QUEUE TO PLAYLIST";
    addCurrentQueue.addEventListener("click", () => {
      playlist.songs = [...queue];
      saveData();
      renderPlaylists();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "secondary-button";
    deleteButton.textContent = "DELETE";
    deleteButton.addEventListener("click", () => {
      playlists.splice(index, 1);
      saveData();
      renderPlaylists();
    });

    card.append(title, count, addCurrentQueue, deleteButton);
    $("playlistList").appendChild(card);
  });
}

$("createPlaylist").addEventListener("click", () => {
  const name = $("playlistName").value.trim();

  if (!name) {
    alert("Enter a playlist name.");
    return;
  }

  playlists.push({
    name,
    songs: []
  });

  $("playlistName").value = "";
  saveData();
  renderPlaylists();
});

// Room display
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

if (roomId) {
  $("roomBadge").textContent = "ROOM #" + roomId;
  $("settingsRoom").textContent = "Room #" + roomId;
}

renderQueue();
renderPlaylists();
