document.addEventListener("DOMContentLoaded", async () => {
  await initExtension();
  setupEventListeners();
  await initTheme();
});

const CONFIG = {
  model: "gemini-2.5-flash-preview-05-20",
  defaultTemp: 0.7,
  maxHistory: 10,
  themes: ["system", "light", "dark"],
  themeMaterialIcons: { // Material Icon names for theme toggle
    system: "brightness_auto", // Or a more specific system/auto icon
    light: "light_mode",
    dark: "dark_mode",
  },
  // No longer need iconPaths for local files
};

let conversationHistory = [];
let currentTheme = "system"; // Default: follow system

async function initTheme() {
  const storedTheme = await chrome.storage.sync.get("theme");
  if (storedTheme.theme && CONFIG.themes.includes(storedTheme.theme)) {
    currentTheme = storedTheme.theme;
  }
  applyTheme(currentTheme); // This will set data-theme and update button icon

  // Listen for system theme changes if current theme preference is 'system'
  if (currentTheme === "system") {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (document.documentElement.getAttribute('data-theme-preference') === 'system') {
        applySystemTheme();
        // Theme button icon should remain as 'system' icon, title will update
        updateThemeButtonIcon();
      }
    });
  }
}

function applyTheme(themePreference) {
  document.documentElement.setAttribute('data-theme-preference', themePreference);
  currentTheme = themePreference; // Update global currentTheme

  if (themePreference === "light") {
    document.documentElement.removeAttribute("data-theme"); // Uses :root default (light)
  } else if (themePreference === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else { // System theme
    applySystemTheme();
  }
  updateThemeButtonIcon();
  chrome.storage.sync.set({ theme: themePreference });
}

function applySystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme"); // Default to light as per :root
  }
}

function updateThemeButtonIcon() {
  const themeIconSpan = document.getElementById("themeIcon"); // Get the span
  const themeToggleBtn = document.getElementById("themeToggleBtn");

  if (themeIconSpan && themeToggleBtn) {
    themeIconSpan.textContent = CONFIG.themeMaterialIcons[currentTheme]; // Set Material Icon name

    let effectiveThemeDisplay = currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
    if (currentTheme === "system") {
        effectiveThemeDisplay = `System (${window.matchMedia('(prefers-color-scheme: dark)').matches ? "Dark" : "Light"})`;
    }
    let nextThemeIndex = (CONFIG.themes.indexOf(currentTheme) + 1) % CONFIG.themes.length;
    let nextThemeName = CONFIG.themes[nextThemeIndex];
    nextThemeName = nextThemeName.charAt(0).toUpperCase() + nextThemeName.slice(1);

    themeToggleBtn.title = `Switch to ${nextThemeName} Theme (Current: ${effectiveThemeDisplay})`;
  }
}

async function toggleTheme() {
  let currentIndex = CONFIG.themes.indexOf(currentTheme);
  currentIndex = (currentIndex + 1) % CONFIG.themes.length;
  const newTheme = CONFIG.themes[currentIndex];
  applyTheme(newTheme);
}

async function initExtension() {
  const { apiKey, temperature, history } = await chrome.storage.sync.get([
    "apiKey",
    "temperature",
    "history",
  ]);

  document.getElementById("apiKey").value = apiKey || "";
  document.getElementById("temperature").value =
    temperature || CONFIG.defaultTemp;
  document.getElementById("tempValue").textContent =
    temperature || CONFIG.defaultTemp;
  conversationHistory = history || [];

  updateHistoryUI();
  updateSaveButton();
}

function setupEventListeners() {
  document.getElementById("temperature").addEventListener("input", (e) => {
    document.getElementById("tempValue").textContent = e.target.value;
  });

  document.getElementById("saveKey").addEventListener("click", handleSaveKey);
  document.getElementById("clearKey").addEventListener("click", handleClearKey);
  document.getElementById("submit").addEventListener("click", handleSubmit);
  document
    .getElementById("temperature")
    .addEventListener("change", handleTempChange);
  document.getElementById("prompt").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmit();
    }
  });

  document
    .getElementById("copyResponse")
    .addEventListener("click", copyToClipboard);
  document
    .getElementById("clearHistory")
    .addEventListener("click", clearHistory);

  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
  }
}

