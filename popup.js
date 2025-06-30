document.addEventListener("DOMContentLoaded", async () => {
  await initExtension();
  setupEventListeners();
  await initTheme();
});

const CONFIG = {
  // model: "gemini-2.5-flash-preview-05-20", // This will now be dynamic
  defaultTemp: 0.7,
  maxHistory: 10,
  themes: ["system", "light", "dark"],
  themeMaterialIcons: {
    system: "brightness_auto",
    light: "light_mode",
    dark: "dark_mode",
  },
  maxPageContentLength: 5000,
  DEFAULT_MODEL_ID: "models/gemini-1.5-flash-latest" // A sensible default
};

let conversationHistory = [];
let currentTheme = "system";
let systemThemeListener = null;
let availableModels = []; // To store fetched models

async function initTheme() {
  const storedTheme = await chrome.storage.sync.get("theme");
  if (storedTheme.theme && CONFIG.themes.includes(storedTheme.theme)) {
    currentTheme = storedTheme.theme;
  }
  if (systemThemeListener) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.removeEventListener("change", systemThemeListener);
    systemThemeListener = null;
  }
  applyTheme(currentTheme);
}

function applyTheme(themePreference) {
  document.documentElement.setAttribute("data-theme-preference", themePreference);
  currentTheme = themePreference;

  if (systemThemeListener) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.removeEventListener("change", systemThemeListener);
    systemThemeListener = null;
  }

  if (themePreference === "light") {
    document.documentElement.removeAttribute("data-theme");
  } else if (themePreference === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    applySystemTheme();
    systemThemeListener = (e) => {
      if (document.documentElement.getAttribute("data-theme-preference") === "system") {
        applySystemTheme();
        updateThemeButtonIcon();
      }
    };
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", systemThemeListener);
  }
  updateThemeButtonIcon();
  chrome.storage.sync.set({ theme: themePreference });
}

