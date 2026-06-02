const storiesElement = document.querySelector("#stories");
const refreshStatus = document.querySelector("#refreshStatus");
const storyCount = document.querySelector("#storyCount");
const dialog = document.querySelector("#chatDialog");
const messages = document.querySelector("#messages");
const questionInput = document.querySelector("#question");
let category = "all";

document.querySelector("#today").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long", month: "long", day: "numeric"
}).format(new Date());

document.querySelectorAll(".chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".chip.active").classList.remove("active");
    button.classList.add("active");
    category = button.dataset.category;
    loadNews();
  });
});

document.querySelector("#refreshButton").addEventListener("click", refreshNews);
document.querySelector("#openChat").addEventListener("click", () => dialog.showModal());
document.querySelector("#closeChat").addEventListener("click", () => dialog.close());
document.querySelector("#chatForm").addEventListener("submit", askQuestion);

async function loadNews() {
  const response = await fetch(`/api/news?category=${category}`);
  const data = await response.json();
  storiesElement.replaceChildren(...data.stories.map(renderStory));
  storyCount.textContent = `${data.stories.length} stories`;
  refreshStatus.textContent = data.updated_at
    ? `Updated ${formatTime(data.updated_at)} · automatic briefing at 07:30`
    : "Preview digest · automatic briefing at 07:30";
}

async function refreshNews() {
  const icon = document.querySelector("#refreshIcon");
  icon.textContent = "…";
  refreshStatus.textContent = "Checking credible sources...";
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    const data = await response.json();
    refreshStatus.textContent = data.message;
    await loadNews();
  } catch {
    refreshStatus.textContent = "Refresh failed. Please try again.";
  } finally {
    icon.textContent = "↻";
  }
}

function renderStory(story) {
  const card = document.querySelector("#storyTemplate").content.cloneNode(true);
  card.querySelector(".topic").textContent = story.category.replace("-", " ");
  card.querySelector("time").textContent = formatTime(story.published_at);
  card.querySelector("h3").textContent = story.title;
  card.querySelector(".summary").textContent = story.summary;
  card.querySelector(".source").textContent = story.source;
  card.querySelector(".source-tier").textContent = story.source_tier;
  card.querySelector("a").href = story.url;
  card.querySelector(".story-question").addEventListener("click", () => {
    dialog.showModal();
    questionInput.value = `Why does this matter: ${story.title}`;
    questionInput.focus();
  });
  return card;
}

async function askQuestion(event) {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;
  addMessage(question, "user");
  questionInput.value = "";
  const loading = addMessage("Thinking from the latest digest...", "assistant");
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question })
    });
    const data = await response.json();
    loading.textContent = data.answer || data.error;
    if (data.citations?.length) {
      const citations = document.createElement("div");
      citations.className = "citations";
      data.citations.forEach((story, index) => {
        const link = document.createElement("a");
        link.href = story.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `[${index + 1}] ${story.source}: ${story.title}`;
        citations.append(link);
      });
      loading.append(citations);
    }
  } catch {
    loading.textContent = "I could not reach the digest service. Please try again.";
  }
}

function addMessage(text, type) {
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = text;
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

fetch("/api/preferences", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
}).catch(() => {});

loadNews().catch(() => { refreshStatus.textContent = "Could not load the digest."; });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
