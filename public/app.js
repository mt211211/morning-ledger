const storiesElement = document.querySelector("#stories");
const refreshStatus = document.querySelector("#refreshStatus");
const storyCount = document.querySelector("#storyCount");
const dialog = document.querySelector("#chatDialog");
const messages = document.querySelector("#messages");
const questionInput = document.querySelector("#question");
const chatScope = document.querySelector("#chatScope");
const suggestions = document.querySelector("#suggestions");
const notifyButton = document.querySelector("#notifyButton");
const turnstileBox = document.querySelector("#turnstileBox");
const turnstileWidget = document.querySelector("#turnstileWidget");
const onboardingCover = document.querySelector("#onboardingCover");

let category = "all";
let activeStory = null;
let vapidPublicKey = "";
let turnstileSiteKey = "";
let activePushSubscription = null;
let onboardingStartY = 0;
let onboardingProgress = 0;

const ARTICLE_QUESTIONS = [
  "Why does this matter?",
  "What are the key risks?",
  "What happens next?"
];

const CLIENT_ID_KEY = "morning-ledger-client-id";
const clientId = getClientId();

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
document.querySelector("#closeChat").addEventListener("click", () => dialog.close());
document.querySelector("#chatForm").addEventListener("submit", askQuestion);
notifyButton.addEventListener("click", enableMorningNotification);
onboardingCover.addEventListener("pointerdown", startOnboardingDrag);
onboardingCover.addEventListener("pointermove", moveOnboardingDrag);
onboardingCover.addEventListener("pointerup", endOnboardingDrag);
onboardingCover.addEventListener("pointercancel", endOnboardingDrag);

async function loadNews() {
  const response = await fetch(`/api/news?category=${category}`);
  const data = await response.json();
  vapidPublicKey = data.vapid_public_key || "";
  turnstileSiteKey = data.turnstile_site_key || "";
  notifyButton.hidden = !vapidPublicKey;
  if (vapidPublicKey) await syncNotificationButton();
  storiesElement.replaceChildren(...data.stories.map(renderStory));
  storyCount.textContent = `${data.stories.length} stories`;
  refreshStatus.textContent = data.updated_at
    ? `Updated ${formatTime(data.updated_at)} - automatic briefing at 07:30`
    : "Preview digest - automatic briefing at 07:30";
}

async function refreshNews() {
  const icon = document.querySelector("#refreshIcon");
  icon.textContent = "...";
  refreshStatus.textContent = "Checking credible sources...";
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    const data = await response.json();
    refreshStatus.textContent = data.message;
    await loadNews();
  } catch {
    refreshStatus.textContent = "Refresh failed. Please try again.";
  } finally {
    icon.innerHTML = "&#8635;";
  }
}

function renderStory(story) {
  const card = document.querySelector("#storyTemplate").content.cloneNode(true);
  card.querySelector(".topic").textContent = story.category.replace("-", " ");
  card.querySelector("time").textContent = formatTime(story.published_at);
  card.querySelector("h3").textContent = story.title;
  const bullets = story.bullets?.length ? story.bullets : [story.summary, "Open the source for the complete article."];
  card.querySelector(".summary-list").replaceChildren(...bullets.slice(0, 2).map((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));
  card.querySelector(".source").textContent = story.source;
  card.querySelector(".source-tier").textContent = story.source_tier;
  card.querySelector("a").href = story.url;
  card.querySelector(".story-question").addEventListener("click", () => openArticleChat(story));
  return card;
}

function openArticleChat(story) {
  activeStory = story;
  chatScope.textContent = `Article only - ${story.source}`;
  questionInput.placeholder = "Ask about this article only";
  renderSuggestions(story);
  resetMessages(`I will answer only about this article: ${story.title}`);
  dialog.showModal();
}

function renderSuggestions(story) {
  suggestions.hidden = false;
  turnstileBox.hidden = true;
  turnstileWidget.replaceChildren();
  suggestions.replaceChildren(...ARTICLE_QUESTIONS.map((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.textContent = question;
    button.addEventListener("click", () => submitQuestion(question, story.id));
    return button;
  }));
}

async function askQuestion(event) {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;
  await submitQuestion(question, activeStory?.id);
}

async function submitQuestion(question, storyId, turnstileToken = "", retry = false) {
  if (!retry) addMessage(question, "user");
  questionInput.value = "";
  const loading = addMessage(storyId ? "Reading this article..." : "Thinking from the latest digest...", "assistant");
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, storyId, turnstileToken, clientId })
    });
    const data = await response.json();
    loading.textContent = data.answer || data.error;
    if (response.status === 429 && turnstileSiteKey) {
      showTurnstile(question, storyId);
    }
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

