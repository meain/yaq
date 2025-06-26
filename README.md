# ![icon](./assets/icon48.png) Yaq

> Your Assistant for Querying the web

Yaq is a powerful browser extension that leverages Large Language Models to help you interact with web content in smarter ways. Ask questions about any webpage, summarize content, extract insights from YouTube videos, and more—all without leaving your browser.

https://github.com/user-attachments/assets/1680801a-7b0e-4564-bfa6-e5ede583a71e

## Features

- **Content Analysis**: Summarize and query any webpage including blogs, articles, documentation, and code
- **YouTube Integration**: Automatically extracts and uses video subtitles for more accurate responses
- **Interactive Page Tools**: AI can directly interact with the page—clicking elements, filling forms, scrolling, and navigating using the built-in tools system
- **Custom Query Buttons**: Pre-configured buttons for common tasks (one-line summaries, FAQs, sentiment analysis, etc.)
- **Conversation History**: Continue conversations about the same content with context retention
- **Markdown Rendering**: All responses displayed with proper formatting using Showdown.js
- **Text Selection Support**: Ask questions about specific selected text on a page
- **HTML/Text Mode Toggle**: Choose between plain text or HTML mode for different parsing needs
- **Keyboard Shortcuts**: Quick access to custom prompts using Ctrl+1 through Ctrl+9

## Installation

- **Firefox**: Install from the [Firefox Add-ons Store](https://addons.mozilla.org/en-US/firefox/addon/yaq/)
- **Chrome/Edge**: Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/yaq/bpgcocbfiepefdgpoedcdbkfpibjflka)
- **Manual Installation**: 
  1. Clone this repository
  2. Run `make build` to generate the extension package
  3. Load as a developer extension in your browser

## Configuration

1. After installing, access the options page by:
   - Firefox: Right-click the extension icon → Manage Extension → Options
   - Chrome: Right-click the extension icon → Options
2. Configure your OpenAI API key, preferred model, and other settings

### Key Settings

- **API Key**: Your OpenAI API key for accessing language models
- **Model**: Select your preferred OpenAI model (e.g., gpt-4-turbo, gpt-3.5-turbo)
- **OpenAI Base URL**: Optionally customize the API endpoint for proxy services
- **Custom Prompts**: Configure your own quick-access buttons with custom prompts
- **Tools Toggle**: Enable/disable interactive page tools functionality
- **HTML Mode**: Toggle between plain text and HTML parsing for more accurate context

## Use Cases

- Summarize long articles and blog posts
- Extract key information from technical documentation
- Ask questions about GitHub code and issues
- Review pull requests with AI assistance
- Generate FAQs from content
- Analyze sentiment of articles or comments
- Get unclickbait versions of headlines
- Answer questions about YouTube videos using subtitles
- Automate web tasks using AI-driven tools interaction

*See [this issue](https://github.com/meain/yeeha/issues/5) for more interesting use-cases. If you are an Emacs user, you might also like [meain/yap](https://github.com/meain/yap).*

## How It Works

1. Click the Yaq extension icon while browsing any webpage
2. Use the pre-configured buttons or type your own question
3. Get AI-generated responses based on the page content
4. Continue the conversation or try different prompts
5. Use keyboard shortcuts (Ctrl+number) for quick access to common queries

### Interactive Tools System

When tools are enabled in the settings, Yaq can interact with web pages on your behalf:

- **click_element**: Click buttons, links, or other interactive elements using CSS selectors
- **scroll_to_element**: Scroll to specific parts of the page using CSS selectors
- **input_text**: Enter text into form fields, search boxes, and text areas
- **navigate_to**: Change to different URLs within the same domain

To use these tools:
1. Enable the "Enable Tools" option in the popup
2. Ask questions that might require page interaction (e.g., "Find the pricing section")
3. The AI will use appropriate tools to complete the task and report its actions

## Privacy & Security

- Your API key is stored locally in your browser
- Page content is processed through your personal OpenAI account
- No data is sent to Yaq servers

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## Credits

- <a target="_blank" href="https://icons8.com/icon/GC1ZuXqlf4wE/hub">Hub</a> icon by <a target="_blank" href="https://icons8.com">Icons8</a>
- Code to fetch subtitles from [eliascotto/youtube-subtitles-viewer](https://github.com/eliascotto/youtube-subtitles-viewer/)

