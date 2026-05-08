// Canonical tool definitions (provider-agnostic)
const TOOLS = [
  {
    name: "get_page_outline",
    description:
      "Returns the DOM skeleton of the page or a scoped element — tag names, IDs, and classes without text content. Use this to understand page structure before drilling into specific elements with read_html.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "CSS selector to scope the outline (default: body)",
        },
        depth: {
          type: "number",
          description: "Maximum nesting depth to traverse (default: 5)",
        },
      },
    },
  },
  {
    name: "read_html",
    description:
      "Returns the outerHTML of the element matching the given CSS selector. Use when you need the exact markup of a specific part of the page.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to read",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "exec_javascript",
    description:
      "Execute JavaScript code on the current page and return the result. The code runs in the page context with access to all page globals. The user will be asked to confirm execution unless yolo mode is on. Keep code minimal and safe.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "JavaScript code to execute",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "add_css",
    description:
      "Inject a CSS stylesheet into the page. Returns an auto-generated ID (e.g. yaq-css-1) that can be used later with remove_css to remove it.",
    parameters: {
      type: "object",
      properties: {
        css: {
          type: "string",
          description: "CSS rules to inject",
        },
      },
      required: ["css"],
    },
  },
  {
    name: "remove_css",
    description: "Remove a previously injected CSS stylesheet by its ID.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "ID of the injected stylesheet to remove (returned by add_css)",
        },
      },
      required: ["id"],
    },
  },
];

const PROMPT_TOOLS = [
  {
    name: "get_quick_prompts",
    description:
      "Returns the current list of quick prompt pills configured in the extension.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "set_quick_prompts",
    description:
      "Replace all quick prompt pills with the given list. Each prompt needs a short name (shown on the pill) and the prompt text that gets sent when clicked.",
    parameters: {
      type: "object",
      properties: {
        prompts: {
          type: "array",
          description: "Array of prompt objects with name and prompt fields",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Short display name for the pill (e.g. 'Summary')",
              },
              prompt: {
                type: "string",
                description: "The prompt text to send when the pill is clicked",
              },
            },
            required: ["name", "prompt"],
          },
        },
      },
      required: ["prompts"],
    },
  },
];

const YOUTUBE_TOOLS = [
  {
    name: "get_youtube_subtitles",
    description:
      "Fetch the subtitles/transcript of the current YouTube video. Returns the full transcript text.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

// Convert canonical tools to OpenAI format
function getToolsOpenAI(isYouTube) {
  const tools = isYouTube
    ? [...TOOLS, ...PROMPT_TOOLS, ...YOUTUBE_TOOLS]
    : [...TOOLS, ...PROMPT_TOOLS];
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// Convert canonical tools to Anthropic format
function getToolsAnthropic(isYouTube) {
  const tools = isYouTube
    ? [...TOOLS, ...PROMPT_TOOLS, ...YOUTUBE_TOOLS]
    : [...TOOLS, ...PROMPT_TOOLS];
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

// Execute a tool call on the active tab's content script
function executeToolCall(toolName, args) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "executeTool", toolName, args },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.success) {
            resolve(response.result || "Success");
          } else {
            reject(new Error(response?.error || "Tool execution failed"));
          }
        },
      );
    });
  });
}
