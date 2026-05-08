# ![icon](./assets/icon48.png) Yaq

> Your Assistant for Querying the web

Yaq is a browser extension that uses LLMs to help you interact with web content — ask questions, get summaries, inspect pages, and more, all through a conversational chat interface.

https://github.com/user-attachments/assets/9fb0b6d8-92fd-4822-96c7-f78bedc8313a

## Features

- **Conversational chat**: Full chat interface with per-tab conversations that persist across popup open/close
- **Page tools (always on)**: The AI can inspect page structure, read HTML, run JavaScript, inject/remove CSS, and fetch YouTube subtitles
- **JavaScript confirmation**: Shows code for approval before executing — yolo mode auto-approves
- **Quick prompts**: Configurable one-click pills with Ctrl+1-9 shortcuts
- **Markdown rendering**: Responses displayed as chat bubbles with proper formatting
- **Smart auto-scroll**: Follows streaming output but lets you scroll back freely
- **Copy on hover**: Copy any message with one click
- **Dual provider support**: Works with OpenAI and Anthropic APIs

## Installation

> The versions available in the webstores might be older as it is annoying to update it

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
2. Configure your API key (OpenAI or Anthropic), preferred model, and quick prompts

## How It Works

1. Click the Yaq extension icon on any webpage
2. Type a question or click a quick prompt pill
3. Get AI-generated responses in a chat interface
4. Follow up naturally — conversations persist per tab
5. The AI can use tools to inspect the page, run code, or modify styles when needed

### Tools

Tools are always available to the AI. It will use them when needed to answer your questions or interact with the page.

- **get_page_outline** — DOM skeleton showing tags, IDs, classes
- **read_html** — full outerHTML of any element
- **exec_javascript** — run JS in page context (requires confirmation)
- **add_css / remove_css** — inject and remove tracked stylesheets
- **get_youtube_subtitles** — available on YouTube video pages
- **get_quick_prompts / set_quick_prompts** — read and update your pill configuration

## Privacy & Security

- Your API key is stored locally in your browser
- Page content is processed through your personal API account
- No data is sent to Yaq servers

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## Credits

- <a target="_blank" href="https://icons8.com/icon/GC1ZuXqlf4wE/hub">Hub</a> icon by <a target="_blank" href="https://icons8.com">Icons8</a>
- Code to fetch subtitles from [eliascotto/youtube-subtitles-viewer](https://github.com/eliascotto/youtube-subtitles-viewer/)
