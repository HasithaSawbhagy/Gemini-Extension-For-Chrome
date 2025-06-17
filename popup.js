document.addEventListener("DOMContentLoaded", async () => {
  await initExtension();
  setupEventListeners();
  await initTheme(); // Initialize theme after other elements are ready
});

const CONFIG = {
  model: "gemini-2.5-flash-preview-05-20",
  defaultTemp: 0.7,
  maxHistory: 10,
  themes: ["system", "light", "dark"],
  themeMaterialIcons: {
    system: "brightness_auto",
    light: "light_mode",
    dark: "dark_mode",
  },
  // maxPageContentLength: 5000, // Optional: configure max characters for page content
};

let conversationHistory = [];
let currentTheme = "system";
let systemThemeListener = null; // To manage the system theme media query listener

async function initTheme() {
  const storedTheme = await chrome.storage.sync.get("theme");
  if (storedTheme.theme && CONFIG.themes.includes(storedTheme.theme)) {
    currentTheme = storedTheme.theme;
  }
  // Ensure any pre-existing listener is cleared before applying and potentially adding a new one
  if (systemThemeListener) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.removeEventListener("change", systemThemeListener);
    systemThemeListener = null;
  }
  applyTheme(currentTheme); // This will set data-theme, update button icon, and add listener if needed
}