async function handleSaveKey() {
  const apiKey = document.getElementById("apiKey").value.trim();

  if (!apiKey) {
    showMessage("Please enter an API key", "error");
    return;
  }

  await chrome.storage.sync.set({ apiKey });
  showMessage("API key saved successfully!", "success");
  updateSaveButton();
}

async function handleClearKey() {
  await chrome.storage.sync.remove("apiKey");
  document.getElementById("apiKey").value = "";
  showMessage("API key cleared", "info");
  updateSaveButton();
}

async function handleTempChange() {
  const temperature = parseFloat(document.getElementById("temperature").value);
  await chrome.storage.sync.set({ temperature });
}

async function handleSubmit() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const prompt = document.getElementById("prompt").value.trim();
  const temperature = parseFloat(document.getElementById("temperature").value);

  if (!validateInputs(apiKey, prompt)) return;

  const responseDiv = document.getElementById("response");
  const submitBtn = document.getElementById("submit");
  // const submitIconContent = document.getElementById("submitIconContent"); // For changing icon
  const submitText = document.getElementById("submitText");


  showLoadingState(responseDiv, submitBtn, submitText); // Removed icon specific param

  try {
    const response = await callGeminiAPI(apiKey, prompt, temperature);
    const responseText =
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response text found";

    displayResponse(responseText);
    saveToHistory(prompt, responseText);
    document.getElementById("prompt").value = "";
  } catch (error) {
    showMessage(`Error: ${error.message}`, "error");
    console.error("API Error:", error);
  } finally {
    submitBtn.disabled = false;
    // Restore button content
    submitBtn.innerHTML = `<span class="material-icons btn-icon" id="submitIconContent">send</span> <span id="submitText">Get Response</span>`;
  }
}

