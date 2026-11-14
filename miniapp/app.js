
const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#080808");
    tg.setBackgroundColor("#080808");
}

const API_BASE = "";

const user = tg?.initDataUnsafe?.user;

if (user) {
    document.getElementById("welcomeText").textContent =
        `Welcome, ${user.first_name}!`;
}

const params = new URLSearchParams(location.search);
const roomId = params.get("room");

if (roomId) {
    document.getElementById("roomBadge").textContent =
        `ROOM #${roomId}`;

    document.getElementById("settingsRoom").textContent =
        `Room #${roomId}`;
}

// Navigation
document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".page").forEach(page =>
            page.classList.remove("active")
        );

        document.querySelectorAll(".nav-item").forEach(nav =>
            nav.classList.remove("active")
        );

        document.getElementById(button.dataset.page)
            .classList.add("active");

        button.classList.add("active");
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
});

// Search
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const searchResults = document.getElementById("searchResults");

searchButton.addEventListener("click", searchSongs);

searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        searchSongs();
    }
});

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

async function searchSongs() {
    const query = searchInput.value.trim();

    if (query.length < 2) {
        showMessage("Enter at least 2 characters.");
        return;
    }

    searchButton.disabled = true;
    searchButton.textContent = "...";

    searchResults.innerHTML = `
        <div class="loading">
            <div class="loader"></div>
            <p>Searching YouTube...</p>
        </div>
    `;

    try {
        const response = await fetch(
            `${API_BASE}/search?q=${encodeURIComponent(query)}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Search failed");
        }

        if (!data.results || data.results.length === 0) {
            searchResults.innerHTML = `
                <div class="empty-state">
                    No matching videos found.
                    <p>Try another search.</p>
                </div>
            `;
            return;
        }

        renderResults(data.results);

    } catch (error) {
        searchResults.innerHTML = `
            <div class="empty-state">
                <p>⚠️ Search unavailable.</p>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    } finally {
        searchButton.disabled = false;
        searchButton.textContent = "GO";
    }
}

function renderResults(results) {
    searchResults.innerHTML = `
        <div class="results-heading">
            <h3>SEARCH RESULTS</h3>
            <span>${results.length} VIDEOS</span>
        </div>

        ${results.map((video, index) => `
            <article class="result-card">
                <img
                    src="${escapeHTML(video.thumbnail)}"
                    alt=""
                    class="result-thumbnail"
                >

                <div class="result-details">
                    <h3>${index + 1}. ${escapeHTML(video.title)}</h3>
                    <p>${escapeHTML(video.channel)}</p>
                    <span>⏱ ${escapeHTML(video.duration)}</span>
                </div>

                <button
                    class="watch-button"
                    data-url="${escapeHTML(video.url)}"
                >
                    WATCH
                </button>
            </article>
        `).join("")}
    `;

    searchResults.querySelectorAll(".watch-button")
        .forEach(button => {
            button.addEventListener("click", () => {
                const url = button.dataset.url;

                if (tg) {
                    tg.openLink(url);
                } else {
                    window.open(url, "_blank");
                }
            });
        });
}

function showMessage(message) {
    searchResults.innerHTML = `
        <div class="empty-state">${escapeHTML(message)}</div>
    `;
}

// Playlist button
document.getElementById("createPlaylist")
    .addEventListener("click", () => {
        const name = prompt("Enter playlist name:");

        if (name && name.trim()) {
            alert(
                "Playlist creation interface is ready for integration. " +
                "Permanent saving will be connected next."
            );
        }
    });