function applySystemTheme() {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function updateThemeButtonIcon() {
  const themeIconSpan = document.getElementById("themeIcon");
  const themeToggleBtn = document.getElementById("themeToggleBtn");

  if (themeIconSpan && themeToggleBtn) {
    themeIconSpan.textContent = CONFIG.themeMaterialIcons[currentTheme];
    let effectiveThemeDisplay = currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
    if (currentTheme === "system") {
      const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      effectiveThemeDisplay = `System (${systemIsDark ? "Dark" : "Light"})`;
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

// Function to fetch and populate models
async function fetchAndPopulateModels(apiKey, storedSelectedModelId) {
  const modelSelect = document.getElementById("modelSelect");
  if (!modelSelect) return;

  modelSelect.innerHTML = '<option value="">Fetching models...</option>'; // Placeholder
  modelSelect.disabled = true;

  if (!apiKey) {
    modelSelect.innerHTML = '<option value="">-- Enter API Key --</option>';
    return;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP error ${response.status}`;
      throw new Error(`Failed to fetch models: ${errorMsg}`);
    }
    const data = await response.json();
    
    availableModels = data.models
      .filter(model => model.supportedGenerationMethods?.includes("generateContent"))
      .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)); // Sort by display name or name

    if (availableModels.length > 0) {
      modelSelect.innerHTML = ""; // Clear placeholder
      availableModels.forEach(model => {
        const option = document.createElement("option");
        option.value = model.name; // e.g., "models/gemini-1.5-pro-latest"
        option.textContent = model.displayName || model.name.replace("models/", ""); // User-friendly name
        modelSelect.appendChild(option);
      });

      // Try to select the stored model or a default
      if (storedSelectedModelId && availableModels.some(m => m.name === storedSelectedModelId)) {
        modelSelect.value = storedSelectedModelId;
      } else if (availableModels.some(m => m.name === CONFIG.DEFAULT_MODEL_ID)) {
        modelSelect.value = CONFIG.DEFAULT_MODEL_ID;
        chrome.storage.sync.set({ selectedModel: CONFIG.DEFAULT_MODEL_ID }); // Save default if previous was invalid
      } else if (availableModels.length > 0) {
        modelSelect.value = availableModels[0].name; // Fallback to the first available model
         chrome.storage.sync.set({ selectedModel: availableModels[0].name });
      }
    } else {
      modelSelect.innerHTML = '<option value="">-- No compatible models found --</option>';
    }
  } catch (error) {
    console.error("Error fetching or populating models:", error);
    showMessage(`Error fetching models: ${error.message}`, "error");
    modelSelect.innerHTML = `<option value="">-- Error loading models --</option>`;
  } finally {
    modelSelect.disabled = false;
  }
}


async function initExtension() {
  const data = await chrome.storage.sync.get([
    "apiKey",
    "temperature",
    "history",
    "includePageContent",
    "enableModelSearch",
    "selectedModel" // Load selected model
  ]);

  const apiKeyInput = document.getElementById("apiKey");
  apiKeyInput.value = data.apiKey || "";

  document.getElementById("temperature").value = data.temperature || CONFIG.defaultTemp;
  document.getElementById("tempValue").textContent = data.temperature || CONFIG.defaultTemp;
  conversationHistory = data.history || [];

  const includePageToggle = document.getElementById("includePageContentToggle");
  if (includePageToggle) {
    includePageToggle.checked = !!data.includePageContent;
  }
  const pageContentStatusDiv = document.getElementById("pageContentStatus");
  if (pageContentStatusDiv) {
      pageContentStatusDiv.textContent = "";
  }

  const enableModelSearchToggle = document.getElementById("enableModelSearchToggle");
  if (enableModelSearchToggle) {
    enableModelSearchToggle.checked = !!data.enableModelSearch;
  }
  const modelSearchStatusDiv = document.getElementById("modelSearchStatus");
  if (modelSearchStatusDiv) {
    modelSearchStatusDiv.textContent = "";
  }

  updateHistoryUI();
  updateSaveButton();

  // Fetch models if API key exists
  if (data.apiKey) {
    await fetchAndPopulateModels(data.apiKey, data.selectedModel);
  } else {
     document.getElementById("modelSelect").innerHTML = '<option value="">-- Enter API Key --</option>';
  }
}

function setupEventListeners() {
  document.getElementById("temperature").addEventListener("input", (e) => {
    document.getElementById("tempValue").textContent = e.target.value;
  });

  document.getElementById("saveKey").addEventListener("click", handleSaveKey);
  document.getElementById("clearKey").addEventListener("click", handleClearKey);
  document.getElementById("submit").addEventListener("click", handleSubmit);
  document.getElementById("temperature").addEventListener("change", handleTempChange);
  document.getElementById("prompt").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  });

  document.getElementById("copyResponse").addEventListener("click", copyToClipboard);
  document.getElementById("clearHistory").addEventListener("click", clearHistory);

  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
  }

  const includePageToggle = document.getElementById("includePageContentToggle");
  if (includePageToggle) {
    includePageToggle.addEventListener("change", async (e) => {
      await chrome.storage.sync.set({ includePageContent: e.target.checked });
       const pageContentStatusDiv = document.getElementById("pageContentStatus");
       if (pageContentStatusDiv) {
            pageContentStatusDiv.textContent = e.target.checked ? "Page content included." : "Page content excluded.";
            setTimeout(() => { if(pageContentStatusDiv) pageContentStatusDiv.textContent = "";}, 3000);
       }
    });
  }

  const enableModelSearchToggle = document.getElementById("enableModelSearchToggle");
  if (enableModelSearchToggle) {
    enableModelSearchToggle.addEventListener("change", async (e) => {
      await chrome.storage.sync.set({ enableModelSearch: e.target.checked });
      const modelSearchStatusDiv = document.getElementById("modelSearchStatus");
      if (modelSearchStatusDiv) {
        modelSearchStatusDiv.textContent = e.target.checked ? "Model will use search." : "Model search disabled.";
        setTimeout(() => { if (modelSearchStatusDiv) modelSearchStatusDiv.textContent = ""; }, 3000);
      }
    });
  }

  const googleSearchBtn = document.getElementById("googleSearchBtn");
  if (googleSearchBtn) {
    googleSearchBtn.addEventListener("click", handleGoogleSearch);
  }

  // Event listener for model selection change
  const modelSelect = document.getElementById("modelSelect");
  if (modelSelect) {
    modelSelect.addEventListener("change", async (e) => {
      await chrome.storage.sync.set({ selectedModel: e.target.value });
      showMessage(`Model set to: ${e.target.options[e.target.selectedIndex].text}`, "info");
    });
  }
}

async function handleSaveKey() {
  const apiKey = document.getElementById("apiKey").value.trim();
  if (!apiKey) {
    showMessage("Please enter an API key", "error");
    document.getElementById("modelSelect").innerHTML = '<option value="">-- Enter API Key --</option>';
    return;
  }
  // Test key by fetching models before fully saving
  const modelSelect = document.getElementById("modelSelect");
  modelSelect.innerHTML = '<option value="">Validating key & fetching models...</option>';
  modelSelect.disabled = true;

  try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || `API key validation failed (HTTP ${response.status})`;
          throw new Error(errorMsg);
      }
      // If key is valid, proceed to save and populate models
      await chrome.storage.sync.set({ apiKey });
      showMessage("API key saved successfully! Fetching models...", "success");
      updateSaveButton();
      // Fetch models with the new key, and try to retain selection if possible
      const { selectedModel } = await chrome.storage.sync.get("selectedModel");
      await fetchAndPopulateModels(apiKey, selectedModel);

  } catch (error) {
      showMessage(`Error saving API key: ${error.message}`, "error");
      console.error("API Key validation/save error:", error);
      modelSelect.innerHTML = '<option value="">-- Invalid API Key or Network Error --</option>';
      modelSelect.disabled = false; // Re-enable for retry
      // Optionally clear the stored key if validation failed badly
      // await chrome.storage.sync.remove("apiKey");
      // updateSaveButton();
  }
}

async function handleClearKey() {
  await chrome.storage.sync.remove("apiKey");
  await chrome.storage.sync.remove("selectedModel"); // Also clear selected model
  document.getElementById("apiKey").value = "";
  document.getElementById("modelSelect").innerHTML = '<option value="">-- Enter API Key --</option>';
  availableModels = [];
  showMessage("API key cleared", "info");
  updateSaveButton();
}

async function handleTempChange() {
  const temperature = parseFloat(document.getElementById("temperature").value);
  await chrome.storage.sync.set({ temperature });
}

async function getActiveTabContent() {
  const pageContentStatusDiv = document.getElementById("pageContentStatus");
  try {
    if (!chrome.tabs || !chrome.scripting) {
        if (pageContentStatusDiv) pageContentStatusDiv.textContent = "Tab/Scripting API not available.";
        return null;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (pageContentStatusDiv) pageContentStatusDiv.textContent = "No active tab found.";
      return null;
    }
    const tabId = tabs[0].id;
    if (!tabs[0].url || ['chrome://', 'about:', 'file://'].some(prefix => tabs[0].url.startsWith(prefix))) {
        if (pageContentStatusDiv) pageContentStatusDiv.textContent = "Cannot access page content from this type of page.";
        return null;
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        let mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
        return mainContent.innerText;
      }
    });
    return (results && results.length > 0 && results[0].result) ? results[0].result : null;
  } catch (error) {
    console.error("Error getting page content:", error);
    if (pageContentStatusDiv) pageContentStatusDiv.textContent = `Error accessing page.`;
    showMessage(`Error getting page content: ${error.message}`, "error");
    return null;
  }
}

async function handleSubmit() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const userPrompt = document.getElementById("prompt").value.trim();
  const temperature = parseFloat(document.getElementById("temperature").value);
  const selectedModelId = document.getElementById("modelSelect").value;

  if (!selectedModelId || selectedModelId.startsWith("--")) {
      showMessage("Please select a model from the dropdown.", "error");
      if (!apiKey) showMessage("API key is required to select models.", "error");
      return;
  }

  if (!validateInputs(apiKey, userPrompt)) return;

  const responseDiv = document.getElementById("response");
  const submitBtn = document.getElementById("submit");
  showLoadingState(responseDiv, submitBtn);

  let finalPromptSegment = userPrompt;
  let prependedContext = "";

  const enableModelSearchToggle = document.getElementById("enableModelSearchToggle");
  let modelSearchActive = false;
  if (enableModelSearchToggle && enableModelSearchToggle.checked) {
    prependedContext += "When generating your response, please consult Google Search for the latest relevant information and incorporate those findings. ";
    modelSearchActive = true;
  }

  const includePageToggle = document.getElementById("includePageContentToggle");
  const pageContentStatusDiv = document.getElementById("pageContentStatus");
  let pageContentActive = false;

  if (includePageToggle && includePageToggle.checked) {
    if (pageContentStatusDiv) pageContentStatusDiv.textContent = "Reading page...";
    const webpageContent = await getActiveTabContent();
    if (webpageContent) {
      const maxPageLength = CONFIG.maxPageContentLength || 5000;
      const truncatedContent = webpageContent.length > maxPageLength
                              ? webpageContent.substring(0, maxPageLength) + "...\n[Content Truncated]"
                              : webpageContent;
      prependedContext += `Context from the current webpage:\n"""\n${truncatedContent}\n"""\n\n`;
      pageContentActive = true;
      if (pageContentStatusDiv) pageContentStatusDiv.textContent = "Page content included.";
    } else {
      if (pageContentStatusDiv) pageContentStatusDiv.textContent = "No page content.";
    }
    setTimeout(() => { if (pageContentStatusDiv) pageContentStatusDiv.textContent = ""; }, 4000);
  }
  
  const finalPromptForAPI = `${prependedContext}User prompt: ${finalPromptSegment}`;

  if (modelSearchActive && pageContentActive) {
    showMessage("Including page content & model will attempt search.", "info");
  } else if (modelSearchActive) {
    showMessage("Model will attempt to use Google Search.", "info");
  } else if (pageContentActive) {
    showMessage("Webpage content is being included in the prompt.", "info");
  }

  try {
    const response = await callGeminiAPI(apiKey, finalPromptForAPI, temperature, selectedModelId); // Pass selectedModelId
    const responseText =
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response text found";

    displayResponse(responseText);
    saveToHistory(userPrompt, responseText);
    document.getElementById("prompt").value = "";
  } catch (error) {
    showMessage(`Error: ${error.message}`, "error");
    console.error("API Error:", error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span class="material-icons btn-icon" id="submitIconContent">send</span> <span id="submitText">Get Response</span>`;
  }
}

async function callGeminiAPI(apiKey, prompt, temperature, modelId) { // Added modelId parameter
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelId}:generateContent?key=${apiKey}`; // Use modelId
  const contextualHistory = [];

  for (
    let i = conversationHistory.length - 1;
    i >= 0 && contextualHistory.length < 3 * 2;
    i--
  ) {
    const item = conversationHistory[i];
    if (item.response) {
      contextualHistory.unshift({
        role: "model",
        parts: [{ text: item.response }],
      });
    }
    if (item.prompt) {
      contextualHistory.unshift({
        role: "user",
        parts: [{ text: item.prompt }],
      });
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
  responseDiv.innerHTML = `<div class="response-text">${formatResponseText(responseText)}</div>`;
}

function formatResponseText(text) {
  let html = text;
  html = html.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
    const languageClass = lang ? `language-${lang}` : "";
    return `<pre><code class="${languageClass}">${code}</code></pre>`;
  });
  html = html.replace(/`([^`]+?)`/g, (match, code) => `<code>${code}</code>`);
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/^### (.*$)/gm, "<h6>$1</h6>");
  html = html.replace(/^## (.*$)/gm, "<h5>$1</h5>");
  html = html.replace(/^# (.*$)/gm, "<h4>$1</h4>");
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, (match, linkText, url) => {
    const unescapedLinkText = linkText.replace(/</g, "<").replace(/>/g, ">");
    const unescapedUrl = url.replace(/</g, "<").replace(/>/g, ">");
    return `<a href="${unescapedUrl}" target="_blank" rel="noopener noreferrer">${unescapedLinkText}</a>`;
  });
  html = html.replace(/\n\n/g, "<br><br>"); 
  html = html.replace(/(?<!<br>)\n(?!<br>)/g, "<br>");
  return html;
}

function showMessage(message, type) {
  const messageDiv = document.getElementById("messages");
  const existingMessage = messageDiv.firstChild;
  if (existingMessage && (existingMessage.textContent !== message || existingMessage.classList.contains('error') || type === 'error')) {
    messageDiv.innerHTML = "";
  } else if (existingMessage && existingMessage.textContent === message) return;

  const messageElement = document.createElement("div");
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  messageDiv.appendChild(messageElement);
  setTimeout(() => {
    if (messageElement.parentNode === messageDiv) messageDiv.removeChild(messageElement);
  }, 4000);
}

function updateHistoryUI() {
  const historyContainer = document.getElementById("historyItems");
  if (!historyContainer) return;
  historyContainer.innerHTML = conversationHistory.slice().reverse().map((item, indexInReversedArray) => {
    const originalIndex = conversationHistory.length - 1 - indexInReversedArray;
    return `
      <div class="history-item" data-index="${originalIndex}" title="Load: ${item.prompt.substring(0,100)}">
        <div class="history-content">
          <div class="history-prompt">${item.prompt.substring(0, 40)}${item.prompt.length > 40 ? "..." : ""}</div>
          <div class="history-time">${new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <button class="delete-history icon-btn" data-index="${originalIndex}" title="Delete this chat">
          <span class="material-icons btn-icon">delete_outline</span>
        </button>
      </div>`;
  }).join("");

  document.querySelectorAll(".delete-history").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      conversationHistory.splice(index, 1);
      await chrome.storage.sync.set({ history: conversationHistory });
      updateHistoryUI();
      showMessage("Chat deleted.", "info");
    });
  });

  document.querySelectorAll(".history-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".delete-history")) return;
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
  if (historySection) historySection.style.display = conversationHistory.length > 0 ? "block" : "none";
}

function updateSaveButton() {
  const saveBtnText = document.getElementById("saveKeyText");
  const saveBtnIcon = document.getElementById("saveKeyIcon");
  const apiKeyInput = document.getElementById("apiKey");
  if (apiKeyInput && apiKeyInput.value) {
    if (saveBtnText) saveBtnText.textContent = "Update Key";
    if (saveBtnIcon) saveBtnIcon.textContent = "key";
  } else {
    if (saveBtnText) saveBtnText.textContent = "Save Key";
    if (saveBtnIcon) saveBtnIcon.textContent = "save";
  }
}

function validateInputs(apiKey, prompt) {
  if (!apiKey) {
    showMessage("API key required.", "error");
    document.getElementById("apiKey")?.focus();
    return false;
  }
  if (!prompt) {
    showMessage("Please enter a prompt.", "error");
    document.getElementById("prompt")?.focus();
    return false;
  }
  return true;
}

function showLoadingState(responseDiv, submitBtn) {
  responseDiv.innerHTML = `<div class="loading"><div class="spinner"></div><span>Generating response...</span></div>`;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner"></div> <span>Generating...</span>`;
}

async function handleGoogleSearch() {
  const promptText = document.getElementById("prompt").value.trim();
  if (promptText) {
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(promptText)}`;
    chrome.tabs.create({ url: googleSearchUrl });
  } else {
    showMessage("Please enter text in the prompt to search.", "info");
    document.getElementById("prompt")?.focus();
  }
}