async function callGeminiAPI(apiKey, prompt, temperature) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:generateContent?key=${apiKey}`;
  const contextualHistory = [];
  for (let i = conversationHistory.length - 1; i >= 0 && contextualHistory.length < (3*2) ; i--) {
    const item = conversationHistory[i];
    if (item.response) {
      contextualHistory.unshift({ role: "model", parts: [{ text: item.response }] });
    }
    if (item.prompt) {
      contextualHistory.unshift({ role: "user", parts: [{ text: item.prompt }] });
    }
  }

  const messages = [
    ...contextualHistory,
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: messages,
      generationConfig: {
        temperature,
        topP: 1,
        topK: 40,
        maxOutputTokens: 4096,
        stopSequences: [],
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.error && errorData.error.message) {
        throw new Error(errorData.error.message);
    } else if (errorData.message) {
        throw new Error(errorData.message);
    }
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function saveToHistory(prompt, response) {
  conversationHistory.push({
    timestamp: new Date().toISOString(),
    prompt,
    response,
  });
  if (conversationHistory.length > CONFIG.maxHistory) {
    conversationHistory.shift();
  }
  chrome.storage.sync.set({ history: conversationHistory });
  updateHistoryUI();
}

async function copyToClipboard() {
  const responseDiv = document.getElementById("response");
  let textToCopy = "";
  if (responseDiv.querySelector(".response-text")) {
      textToCopy = responseDiv.querySelector(".response-text").innerText;
  } else {
      textToCopy = responseDiv.innerText;
  }
  if (!textToCopy.trim()) {
    showMessage("Nothing to copy", "info");
    return;
  }
  try {
    await navigator.clipboard.writeText(textToCopy);
    showMessage("Copied to clipboard!", "success");
  } catch (err) {
    showMessage("Failed to copy", "error");
    console.error("Clipboard copy error:", err);
  }
}

async function clearHistory() {
  conversationHistory = [];
  await chrome.storage.sync.remove("history");
  updateHistoryUI();
  showMessage("History cleared", "info");
}

function displayResponse(responseText) {
  const responseDiv = document.getElementById("response");
  responseDiv.innerHTML = `<div class="response-text">${formatResponseText(
    responseText
  )}</div>`;
}

function formatResponseText(text) {
  let html = text;
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
      const languageClass = lang ? `language-${lang}` : '';
      const escapedCode = code.replace(/</g, "<").replace(/>/g, ">");
      return `<pre><code class="${languageClass}">${escapedCode}</code></pre>`;
  });
  html = html.replace(/`([^`]+?)`/g, (match, code) => {
    const escapedCode = code.replace(/</g, "<").replace(/>/g, ">");
    return `<code>${escapedCode}</code>`;
  });
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/^### (.*$)/gm, "<h6>$1</h6>");
  html = html.replace(/^## (.*$)/gm, "<h5>$1</h5>");
  html = html.replace(/^# (.*$)/gm, "<h4>$1</h4>");
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/\n\n/g, "<br><br>");
  return html;
}

function showMessage(message, type) {
  const messageDiv = document.getElementById("messages");
  messageDiv.innerHTML = ""; // Clear previous
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  messageDiv.appendChild(messageElement);

  setTimeout(() => {
    if (messageElement.parentNode === messageDiv) {
        messageDiv.removeChild(messageElement);
    }
  }, 4000);
}

function updateHistoryUI() {
  const historyContainer = document.getElementById("historyItems");
  if (!historyContainer) return;

  historyContainer.innerHTML = conversationHistory
    .slice()
    .reverse()
    .map(
      (item, indexInReversedArray) => {
        const originalIndex = conversationHistory.length - 1 - indexInReversedArray;
        return `
      <div class="history-item" data-index="${originalIndex}" title="Load: ${item.prompt.substring(0,100)}">
        <div class="history-content">
          <div class="history-prompt">${item.prompt.substring(0, 40)}${
            item.prompt.length > 40 ? "..." : ""
          }</div>
          <div class="history-time">${new Date(
            item.timestamp
          ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <button class="delete-history icon-btn" data-index="${originalIndex}" title="Delete this chat">
          <span class="material-icons btn-icon">delete_outline</span>
        </button>
      </div>
    `;
    })
    .join("");

  document.querySelectorAll(".delete-history").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      conversationHistory.splice(index, 1);
      await chrome.storage.sync.set({ history: conversationHistory });
      updateHistoryUI();
      showMessage("Chat deleted.", "info");
    });
  });

  document.querySelectorAll(".history-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".delete-history")) {
        return;
      }
      const index = parseInt(item.dataset.index);
      if (conversationHistory[index]) {
        const historyItem = conversationHistory[index];
        document.getElementById("prompt").value = historyItem.prompt;
        displayResponse(historyItem.response);
        showMessage("Loaded chat from history.", "info");
      }
    });
  });

  const historySection = document.getElementById("historySection");
  if (historySection) {
    historySection.style.display = conversationHistory.length > 0 ? "block" : "none";
  }
}

function updateSaveButton() {
  const saveBtnText = document.getElementById("saveKeyText");
  const saveBtnIcon = document.getElementById("saveKeyIcon"); // This is the <span> for Material Icon
  const apiKeyInput = document.getElementById("apiKey");

  if (apiKeyInput.value) {
    if (saveBtnText) saveBtnText.textContent = "Update Key";
    if (saveBtnIcon) saveBtnIcon.textContent = "key"; // Material Icon name for 'update'
  } else {
    if (saveBtnText) saveBtnText.textContent = "Save Key";
    if (saveBtnIcon) saveBtnIcon.textContent = "save"; // Material Icon name for 'save'
  }
}

function validateInputs(apiKey, prompt) {
  if (!apiKey) {
    showMessage("API key required.", "error");
    document.getElementById("apiKey").focus();
    return false;
  }
  if (!prompt) {
    showMessage("Please enter a prompt.", "error");
    document.getElementById("prompt").focus();
    return false;
  }
  return true;
}

function showLoadingState(responseDiv, submitBtn, submitTextElem) {
  responseDiv.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Generating response...</span>
    </div>
  `;
  submitBtn.disabled = true;

  // Replace button content with spinner and text
  submitBtn.innerHTML = `<div class="spinner"></div> <span>Generating...</span>`;
}