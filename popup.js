document.addEventListener("DOMContentLoaded", async () => {
  await initExtension();
  setupEventListeners();
});

const CONFIG = {
  model: "gemini-2.5-flash-preview-05-20",
  defaultTemp: 0.7,
  maxHistory: 10
};

let conversationHistory = [];

async function initExtension() {
  const { apiKey, temperature, history } = await chrome.storage.sync.get([
    "apiKey",
    "temperature",
    "history"
  ]);

  document.getElementById("apiKey").value = apiKey || "";
  document.getElementById("temperature").value = temperature || CONFIG.defaultTemp;
  document.getElementById("tempValue").textContent = temperature || CONFIG.defaultTemp;
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
  document.getElementById("temperature").addEventListener("change", handleTempChange);
  document.getElementById("prompt").addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") handleSubmit();
  });

  document.getElementById("copyResponse").addEventListener("click", copyToClipboard);
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
}

async function handleClearKey() {
  await chrome.storage.sync.remove("apiKey");
  document.getElementById("apiKey").value = "";
  showMessage("API key cleared", "info");
  document.getElementById("saveKey").textContent = "Save Key";
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
    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || "No response text found";
    
    displayResponse(responseText);
    saveToHistory(prompt, responseText);
  } catch (error) {
    showMessage(`Error: ${error.message}`, "error");
    console.error("API Error:", error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Get Response";
  }
}

async function callGeminiAPI(apiKey, prompt, temperature) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:generateContent?key=${apiKey}`;
  
  const messages = [
    ...conversationHistory.slice(-3).map(item => ({
      role: "user",
      parts: [{ text: item.prompt }]
    })),
    {
      role: "user",
      parts: [{ text: prompt }]
    }
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
        stopSequences: ["</response>"]
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH"
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  return response.json();
}

function saveToHistory(prompt, response) {
  conversationHistory.push({
    timestamp: new Date().toISOString(),
    prompt,
    response
  });

  if (conversationHistory.length > CONFIG.maxHistory) {
    conversationHistory.shift();
  }

  chrome.storage.sync.set({ history: conversationHistory });
  updateHistoryUI();
}

async function copyToClipboard() {
  const responseText = document.getElementById("response").innerText;
  try {
    await navigator.clipboard.writeText(responseText);
    showMessage("Copied to clipboard!", "success");
  } catch (err) {
    showMessage("Failed to copy", "error");
  }
}

function displayResponse(responseText) {
  const responseDiv = document.getElementById("response");
  responseDiv.innerHTML = `<div class="response-text">${formatResponseText(responseText)}</div>`;
}

function formatResponseText(text) {
  return text
    .replace(/```(\w*)\n([\s\S]*?)\n```/g, "<pre><code>$2</code></pre>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/^# (.*$)/gm, "<h4>$1</h4>")
    .replace(/^## (.*$)/gm, "<h5>$1</h5>")
    .replace(/^### (.*$)/gm, "<h6>$1</h6>")
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
}

function showMessage(message, type) {
  const messageDiv = document.getElementById("messages");
  messageDiv.innerHTML = `<div class="message ${type}">${message}</div>`;

  setTimeout(() => {
    messageDiv.innerHTML = "";
  }, 5000);
}

function updateHistoryUI() {
  const historyContainer = document.getElementById("historyItems");
  historyContainer.innerHTML = conversationHistory
    .map((item, index) => `
      <div class="history-item" data-index="${index}">
        <div class="history-prompt">${item.prompt.substring(0, 50)}${item.prompt.length > 50 ? '...' : ''}</div>
        <div class="history-time">${new Date(item.timestamp).toLocaleTimeString()}</div>
      </div>
    `)
    .join("");
}

function updateSaveButton() {
  const saveBtn = document.getElementById("saveKey");
  saveBtn.textContent = document.getElementById("apiKey").value ? "Update Key" : "Save Key";
}

function validateInputs(apiKey, prompt) {
  if (!apiKey) {
    showMessage("API key required", "error");
    return false;
  }
  if (!prompt) {
    showMessage("Please enter a prompt", "error");
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
  submitBtn.textContent = "Generating...";
}