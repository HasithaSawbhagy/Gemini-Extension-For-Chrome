document.addEventListener("DOMContentLoaded", async () => {
  await initExtension();
  setupEventListeners();
  await initTheme(); // Initialize theme
});

const CONFIG = {
  model: "gemini-2.5-flash-preview-05-20",
  defaultTemp: 0.7,
  maxHistory: 10,
  themes: ["system", "light", "dark"], // Available themes
  themeIcons: { // Icons for each theme state
    system: "brightness_auto",
    light: "light_mode",
    dark: "dark_mode",
  }
};

let conversationHistory = [];
let currentTheme = "system"; // Default theme

async function initTheme() {
  const storedTheme = await chrome.storage.sync.get("theme");
  if (storedTheme.theme && CONFIG.themes.includes(storedTheme.theme)) {
    currentTheme = storedTheme.theme;
  }
  applyTheme(currentTheme);
  updateThemeButtonIcon();

  // Listen for system theme changes if current theme is 'system'
  if (currentTheme === "system") {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (document.documentElement.getAttribute('data-theme-preference') === 'system') {
        applySystemTheme();
        updateThemeButtonIcon(); // Keep icon as 'system'
      }
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme-preference', theme);
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else if (theme === "dark") {
    document.documentElement.removeAttribute("data-theme"); // Or set to "dark" if you have specific dark styles beyond :root
  } else { // System theme
    applySystemTheme();
  }
  updateThemeButtonIcon();
}

function applySystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.removeAttribute("data-theme"); // Use default (dark)
  } else {
    document.documentElement.setAttribute("data-theme", "light");
  }
}

function updateThemeButtonIcon() {
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    const iconSpan = themeToggleBtn.querySelector("span.material-icons");
    let effectiveTheme = currentTheme;
    if (currentTheme === "system") {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
    }
    // Set title based on the *next* theme for better UX
    let nextThemeIndex = (CONFIG.themes.indexOf(currentTheme) + 1) % CONFIG.themes.length;
    let nextTheme = CONFIG.themes[nextThemeIndex];
    let nextThemeLabel = nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1);


    if (iconSpan) {
      iconSpan.textContent = CONFIG.themeIcons[currentTheme]; // Icon reflects current *preference*
      themeToggleBtn.title = `Switch to ${nextThemeLabel} Theme (Current: ${currentTheme === 'system' ? `System - ${effectiveTheme}` : currentTheme})`;
    }
  }
}


async function toggleTheme() {
  let currentIndex = CONFIG.themes.indexOf(currentTheme);
  currentIndex = (currentIndex + 1) % CONFIG.themes.length;
  currentTheme = CONFIG.themes[currentIndex];
  
  applyTheme(currentTheme);
  await chrome.storage.sync.set({ theme: currentTheme });
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
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { // Allow Cmd+Enter on Mac
        e.preventDefault(); // Prevent new line in textarea
        handleSubmit();
    }
  });

  document
    .getElementById("copyResponse")
    .addEventListener("click", copyToClipboard);
  document
    .getElementById("clearHistory")
    .addEventListener("click", clearHistory);

  // Theme toggle button event listener
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
  document.getElementById("saveKey").textContent = "Update Key";
  document.getElementById("saveKey").innerHTML = `<span class="material-icons">key</span> <span>Update Key</span>`;

}

async function handleClearKey() {
  await chrome.storage.sync.remove("apiKey");
  document.getElementById("apiKey").value = "";
  showMessage("API key cleared", "info");
  document.getElementById("saveKey").textContent = "Save Key";
  document.getElementById("saveKey").innerHTML = `<span class="material-icons">save</span> <span>Save Key</span>`;
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

  showLoadingState(responseDiv, submitBtn);

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
    submitBtn.innerHTML = `<span class="material-icons">send</span> <span>Get Response</span>`;
  }
}