function showTurnstile(question, storyId) {
  turnstileBox.hidden = false;
  turnstileWidget.replaceChildren();
  loadTurnstileScript().then(() => {
    if (!window.turnstile) return;
    window.turnstile.render("#turnstileWidget", {
      sitekey: turnstileSiteKey,
      callback: (token) => submitQuestion(question, storyId, token, true)
    });
  });
}

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve) => {
    const existing = document.querySelector("script[data-turnstile]");
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "true";
    script.addEventListener("load", resolve, { once: true });
    document.head.append(script);
  });
}

async function enableMorningNotification() {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    notifyButton.textContent = "Notifications not supported here";
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  activePushSubscription = await registration.pushManager.getSubscription();
  if (activePushSubscription) {
    await disableMorningNotification(activePushSubscription);
    return;
  }
  if (!vapidPublicKey) {
    notifyButton.textContent = "Notifications need push keys";
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    notifyButton.textContent = "Notifications not enabled";
    return;
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });
  const response = await fetch("/api/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscription,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
  });
  const data = await response.json();
  activePushSubscription = subscription;
  notifyButton.textContent = data.ok ? "07:30 alert on" : "Could not enable alert";
}

async function disableMorningNotification(subscription) {
  await fetch("/api/notifications", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  await subscription.unsubscribe();
  activePushSubscription = null;
  notifyButton.textContent = "Notify me at 07:30";
}

async function syncNotificationButton() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  activePushSubscription = await registration.pushManager.getSubscription();
  notifyButton.textContent = activePushSubscription ? "07:30 alert on - tap to stop" : "Notify me at 07:30";
}

function resetMessages(text) {
  messages.replaceChildren();
  addMessage(text, "assistant");
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

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function getClientId() {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(CLIENT_ID_KEY, value);
  return value;
}

function startOnboardingDrag(event) {
  onboardingStartY = event.clientY;
  onboardingCover.setPointerCapture(event.pointerId);
  onboardingCover.classList.add("dragging");
}

function moveOnboardingDrag(event) {
  if (!onboardingCover.classList.contains("dragging")) return;
  const delta = Math.max(0, onboardingStartY - event.clientY);
  onboardingProgress = Math.min(1, delta / Math.max(1, window.innerHeight * 0.72));
  onboardingCover.style.transform = `translateY(${-onboardingProgress * 92}%) rotateX(${onboardingProgress * 4}deg)`;
  onboardingCover.style.opacity = String(1 - onboardingProgress * 0.18);
}

function endOnboardingDrag() {
  if (!onboardingCover.classList.contains("dragging")) return;
  onboardingCover.classList.remove("dragging");
  if (onboardingProgress > 0.36) {
    dismissOnboarding(true);
  } else {
    onboardingProgress = 0;
    onboardingCover.style.transform = "";
    onboardingCover.style.opacity = "";
  }
}

function dismissOnboarding(remember) {
  onboardingCover.classList.add("dismissed");
  onboardingCover.style.transform = "";
  onboardingCover.style.opacity = "";
}

fetch("/api/preferences", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
}).catch(() => {});

loadNews().catch(() => { refreshStatus.textContent = "Could not load the digest."; });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
