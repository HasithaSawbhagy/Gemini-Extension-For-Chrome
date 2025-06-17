# Gemini Flash Client - Chrome Extension

[![Current Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](manifest.json) <!-- Update version as needed -->

An enhanced Chrome Extension client for interacting with Google's Gemini 2.5 Flash (Preview 05-20) model. This extension provides a user-friendly interface to send prompts, receive responses, manage conversation history, and customize your experience, including the ability to use content from your current webpage as context.

## Features

*   **Direct Gemini Interaction**: Send prompts directly to the Gemini 2.5 Flash Preview 05-20 model.
*   **API Key Management**: Securely save and clear your Google Generative Language API key.
*   **Adjustable Creativity**: Control the AI's response creativity using a temperature slider.
*   **Conversation History**:
    *   Automatically saves your prompts and Gemini's responses.
    *   View recent conversations.
    *   Load a previous chat back into the prompt and response areas.
    *   Delete individual chat items or clear the entire history.
*   **Markdown Rendering**: AI responses are rendered with markdown support (headings, bold, italics, code blocks, links).
*   **Read Webpage Content**: Optionally include the text content of your currently active webpage as context for your prompts to Gemini.
*   **Themeable Interface**:
    *   Choose between Light, Dark, or System themes.
    *   Theme preference is saved.
*   **Copy to Clipboard**: Easily copy Gemini's responses.
*   **User-Friendly Interface**: Clean and intuitive popup design.
*   **Responsive Design**: Optimized for the popup window.
*   **Keyboard Shortcuts**:
    *   `Ctrl+Enter` (Windows/Linux) or `Cmd+Enter` (Mac) to submit prompts.
    *   `Ctrl+Shift+G` (Windows/Linux) or `Cmd+Shift+G` (Mac) to open the extension popup (configurable in Chrome).

## Prerequisites

*   **Google Generative Language API Key**: You need to obtain an API key from Google AI Studio (formerly MakerSuite) to use this extension. Visit [Google AI Studio](https://aistudio.google.com/app/apikey) to get your key.
*   **Google Chrome**: Version 88 or newer.

## Installation (For Local Development/Sideloading)

1.  **Download or Clone the Repository**:
    *   If you have this project as a ZIP file, extract it to a local folder.
    *   Or, clone the repository: `git clone <repository_url>`
2.  **Open Chrome Extensions**:
    *   Open Google Chrome.
    *   Navigate to `chrome://extensions`.
3.  **Enable Developer Mode**:
    *   In the top right corner of the Extensions page, toggle on "Developer mode".
4.  **Load Unpacked Extension**:
    *   Click the "Load unpacked" button.
    *   Select the directory where you extracted/cloned the extension files (the folder containing `manifest.json`).
5.  The extension icon should now appear in your Chrome toolbar.

## How to Use

1.  **Open the Extension**: Click the Gemini Flash Client icon in your Chrome toolbar.
2.  **Enter API Key**:
    *   The first time you use it (or if no key is saved), you'll need to enter your Google Generative Language API key in the "Enter your API key" field.
    *   Click "Save Key". The button will change to "Update Key" if a key is already saved.
3.  **Adjust Settings (Optional)**:
    *   **Creativity (Temperature)**: Slide the "Creativity" control to adjust the AI's response randomness. Lower values (e.g., 0.2) make responses more focused and deterministic, while higher values (e.g., 0.9) make them more creative and diverse.
    *   **Read Page**: Toggle the "Read Page" switch on if you want the content of your currently active browser tab to be sent to Gemini along with your prompt. A status message will indicate if page content will be included.
    *   **Theme**: Click the theme icon (e.g., brightness_auto) in the header to cycle through System, Light, and Dark themes.
4.  **Enter Your Prompt**: Type your question or instruction into the text area labeled "Ask Gemini anything...".
5.  **Get Response**:
    *   Click the "Get Response" button.
    *   Or, press `Ctrl+Enter` (Windows/Linux) or `Cmd+Enter` (Mac).
6.  **View Response**: The AI's response will appear in the "Response" section, formatted with markdown.
7.  **Copy Response**: Click the copy icon next to the "Response" title to copy the response text to your clipboard.
8.  **Manage History**:
    *   Recent chats appear under the "Recent" section.
    *   Click on a history item to load its prompt and response back into the main interface.
    *   Click the trash icon next to a history item to delete it.
    *   Click the "sweep" icon next to "Recent" to clear all chat history.

## Configuration

*   **API Key**: Stored in `chrome.storage.sync`.
*   **Temperature**: Stored in `chrome.storage.sync`. Default: `0.7`.
*   **Conversation History**: Stored in `chrome.storage.sync`. Maximum `10` items.
*   **Theme Preference**: Stored in `chrome.storage.sync`. Default: `system`.
*   **Include Page Content Preference**: Stored in `chrome.storage.sync`. Default: `false` (unchecked).

## Permissions Used

*   `storage`: To save your API key, settings, theme preference, and conversation history locally and sync them if Chrome sync is enabled.
*   `clipboardWrite`: To allow the "Copy to Clipboard" functionality for responses.
*   `activeTab`: To allow the extension to access the URL of the current tab (necessary for the `scripting` permission to target the correct tab).
*   `scripting`: To inject a script into the active webpage to extract its text content when the "Read Page" feature is enabled.

## Technologies Used

*   HTML5
*   CSS3 (with CSS Variables for theming)
*   JavaScript (ES6+ Modules, Async/Await)
*   Google Material Icons
*   Google Fonts (Audiowide)
*   Chrome Extension APIs (`chrome.storage`, `chrome.scripting`, `chrome.tabs`)
*   Generative Language API (for Gemini)

## Disclaimer

This is a third-party client and is not officially affiliated with or endorsed by Google. Please ensure you comply with the Google Generative Language API terms of service when using this extension. The "Preview 05-20" in the model name indicates it's a preview version and its behavior or availability might change.