async function callGeminiAPI(apiKey, prompt, temperature) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:generateContent?key=${apiKey}`;

  // Include only the last 3 *pairs* of user prompt and model response for context
  const contextualHistory = [];
  // Iterate backwards to get the most recent history items
  for (let i = conversationHistory.length - 1; i >= 0 && contextualHistory.length < (3*2) ; i--) {
    const item = conversationHistory[i];
    // Add model's response first (if it exists) then user's prompt
    if (item.response) {
      contextualHistory.unshift({ role: "model", parts: [{ text: item.response }] });
    }
    if (item.prompt) {
      contextualHistory.unshift({ role: "user", parts: [{ text: item.prompt }] });
    }
  }


  const messages = [
    ...contextualHistory, // Add processed history
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
        stopSequences: [], // Removed "</response>" as it might be too restrictive or specific
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
    // Check for specific Gemini error structure
    if (errorData.error && errorData.error.message) {
        throw new Error(errorData.error.message);
    } else if (errorData.message) { // General error message
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
  // Get text content, handling potential HTML within the response
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
  // Optionally clear the current response display
  // document.getElementById("response").innerHTML = "";
  showMessage("History cleared", "info");
}

function displayResponse(responseText) {
  const responseDiv = document.getElementById("response");
  // Sanitize the responseText before setting it as innerHTML to prevent XSS
  // For markdown, we need to be careful. A dedicated library like DOMPurify + Marked.js would be safer
  // For now, using the existing formatResponseText and hoping it's relatively safe for typical Gemini output
  responseDiv.innerHTML = `<div class="response-text">${formatResponseText(
    responseText
  )}</div>`;
}

function formatResponseText(text) {
  // Basic Markdown-like formatting
  // Order matters for replacements
  let html = text;

  // Code blocks (```lang\ncode\n```)
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
      const languageClass = lang ? `language-${lang}` : '';
      // Basic HTML escaping for content within code blocks
      const escapedCode = code.replace(/</g, "<").replace(/>/g, ">");
      return `<pre><code class="${languageClass}">${escapedCode}</code></pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+?)`/g, (match, code) => {
    const escapedCode = code.replace(/</g, "<").replace(/>/g, ">");
    return `<code>${escapedCode}</code>`;
  });

  // Bold (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italics (*text*)
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Headings (###, ##, #) - Process larger headings first
  html = html.replace(/^### (.*$)/gm, "<h6>$1</h6>");
  html = html.replace(/^## (.*$)/gm, "<h5>$1</h5>");
  html = html.replace(/^# (.*$)/gm, "<h4>$1</h4>");

  // Links ([text](url))
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Newlines (preserve them, then convert double newlines to <br><br>)
  // Browsers usually collapse multiple spaces, so pre-wrap in CSS is important.
  // This handles explicit paragraph breaks.
  html = html.replace(/\n\n/g, "<br><br>");
  // html = html.replace(/\n/g, "<br>"); // If single newlines should also be <br>

  return html;
}


function showMessage(message, type) {
  const messageDiv = document.getElementById("messages");
  messageDiv.innerHTML = `<div class="message ${type}">${message}</div>`;

  setTimeout(() => {
    if (messageDiv.innerHTML.includes(message)) { // Clear only if it's the same message
        messageDiv.innerHTML = "";
    }
  }, 5000);
}

function updateHistoryUI() {
  const historyContainer = document.getElementById("historyItems");
  if (!historyContainer) return;

  historyContainer.innerHTML = conversationHistory
    .slice() // Create a copy before reversing
    .reverse() // Show newest first
    .map(
      (item, indexInReversedArray) => {
        const originalIndex = conversationHistory.length - 1 - indexInReversedArray; // Calculate original index
        return `
      <div class="history-item" data-index="${originalIndex}" title="Click to load. Prompt: ${item.prompt.substring(0,100)}...">
        <div class="history-content">
          <div class="history-prompt">${item.prompt.substring(0, 50)}${
            item.prompt.length > 50 ? "..." : ""
          }</div>
          <div class="history-time">${new Date(
            item.timestamp
          ).toLocaleTimeString()}</div>
        </div>
        <button class="delete-history icon-btn" data-index="${originalIndex}" title="Delete this chat">
          <span class="material-icons">delete_outline</span>
        </button>
      </div>
    `;
    })
    .join("");

  document.querySelectorAll(".delete-history").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation(); // Prevent history item click
      const index = parseInt(btn.dataset.index);
      conversationHistory.splice(index, 1);
      await chrome.storage.sync.set({ history: conversationHistory });
      updateHistoryUI();
      showMessage("Chat deleted from history.", "info");
    });
  });

  document.querySelectorAll(".history-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      // Ensure the click is not on the delete button or its child span
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
  const saveBtn = document.getElementById("saveKey");
  const apiKeyInput = document.getElementById("apiKey");
  if (apiKeyInput.value) {
    saveBtn.innerHTML = `<span class="material-icons">key</span> <span>Update Key</span>`;
  } else {
    saveBtn.innerHTML = `<span class="material-icons">save</span> <span>Save Key</span>`;
  }
}

function validateInputs(apiKey, prompt) {
  if (!apiKey) {
    showMessage("API key required. Please enter your Google AI Studio API key.", "error");
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

function showLoadingState(responseDiv, submitBtn) {
  responseDiv.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Generating response...</span>
    </div>
  `;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner" style="width:18px; height:18px; border-width:3px; margin-right:8px;"></div> <span>Generating...</span>`;
}

// Ensure Ctrl+Enter/Cmd+Enter submits the form (already in setupEventListeners, but good to keep in mind)