function applyTheme(themePreference) {
  document.documentElement.setAttribute("data-theme-preference", themePreference);
  currentTheme = themePreference;

  // Remove existing system theme listener before setting up a new one or none
  if (systemThemeListener) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.removeEventListener("change", systemThemeListener);
    systemThemeListener = null;
  }

  if (themePreference === "light") {
    document.documentElement.removeAttribute("data-theme");
  } else if (themePreference === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else { // System theme
    applySystemTheme();
    // Add listener for system theme changes ONLY if current preference is 'system'
    systemThemeListener = (e) => {
      if (document.documentElement.getAttribute("data-theme-preference") === "system") {
        applySystemTheme();
        updateThemeButtonIcon(); // Ensure icon title updates if system theme changes
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

async function initExtension() {
  const data = await chrome.storage.sync.get([
    "apiKey",
    "temperature",
    "history",
    "includePageContent" // Load preference for including page content
  ]);

  document.getElementById("apiKey").value = data.apiKey || "";
  document.getElementById("temperature").value = data.temperature || CONFIG.defaultTemp;
  document.getElementById("tempValue").textContent = data.temperature || CONFIG.defaultTemp;
  conversationHistory = data.history || [];

  const includePageToggle = document.getElementById("includePageContentToggle");
  if (includePageToggle) {
    includePageToggle.checked = !!data.includePageContent; // Set checkbox state
  }
  const pageContentStatusDiv = document.getElementById("pageContentStatus");
  if (pageContentStatusDiv) {
      pageContentStatusDiv.textContent = ""; // Clear status on init
  }


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

  // Listener for the include page content toggle
  const includePageToggle = document.getElementById("includePageContentToggle");
  if (includePageToggle) {
    includePageToggle.addEventListener("change", async (e) => {
      await chrome.storage.sync.set({ includePageContent: e.target.checked });
       const pageContentStatusDiv = document.getElementById("pageContentStatus");
       if (pageContentStatusDiv) {
            pageContentStatusDiv.textContent = e.target.checked ? "Will include page content." : "Will not include page content.";
            setTimeout(() => { if(pageContentStatusDiv) pageContentStatusDiv.textContent = "";}, 3000);
       }
    });
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

// New function to get content from the active tab
async function getActiveTabContent() {
  const pageContentStatusDiv = document.getElementById("pageContentStatus");
  try {
    if (!chrome.tabs || !chrome.scripting) {
        if (pageContentStatusDiv) pageContentStatusDiv.textContent = "Tab/Scripting API not available.";
        console.warn("Chrome tabs or scripting API not available. Ensure extension context and permissions.");
        return null;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      if (pageContentStatusDiv) pageContentStatusDiv.textContent = "No active tab found.";
      return null;
    }
    const tabId = tabs[0].id;

    // Check if the URL is accessible (not a chrome://, about:, or file:// page by default)
    if (!tabs[0].url || ['chrome://', 'about:', 'file://'].some(prefix => tabs[0].url.startsWith(prefix))) {
        if (pageContentStatusDiv) pageContentStatusDiv.textContent = "Cannot access content from this type of page.";
        console.warn(`Cannot access content from URL: ${tabs[0].url}`);
        return null;
    }


    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Attempt to get meaningful content, not just all text.
        // This is a basic approach. More sophisticated methods (e.g., Readability.js) could be used.
        let mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
        return mainContent.innerText;
      }
    });

    if (results && results.length > 0 && results[0].result) {
      if (pageContentStatusDiv) pageContentStatusDiv.textContent = "Page content retrieved.";
      return results[0].result;
    } else {
      if (pageContentStatusDiv) pageContentStatusDiv.textContent = "No content extracted from page.";
      return null;
    }
  } catch (error) {
    console.error("Error getting page content:", error);
    if (pageContentStatusDiv) pageContentStatusDiv.textContent = `Error accessing page. Check console.`;
    // Suggest checking permissions if a common error occurs
    if (error.message.includes("Cannot access a chrome:// URL") || error.message.includes("No tab with id") || error.message.includes("scripting permission")) {
        showMessage("Cannot access page content. Ensure you are on a valid webpage (http/https) and the extension has 'scripting' and 'activeTab' permissions.", "error");
    } else {
        showMessage(`Error getting page content: ${error.message}`, "error");
    }
    return null;
  }
}

async function handleSubmit() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const userPrompt = document.getElementById("prompt").value.trim(); // Renamed to avoid conflict
  const temperature = parseFloat(document.getElementById("temperature").value);

  if (!validateInputs(apiKey, userPrompt)) return;

  const responseDiv = document.getElementById("response");
  const submitBtn = document.getElementById("submit");
  const submitText = document.getElementById("submitText"); // Assuming this ID exists for button text

  showLoadingState(responseDiv, submitBtn, submitText);

  let finalPrompt = userPrompt;
  const includePageToggle = document.getElementById("includePageContentToggle");
  const pageContentStatusDiv = document.getElementById("pageContentStatus");

  if (includePageToggle && includePageToggle.checked) {
    if (pageContentStatusDiv) pageContentStatusDiv.textContent = "Reading page content...";
    const webpageContent = await getActiveTabContent(); // Call the new function
    if (pageContentStatusDiv) pageContentStatusDiv.textContent = webpageContent ? "Page content included." : "Could not get page content.";


    if (webpageContent) {
      const maxPageLength = CONFIG.maxPageContentLength || 5000; // Use config or default
      const truncatedContent = webpageContent.length > maxPageLength
                              ? webpageContent.substring(0, maxPageLength) + "...\n[Content Truncated]"
                              : webpageContent;
      finalPrompt = `Context from the current webpage:\n"""\n${truncatedContent}\n"""\n\nUser prompt: ${userPrompt}`;
      showMessage("Webpage content is being included in the prompt.", "info");
    } else {
      showMessage("Proceeding with prompt only; page content could not be retrieved or was empty.", "info");
    }
    // Clear status message after a few seconds
    setTimeout(() => { if (pageContentStatusDiv) pageContentStatusDiv.textContent = ""; }, 4000);
  }


  try {
    const response = await callGeminiAPI(apiKey, finalPrompt, temperature); // Use finalPrompt
    const responseText =
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response text found";

    displayResponse(responseText);
    saveToHistory(userPrompt, responseText); // Save original userPrompt for history clarity
    document.getElementById("prompt").value = "";
  } catch (error) {
    showMessage(`Error: ${error.message}`, "error");
    console.error("API Error:", error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span class="material-icons btn-icon" id="submitIconContent">send</span> <span id="submitText">Get Response</span>`;
  }
}

async function callGeminiAPI(apiKey, prompt, temperature) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:generateContent?key=${apiKey}`;
  const contextualHistory = [];

  // Build history, ensuring not to exceed a certain token/message limit for context
  // This part remains the same, as page content is prepended to the *current* prompt
  for (
    let i = conversationHistory.length - 1;
    i >= 0 && contextualHistory.length < 3 * 2; // e.g., last 3 pairs of user/model
    i--
  ) {
    const item = conversationHistory[i];
    if (item.response) {
      contextualHistory.unshift({
        role: "model",
        parts: [{ text: item.response }],
      });
    }
    if (item.prompt) { // Assuming item.prompt is the original user prompt without page content
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
      parts: [{ text: prompt }], // This 'prompt' now contains the page content + user's question
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
        maxOutputTokens: 4096, // Be mindful of input length with page content
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

function saveToHistory(prompt, response) { // prompt is the original user prompt
  conversationHistory.push({
    timestamp: new Date().toISOString(),
    prompt, // Store the original user prompt, not the one with page content
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
  // Escape HTML characters first to prevent XSS if code blocks contain them
  html = html.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");

  // Code blocks: ```lang\ncode\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
    const languageClass = lang ? `language-${lang}` : "";
    // No need to re-escape 'code' here as the whole 'html' was already escaped
    return `<pre><code class="${languageClass}">${code}</code></pre>`;
  });

  // Inline code: `code`
  html = html.replace(/`([^`]+?)`/g, (match, code) => {
    // No need to re-escape 'code'
    return `<code>${code}</code>`;
  });

  // Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italics: *text* (ensure it doesn't conflict with bold)
  html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");


  // Headings (simplified from original to avoid complex regex)
  html = html.replace(/^### (.*$)/gm, "<h6>$1</h6>");
  html = html.replace(/^## (.*$)/gm, "<h5>$1</h5>");
  html = html.replace(/^# (.*$)/gm, "<h4>$1</h4>");

  // Links: [text](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, (match, linkText, url) => {
    // Re-insert < and > for the anchor tag, as they were escaped earlier
    const unescapedLinkText = linkText.replace(/</g, "<").replace(/>/g, ">");
    const unescapedUrl = url.replace(/</g, "<").replace(/>/g, ">");
    return `<a href="${unescapedUrl}" target="_blank" rel="noopener noreferrer">${unescapedLinkText}</a>`;
  });
  
  // Paragraphs (simple newline to <br> conversion, might need more sophisticated logic for actual <p> tags)
  html = html.replace(/\n\n/g, "<br><br>"); // For double newlines
  html = html.replace(/(?<!<br>)\n(?!<br>)/g, "<br>"); // For single newlines, avoid creating <br><br><br>

  // Restore < and > if they were meant to be literal and not part of Markdown/HTML
  // This part is tricky. Generally, if they are not part of the Markdown structures handled above,
  // they should remain escaped to prevent XSS from the model's output.
  // The initial blanket escaping handles security. The replacements above unescape specific parts (like links).

  return html;
}


function showMessage(message, type) {
  const messageDiv = document.getElementById("messages");
  messageDiv.innerHTML = ""; // Clear previous
  const messageElement = document.createElement("div");
  messageElement.className = `message ${type}`; // Ensure you have CSS for .message.info, .message.success, .message.error
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
    .map((item, indexInReversedArray) => {
      const originalIndex = conversationHistory.length - 1 - indexInReversedArray;
      return `
      <div class="history-item" data-index="${originalIndex}" title="Load: ${item.prompt.substring(0, 100)}">
        <div class="history-content">
          <div class="history-prompt">${item.prompt.substring(0, 40)}${item.prompt.length > 40 ? "..." : ""}</div>
          <div class="history-time">${new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
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
  if (historySection) {
    historySection.style.display = conversationHistory.length > 0 ? "block" : "none";
  }
}

function updateSaveButton() {
  const saveBtnText = document.getElementById("saveKeyText");
  const saveBtnIcon = document.getElementById("saveKeyIcon");
  const apiKeyInput = document.getElementById("apiKey");

  if (apiKeyInput && apiKeyInput.value) { // Added null check for apiKeyInput
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
    const apiKeyInput = document.getElementById("apiKey");
    if (apiKeyInput) apiKeyInput.focus();
    return false;
  }
  if (!prompt) {
    showMessage("Please enter a prompt.", "error");
    const promptInput = document.getElementById("prompt");
    if (promptInput) promptInput.focus();
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
  submitBtn.innerHTML = `<div class="spinner"></div> <span>Generating...</span>`;
}

// document.addEventListener("DOMContentLoaded", async () => {
//   await initExtension();
//   setupEventListeners();
//   await initTheme();
// });

// const CONFIG = {
//   model: "gemini-2.5-flash-preview-05-20",
//   defaultTemp: 0.7,
//   maxHistory: 10,
//   themes: ["system", "light", "dark"],
//   themeMaterialIcons: {
//     // Material Icon names for theme toggle
//     system: "brightness_auto", // Or a more specific system/auto icon
//     light: "light_mode",
//     dark: "dark_mode",
//   },
//   // No longer need iconPaths for local files
// };

// let conversationHistory = [];
// let currentTheme = "system"; // Default: follow system

// async function initTheme() {
//   const storedTheme = await chrome.storage.sync.get("theme");
//   if (storedTheme.theme && CONFIG.themes.includes(storedTheme.theme)) {
//     currentTheme = storedTheme.theme;
//   }
//   applyTheme(currentTheme); // This will set data-theme and update button icon

//   // Listen for system theme changes if current theme preference is 'system'
//   if (currentTheme === "system") {
//     window
//       .matchMedia("(prefers-color-scheme: dark)")
//       .addEventListener("change", (e) => {
//         if (
//           document.documentElement.getAttribute("data-theme-preference") ===
//           "system"
//         ) {
//           applySystemTheme();
//           // Theme button icon should remain as 'system' icon, title will update
//           updateThemeButtonIcon();
//         }
//       });
//   }
// }

// function applyTheme(themePreference) {
//   document.documentElement.setAttribute(
//     "data-theme-preference",
//     themePreference
//   );
//   currentTheme = themePreference; // Update global currentTheme

//   if (themePreference === "light") {
//     document.documentElement.removeAttribute("data-theme"); // Uses :root default (light)
//   } else if (themePreference === "dark") {
//     document.documentElement.setAttribute("data-theme", "dark");
//   } else {
//     // System theme
//     applySystemTheme();
//   }
//   updateThemeButtonIcon();
//   chrome.storage.sync.set({ theme: themePreference });
// }

// function applySystemTheme() {
//   if (
//     window.matchMedia &&
//     window.matchMedia("(prefers-color-scheme: dark)").matches
//   ) {
//     document.documentElement.setAttribute("data-theme", "dark");
//   } else {
//     document.documentElement.removeAttribute("data-theme"); // Default to light as per :root
//   }
// }

// function updateThemeButtonIcon() {
//   const themeIconSpan = document.getElementById("themeIcon"); // Get the span
//   const themeToggleBtn = document.getElementById("themeToggleBtn");

//   if (themeIconSpan && themeToggleBtn) {
//     themeIconSpan.textContent = CONFIG.themeMaterialIcons[currentTheme]; // Set Material Icon name

//     let effectiveThemeDisplay =
//       currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
//     if (currentTheme === "system") {
//       effectiveThemeDisplay = `System (${
//         window.matchMedia("(prefers-color-scheme: dark)").matches
//           ? "Dark"
//           : "Light"
//       })`;
//     }
//     let nextThemeIndex =
//       (CONFIG.themes.indexOf(currentTheme) + 1) % CONFIG.themes.length;
//     let nextThemeName = CONFIG.themes[nextThemeIndex];
//     nextThemeName =
//       nextThemeName.charAt(0).toUpperCase() + nextThemeName.slice(1);

//     themeToggleBtn.title = `Switch to ${nextThemeName} Theme (Current: ${effectiveThemeDisplay})`;
//   }
// }

// async function toggleTheme() {
//   let currentIndex = CONFIG.themes.indexOf(currentTheme);
//   currentIndex = (currentIndex + 1) % CONFIG.themes.length;
//   const newTheme = CONFIG.themes[currentIndex];
//   applyTheme(newTheme);
// }

// async function initExtension() {
//   const { apiKey, temperature, history } = await chrome.storage.sync.get([
//     "apiKey",
//     "temperature",
//     "history",
//   ]);

//   document.getElementById("apiKey").value = apiKey || "";
//   document.getElementById("temperature").value =
//     temperature || CONFIG.defaultTemp;
//   document.getElementById("tempValue").textContent =
//     temperature || CONFIG.defaultTemp;
//   conversationHistory = history || [];

//   updateHistoryUI();
//   updateSaveButton();
// }

// function setupEventListeners() {
//   document.getElementById("temperature").addEventListener("input", (e) => {
//     document.getElementById("tempValue").textContent = e.target.value;
//   });

//   document.getElementById("saveKey").addEventListener("click", handleSaveKey);
//   document.getElementById("clearKey").addEventListener("click", handleClearKey);
//   document.getElementById("submit").addEventListener("click", handleSubmit);
//   document
//     .getElementById("temperature")
//     .addEventListener("change", handleTempChange);
//   document.getElementById("prompt").addEventListener("keydown", (e) => {
//     if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
//       e.preventDefault();
//       handleSubmit();
//     }
//   });

//   document
//     .getElementById("copyResponse")
//     .addEventListener("click", copyToClipboard);
//   document
//     .getElementById("clearHistory")
//     .addEventListener("click", clearHistory);

//   const themeToggleBtn = document.getElementById("themeToggleBtn");
//   if (themeToggleBtn) {
//     themeToggleBtn.addEventListener("click", toggleTheme);
//   }
// }

// async function handleSaveKey() {
//   const apiKey = document.getElementById("apiKey").value.trim();

//   if (!apiKey) {
//     showMessage("Please enter an API key", "error");
//     return;
//   }

//   await chrome.storage.sync.set({ apiKey });
//   showMessage("API key saved successfully!", "success");
//   updateSaveButton();
// }

// async function handleClearKey() {
//   await chrome.storage.sync.remove("apiKey");
//   document.getElementById("apiKey").value = "";
//   showMessage("API key cleared", "info");
//   updateSaveButton();
// }

// async function handleTempChange() {
//   const temperature = parseFloat(document.getElementById("temperature").value);
//   await chrome.storage.sync.set({ temperature });
// }

// async function handleSubmit() {
//   const apiKey = document.getElementById("apiKey").value.trim();
//   const prompt = document.getElementById("prompt").value.trim();
//   const temperature = parseFloat(document.getElementById("temperature").value);

//   if (!validateInputs(apiKey, prompt)) return;

//   const responseDiv = document.getElementById("response");
//   const submitBtn = document.getElementById("submit");
//   // const submitIconContent = document.getElementById("submitIconContent"); // For changing icon
//   const submitText = document.getElementById("submitText");

//   showLoadingState(responseDiv, submitBtn, submitText); // Removed icon specific param

//   try {
//     const response = await callGeminiAPI(apiKey, prompt, temperature);
//     const responseText =
//       response.candidates?.[0]?.content?.parts?.[0]?.text ||
//       "No response text found";

//     displayResponse(responseText);
//     saveToHistory(prompt, responseText);
//     document.getElementById("prompt").value = "";
//   } catch (error) {
//     showMessage(`Error: ${error.message}`, "error");
//     console.error("API Error:", error);
//   } finally {
//     submitBtn.disabled = false;
//     // Restore button content
//     submitBtn.innerHTML = `<span class="material-icons btn-icon" id="submitIconContent">send</span> <span id="submitText">Get Response</span>`;
//   }
// }

// async function callGeminiAPI(apiKey, prompt, temperature) {
//   const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:generateContent?key=${apiKey}`;
//   const contextualHistory = [];
//   for (
//     let i = conversationHistory.length - 1;
//     i >= 0 && contextualHistory.length < 3 * 2;
//     i--
//   ) {
//     const item = conversationHistory[i];
//     if (item.response) {
//       contextualHistory.unshift({
//         role: "model",
//         parts: [{ text: item.response }],
//       });
//     }
//     if (item.prompt) {
//       contextualHistory.unshift({
//         role: "user",
//         parts: [{ text: item.prompt }],
//       });
//     }
//   }

//   const messages = [
//     ...contextualHistory,
//     {
//       role: "user",
//       parts: [{ text: prompt }],
//     },
//   ];

//   const response = await fetch(url, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({
//       contents: messages,
//       generationConfig: {
//         temperature,
//         topP: 1,
//         topK: 40,
//         maxOutputTokens: 4096,
//         stopSequences: [],
//       },
//       safetySettings: [
//         {
//           category: "HARM_CATEGORY_HARASSMENT",
//           threshold: "BLOCK_MEDIUM_AND_ABOVE",
//         },
//         {
//           category: "HARM_CATEGORY_HATE_SPEECH",
//           threshold: "BLOCK_MEDIUM_AND_ABOVE",
//         },
//         {
//           category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
//           threshold: "BLOCK_MEDIUM_AND_ABOVE",
//         },
//         {
//           category: "HARM_CATEGORY_DANGEROUS_CONTENT",
//           threshold: "BLOCK_MEDIUM_AND_ABOVE",
//         },
//       ],
//     }),
//   });

//   if (!response.ok) {
//     const errorData = await response.json().catch(() => ({}));
//     if (errorData.error && errorData.error.message) {
//       throw new Error(errorData.error.message);
//     } else if (errorData.message) {
//       throw new Error(errorData.message);
//     }
//     throw new Error(`API error: ${response.status} ${response.statusText}`);
//   }
//   return response.json();
// }

// function saveToHistory(prompt, response) {
//   conversationHistory.push({
//     timestamp: new Date().toISOString(),
//     prompt,
//     response,
//   });
//   if (conversationHistory.length > CONFIG.maxHistory) {
//     conversationHistory.shift();
//   }
//   chrome.storage.sync.set({ history: conversationHistory });
//   updateHistoryUI();
// }

// async function copyToClipboard() {
//   const responseDiv = document.getElementById("response");
//   let textToCopy = "";
//   if (responseDiv.querySelector(".response-text")) {
//     textToCopy = responseDiv.querySelector(".response-text").innerText;
//   } else {
//     textToCopy = responseDiv.innerText;
//   }
//   if (!textToCopy.trim()) {
//     showMessage("Nothing to copy", "info");
//     return;
//   }
//   try {
//     await navigator.clipboard.writeText(textToCopy);
//     showMessage("Copied to clipboard!", "success");
//   } catch (err) {
//     showMessage("Failed to copy", "error");
//     console.error("Clipboard copy error:", err);
//   }
// }

// async function clearHistory() {
//   conversationHistory = [];
//   await chrome.storage.sync.remove("history");
//   updateHistoryUI();
//   showMessage("History cleared", "info");
// }

// function displayResponse(responseText) {
//   const responseDiv = document.getElementById("response");
//   responseDiv.innerHTML = `<div class="response-text">${formatResponseText(
//     responseText
//   )}</div>`;
// }

// function formatResponseText(text) {
//   let html = text;
//   html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
//     const languageClass = lang ? `language-${lang}` : "";
//     const escapedCode = code.replace(/</g, "<").replace(/>/g, ">");
//     return `<pre><code class="${languageClass}">${escapedCode}</code></pre>`;
//   });
//   html = html.replace(/`([^`]+?)`/g, (match, code) => {
//     const escapedCode = code.replace(/</g, "<").replace(/>/g, ">");
//     return `<code>${escapedCode}</code>`;
//   });
//   html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
//   html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
//   html = html.replace(/^### (.*$)/gm, "<h6>$1</h6>");
//   html = html.replace(/^## (.*$)/gm, "<h5>$1</h5>");
//   html = html.replace(/^# (.*$)/gm, "<h4>$1</h4>");
//   html = html.replace(
//     /\[(.*?)\]\((.*?)\)/g,
//     '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
//   );
//   html = html.replace(/\n\n/g, "<br><br>");
//   return html;
// }

// function showMessage(message, type) {
//   const messageDiv = document.getElementById("messages");
//   messageDiv.innerHTML = ""; // Clear previous
//   const messageElement = document.createElement("div");
//   messageElement.className = `message ${type}`;
//   messageElement.textContent = message;
//   messageDiv.appendChild(messageElement);

//   setTimeout(() => {
//     if (messageElement.parentNode === messageDiv) {
//       messageDiv.removeChild(messageElement);
//     }
//   }, 4000);
// }

// function updateHistoryUI() {
//   const historyContainer = document.getElementById("historyItems");
//   if (!historyContainer) return;

//   historyContainer.innerHTML = conversationHistory
//     .slice()
//     .reverse()
//     .map((item, indexInReversedArray) => {
//       const originalIndex =
//         conversationHistory.length - 1 - indexInReversedArray;
//       return `
//       <div class="history-item" data-index="${originalIndex}" title="Load: ${item.prompt.substring(
//         0,
//         100
//       )}">
//         <div class="history-content">
//           <div class="history-prompt">${item.prompt.substring(0, 40)}${
//         item.prompt.length > 40 ? "..." : ""
//       }</div>
//           <div class="history-time">${new Date(
//             item.timestamp
//           ).toLocaleTimeString([], {
//             hour: "2-digit",
//             minute: "2-digit",
//           })}</div>
//         </div>
//         <button class="delete-history icon-btn" data-index="${originalIndex}" title="Delete this chat">
//           <span class="material-icons btn-icon">delete_outline</span>
//         </button>
//       </div>
//     `;
//     })
//     .join("");

//   document.querySelectorAll(".delete-history").forEach((btn) => {
//     btn.addEventListener("click", async (e) => {
//       e.stopPropagation();
//       const index = parseInt(btn.dataset.index);
//       conversationHistory.splice(index, 1);
//       await chrome.storage.sync.set({ history: conversationHistory });
//       updateHistoryUI();
//       showMessage("Chat deleted.", "info");
//     });
//   });

//   document.querySelectorAll(".history-item").forEach((item) => {
//     item.addEventListener("click", (e) => {
//       if (e.target.closest(".delete-history")) {
//         return;
//       }
//       const index = parseInt(item.dataset.index);
//       if (conversationHistory[index]) {
//         const historyItem = conversationHistory[index];
//         document.getElementById("prompt").value = historyItem.prompt;
//         displayResponse(historyItem.response);
//         showMessage("Loaded chat from history.", "info");
//       }
//     });
//   });

//   const historySection = document.getElementById("historySection");
//   if (historySection) {
//     historySection.style.display =
//       conversationHistory.length > 0 ? "block" : "none";
//   }
// }

// function updateSaveButton() {
//   const saveBtnText = document.getElementById("saveKeyText");
//   const saveBtnIcon = document.getElementById("saveKeyIcon"); // This is the <span> for Material Icon
//   const apiKeyInput = document.getElementById("apiKey");

//   if (apiKeyInput.value) {
//     if (saveBtnText) saveBtnText.textContent = "Update Key";
//     if (saveBtnIcon) saveBtnIcon.textContent = "key"; // Material Icon name for 'update'
//   } else {
//     if (saveBtnText) saveBtnText.textContent = "Save Key";
//     if (saveBtnIcon) saveBtnIcon.textContent = "save"; // Material Icon name for 'save'
//   }
// }

// function validateInputs(apiKey, prompt) {
//   if (!apiKey) {
//     showMessage("API key required.", "error");
//     document.getElementById("apiKey").focus();
//     return false;
//   }
//   if (!prompt) {
//     showMessage("Please enter a prompt.", "error");
//     document.getElementById("prompt").focus();
//     return false;
//   }
//   return true;
// }

// function showLoadingState(responseDiv, submitBtn, submitTextElem) {
//   responseDiv.innerHTML = `
//     <div class="loading">
//       <div class="spinner"></div>
//       <span>Generating response...</span>
//     </div>
//   `;
//   submitBtn.disabled = true;

//   // Replace button content with spinner and text
//   submitBtn.innerHTML = `<div class="spinner"></div> <span>Generating...</span>`;
// }
