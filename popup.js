document.addEventListener('DOMContentLoaded', function() {
  // Initialize extension
  initExtension();
  
  // Temperature slider update handler
  document.getElementById('temperature').addEventListener('input', function() {
    document.getElementById('tempValue').textContent = this.value;
  });
});

// Configuration
const GEMINI_API_URL = (apiKey) => 
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

async function initExtension() {
  // Load saved settings
  const { apiKey, temperature = 0.9 } = await chrome.storage.sync.get(['apiKey', 'temperature']);
  
  if (apiKey) {
    document.getElementById('apiKey').value = apiKey;
    document.getElementById('saveKey').textContent = 'Update Key';
  }
  document.getElementById('temperature').value = temperature;
  document.getElementById('tempValue').textContent = temperature;

  // Set up event listeners
  document.getElementById('saveKey').addEventListener('click', handleSaveKey);
  document.getElementById('clearKey').addEventListener('click', handleClearKey);
  document.getElementById('submit').addEventListener('click', handleSubmit);
  document.getElementById('temperature').addEventListener('change', handleTempChange);
}

async function handleSaveKey() {
  const apiKey = document.getElementById('apiKey').value.trim();
  
  if (!apiKey) {
    showMessage('Please enter an API key', 'error');
    return;
  }

  await chrome.storage.sync.set({ apiKey });
  showMessage('API key saved successfully!', 'success');
  document.getElementById('saveKey').textContent = 'Update Key';
}

async function handleClearKey() {
  await chrome.storage.sync.remove('apiKey');
  document.getElementById('apiKey').value = '';
  showMessage('API key cleared', 'info');
  document.getElementById('saveKey').textContent = 'Save Key';
}

async function handleTempChange() {
  const temperature = parseFloat(document.getElementById('temperature').value);
  await chrome.storage.sync.set({ temperature });
}

async function handleSubmit() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const prompt = document.getElementById('prompt').value.trim();
  const temperature = parseFloat(document.getElementById('temperature').value);
  const responseDiv = document.getElementById('response');
  const submitBtn = document.getElementById('submit');
  
  if (!apiKey) {
    showMessage('Please enter and save your API key first', 'error');
    return;
  }

  if (!prompt) {
    showMessage('Please enter a prompt', 'error');
    return;
  }

  responseDiv.innerHTML = '<div class="loading">Generating response...</div>';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Generating...';
  
  try {
    const response = await callGeminiAPI(apiKey, prompt, temperature);
    displayResponse(response);
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
    console.error('API Error:', error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Get Gemini Response';
  }
}

async function callGeminiAPI(apiKey, prompt, temperature = 0.9) {
  const response = await fetch(GEMINI_API_URL(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: temperature,
        topP: 1,
        topK: 40,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
  }

  return await response.json();
}

function displayResponse(data) {
  const responseDiv = document.getElementById('response');
  
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    const responseText = data.candidates[0].content.parts[0].text;
    responseDiv.innerHTML = `<div class="response-text">${formatResponseText(responseText)}</div>`;
  } else {
    showMessage('Unexpected response format from API', 'error');
    console.log('Full API response:', data);
  }
}

function formatResponseText(text) {
  // Enhanced formatting for markdown
  return text
    .replace(/```(\w*)\n([\s\S]*?)\n```/g, '<pre><code>$2</code></pre>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/^# (.*$)/gm, '<h4>$1</h4>')
    .replace(/^## (.*$)/gm, '<h5>$1</h5>')
    .replace(/^### (.*$)/gm, '<h6>$1</h6>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
}

function showMessage(message, type = 'info') {
  const messageDiv = document.getElementById('messages');
  messageDiv.innerHTML = `<div class="message ${type}">${message}</div>`;
  
  setTimeout(() => {
    messageDiv.innerHTML = '';
  }, 5000);
}