# Gemini Client - Chrome Extension

[![Current Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](manifest.json) <!-- Update version as needed -->

An enhanced Chrome Extension client for interacting with Google's Gemini AI models. This extension provides a user-friendly interface to select models, send prompts, receive responses, manage conversation history, and customize your experience. Features include using current webpage content as context, instructing the model to attempt Google Search for grounding, and quickly searching your prompt on Google.

## Features

*   **Dynamic Model Selection**: Choose from available Gemini models (e.g., Gemini 1.5 Flash, Gemini Pro) that support content generation, fetched dynamically based on your API key.
*   **Direct Gemini Interaction**: Send prompts directly to your selected Gemini model.
*   **API Key Management**: Securely save and clear your Google Generative Language API key.
*   **Adjustable Creativity**: Control the AI's response creativity using a temperature slider.
*   **Conversation History**:
    *   Automatically saves your original prompts and Gemini's responses.
    *   View recent conversations.
    *   Load a previous chat back into the prompt and response areas.
    *   Delete individual chat items or clear the entire history.
*   **Markdown Rendering**: AI responses are rendered with markdown support.
*   **Read Webpage Content**: Optionally include the text content of your currently active webpage as context for your prompts to Gemini.
*   **Model Search Instruction (Experimental)**: Optionally instruct the selected Gemini model to attempt consulting Google Search to inform its responses.
*   **Quick User Google Search**: Instantly search the content of your prompt on Google in a new tab using a dedicated button.
*   **Themeable Interface**:
    *   Choose between Light, Dark, or System themes.
    *   Theme preference is saved.
*   **Copy to Clipboard**: Easily copy Gemini's responses.
*   **User-Friendly Interface**: Clean and intuitive popup design.
*   **Keyboard Shortcuts**:
    *   `Ctrl+Enter` (Windows/Linux) or `Cmd+Enter` (Mac) to submit prompts to Gemini.
    *   `Ctrl+Shift+G` (Windows/Linux) or `Cmd+Shift+G` (Mac) to open the extension popup.

## Prerequisites

*   **Google Generative Language API Key**: Obtain from [Google AI Studio](https://aistudio.google.com/app/apikey).
*   **Google Chrome**: Version 88 or newer.

## Installation (For Local Development/Sideloading)

1.  **Download or Clone**: Get the extension files.
2.  **Open Chrome Extensions**: Navigate to `chrome://extensions`.
3.  **Enable Developer Mode**: Toggle on "Developer mode".
4.  **Load Unpacked**: Click "Load unpacked" and select the extension's directory.

## How to Use

1.  **Open Extension**: Click its icon in the Chrome toolbar.
2.  **Enter API Key**: On first use, enter your API key and click "Save Key". This will also populate the "Model" dropdown.
3.  **Select Model**: Choose your desired Gemini model from the "Model" dropdown in the settings panel.
4.  **Adjust Settings (Optional)**:
    *   **Creativity**: Use the slider.
    *   **Read Page**: Toggle to include current page text as context.
    *   **Model Search**: Toggle to instruct Gemini to attempt using Google Search for its response.
    *   **Theme**: Click the theme icon to cycle themes.
5.  **Enter Your Prompt**: Type in the main text area.
6.  **Actions**:
    *   **Get Response (Gemini)**: Click "Get Response" or press `Ctrl/Cmd+Enter`.
    *   **User Google Search**: Click the magnifying glass icon to search your prompt text on Google in a new tab.
7.  **View & Copy Response**: Response appears below. Use the copy icon.
8.  **Manage History**: View, load, or delete past chats.

## Configuration

*   **API Key, Selected Model, Temperature, History, Theme, Read Page, Model Search**: Preferences are saved in `chrome.storage.sync`.

## Permissions Used

*   `storage`: To save settings and history.
*   `clipboardWrite`: For copying responses.
*   `activeTab`, `scripting`: For the "Read Page" feature.

## Technologies Used

*   HTML5, CSS3, JavaScript (ES6+)
*   Google Material Icons, Google Fonts (Audiowide)
*   Chrome Extension APIs
*   Generative Language API

## Disclaimer

This is a third-party client, not officially affiliated with Google. Comply with API terms. Model capabilities are subject to change.
