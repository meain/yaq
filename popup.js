let prevReader = null;
let responseCache = "";
let aiResponseOnly = ""; // Store only AI response for copy functionality
let index = -1;

const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day

function fetchModelsForService(service, baseUrl, apiKey) {
  if (service === "anthropic") {
    return fetch(`${baseUrl}/models`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    })
      .then((r) => r.json())
      .then((data) => (data.data || []).map((m) => m.id))
      .catch(() => []);
  }
  return fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
    .then((r) => r.json())
    .then((data) => (data.data || []).map((m) => m.id))
    .catch(() => []);
}

let allModels = [];

function renderModelDropdown(filter) {
  const dropdown = document.getElementById("model-dropdown");
  dropdown.innerHTML = "";

  const query = (filter || "").toLowerCase();
  const filtered = query
    ? allModels.filter((m) => m.toLowerCase().includes(query))
    : allModels;

  if (filtered.length === 0 && allModels.length > 0) {
    const empty = document.createElement("div");
    empty.className = "model-dropdown-empty";
    empty.textContent = "No matching models";
    dropdown.appendChild(empty);
    return;
  }

  filtered.forEach((m) => {
    const opt = document.createElement("div");
    opt.className = "model-option";
    opt.textContent = m;
    opt.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const modelInput = document.getElementById("model");
      modelInput.value = m;
      chrome.storage.local.set({ model: m });
      dropdown.classList.remove("open");
    });
    dropdown.appendChild(opt);
  });
}

function setupModelPicker() {
  const modelInput = document.getElementById("model");
  const dropdown = document.getElementById("model-dropdown");

  modelInput.addEventListener("focus", () => {
    renderModelDropdown(modelInput.value);
    if (allModels.length > 0) {
      dropdown.classList.add("open");
    }
  });

  modelInput.addEventListener("input", () => {
    renderModelDropdown(modelInput.value);
    if (allModels.length > 0) {
      dropdown.classList.add("open");
    }
  });

  modelInput.addEventListener("blur", () => {
    dropdown.classList.remove("open");
  });
}

function populateModelPicker() {
  chrome.storage.local.get(
    {
      service: "openai",
      apiKey: "",
      openAIBaseUrl: "https://api.openai.com/v1",
      model: "",
      modelCache: null,
    },
    async function (items) {
      const modelInput = document.getElementById("model");

      // Restore saved model
      if (items.model) {
        modelInput.value = items.model;
      }
      modelInput.placeholder = "Select a model";

      // Check cache
      const cache = items.modelCache;
      const now = Date.now();
      if (
        cache &&
        cache.service === items.service &&
        cache.baseUrl === items.openAIBaseUrl &&
        now - cache.timestamp < MODEL_CACHE_TTL
      ) {
        allModels = cache.models;
        return;
      }

      // Fetch fresh models
      modelInput.placeholder = "Loading models...";
      const models = await fetchModelsForService(
        items.service,
        items.openAIBaseUrl,
        items.apiKey,
      );

      allModels = models;
      if (models.length > 0) {
        chrome.storage.local.set({
          modelCache: {
            service: items.service,
            baseUrl: items.openAIBaseUrl,
            models: models,
            timestamp: now,
          },
        });
      }
      modelInput.placeholder = "Select a model";
    },
  );
}

const defaultButtons = [
  {
    id: "summary",
    name: "Summary",
    prompt:
      "Provide a concise summary of this content, highlighting the main points and key takeaways.",
  },
  {
    id: "key-points",
    name: "Key Points",
    prompt:
      "Extract the 3-5 most important points from this content as a bulleted list.",
  },
  {
    id: "explain",
    name: "Explain",
    prompt:
      "Explain this content in simple terms, as if you're teaching it to someone who's new to the topic.",
  },
  {
    id: "tldr",
    name: "TL;DR",
    prompt: "Give me a TL;DR (too long; didn't read) version in 1-2 sentences.",
  },
  {
    id: "questions",
    name: "Questions",
    prompt:
      "Generate 3-5 thoughtful questions that this content answers or raises.",
  },
  {
    id: "action-items",
    name: "Action Items",
    prompt:
      "What are the actionable takeaways or next steps mentioned in this content?",
  },
  {
    id: "context",
    name: "Context",
    prompt:
      "What background knowledge or context is helpful to better understand this content?",
  },
  {
    id: "critique",
    name: "Critique",
    prompt:
      "What are the strengths and potential weaknesses or gaps in this content?",
  },
];

function showInteractionAtIndex(interactions, index) {
  if (index < interactions.length) {
    const lastMessageIndex = interactions[index].messages.length - 1;
    const lastMessage = interactions[index].messages[lastMessageIndex];
    const secondLastMessage =
      interactions[index].messages[lastMessageIndex - 1];

    if (interactions[index].kind === "qa") {
      document.getElementById("question").innerText =
        "[" + (index + 1) + "] Q: " + secondLastMessage.content.split("\n")[0];
    } else if (interactions[index].kind === "summary") {
      document.getElementById("question").innerText =
        "[" + (index + 1) + "] Summary";
    } else {
      document.getElementById("question").innerText =
        "[" + (index + 1) + "] " + secondLastMessage.content.split("\n")[0];
    }

    let url = new URL(interactions[index].url);
    document.getElementById("qurl").innerText = url.hostname;
    document.getElementById("qurl").href = interactions[index].url;

    renderPartialHTML(lastMessage.content);
  }
}

function showNext() {
  chrome.storage.local.get(
    {
      interactions: [],
    },
    function (items) {
      const interactions = items.interactions;
      if (index < interactions.length - 1) {
        index++;
      } else if (interactions.length > 0) {
        index = 0;
      }

      showInteractionAtIndex(interactions, index);
    },
  );
}

function showPrev() {
  chrome.storage.local.get(
    {
      interactions: [],
    },
    function (items) {
      const interactions = items.interactions;
      if (index <= 0) {
        index = interactions.length - 1;
      } else if (index < interactions.length && index > 0) {
        index--;
      }

      showInteractionAtIndex(interactions, index);
    },
  );
}

async function streamResponse(response) {
  if (prevReader) {
    prevReader.cancel();
  }

  const reader = response.body.getReader();
  prevReader = reader;
  // Show progress indicator when streaming begins
  document.getElementById("progress-container").style.display = "flex";

  const decoder = new TextDecoder("utf-8");
  let done = false;
  let result = "";
  let output = "";
  let remaining = false;
  let toolCalls = [];

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (remaining) {
      result += decoder.decode(value, { stream: !done });
    } else {
      result = decoder.decode(value, { stream: !done });
    }

    remaining = false;

    // Process the stream as it comes in
    if (value) {
      const lines = result.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          if (line.substring(6) == "[DONE]") break;
          try {
            const data = JSON.parse(line.substring(6));

            if (data.choices && data.choices.length > 0) {
              const delta = data.choices[0].delta;

              // Handle tool calls
              if (delta.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  if (toolCall.index !== undefined) {
                    if (!toolCalls[toolCall.index]) {
                      toolCalls[toolCall.index] = {
                        id: toolCall.id || "",
                        type: toolCall.type || "function",
                        function: {
                          name: toolCall.function?.name || "",
                          arguments: toolCall.function?.arguments || "",
                        },
                      };
                    } else {
                      if (toolCall.function?.name) {
                        toolCalls[toolCall.index].function.name +=
                          toolCall.function.name;
                      }
                      if (toolCall.function?.arguments) {
                        toolCalls[toolCall.index].function.arguments +=
                          toolCall.function.arguments;
                      }
                    }
                  }
                }
              }

              // Handle regular content
              const content = delta.content || "";
              output += content;
              if (output.trim()) {
                renderPartialHTML(output);
              }
            }
          } catch (error) {
            remaining = true;
            result = line; // should be just the last line
          }
        }
      }
    }
  }

  // Return both content and tool calls
  return {
    response: output,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    content: output,
  };
}

async function streamAnthropicResponse(response) {
  if (prevReader) {
    prevReader.cancel();
  }

  const reader = response.body.getReader();
  prevReader = reader;
  document.getElementById("progress-container").style.display = "flex";

  const decoder = new TextDecoder("utf-8");
  let done = false;
  let buffer = "";
  let output = "";
  let toolCalls = [];
  let currentToolIndex = -1;

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.substring(6));

          if (data.type === "content_block_start") {
            if (data.content_block.type === "tool_use") {
              currentToolIndex++;
              toolCalls[currentToolIndex] = {
                id: data.content_block.id,
                type: "function",
                function: {
                  name: data.content_block.name,
                  arguments: "",
                },
              };
            }
          } else if (data.type === "content_block_delta") {
            if (data.delta.type === "text_delta") {
              output += data.delta.text;
              if (output.trim()) {
                renderPartialHTML(output);
              }
            } else if (data.delta.type === "input_json_delta") {
              if (currentToolIndex >= 0) {
                toolCalls[currentToolIndex].function.arguments +=
                  data.delta.partial_json;
              }
            }
          }
        } catch (e) {
          // Incomplete JSON line, ignore
        }
      }
    }
  }

  return {
    response: output,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    content: output,
  };
}

async function executeToolCall(toolName, args) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "executeTool", toolName, args },
        (response) => {
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

async function fetchFromOpenAI(openAIBaseUrl, model, apiKey, messages) {
  if (apiKey === "" || model === "") {
    document.getElementById("output").innerText =
      "Please set your OpenAI API key and model in the options page";
    return;
  }

  const requestBody = {
    model: model,
    stream: true,
    messages: messages,
  };

  // Add tools if enabled
  if (toolsEnabled()) {
    requestBody.tools = [
      {
        type: "function",
        function: {
          name: "click_element",
          description: "Click on a page element using CSS selector",
          parameters: {
            type: "object",
            properties: {
              selector: {
                type: "string",
                description: "CSS selector for the element to click",
              },
            },
            required: ["selector"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "scroll_to_element",
          description: "Scroll to a page element using CSS selector",
          parameters: {
            type: "object",
            properties: {
              selector: {
                type: "string",
                description: "CSS selector for the element to scroll to",
              },
            },
            required: ["selector"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "input_text",
          description:
            "Enter text into an input field, textarea, or other text element using CSS selector",
          parameters: {
            type: "object",
            properties: {
              selector: {
                type: "string",
                description: "CSS selector for the input element",
              },
              text: {
                type: "string",
                description: "Text to enter into the field",
              },
              clear: {
                type: "boolean",
                description:
                  "Whether to clear the field before entering text (default: true)",
              },
            },
            required: ["selector", "text"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "navigate_to",
          description:
            "Navigate to a different URL and wait for the page to load completely",
          parameters: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description:
                  "The URL to navigate to (can be relative or absolute)",
              },
            },
            required: ["url"],
          },
        },
      },
    ];
    requestBody.tool_choice = "auto";
  }

  const response = await fetch(openAIBaseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  return await streamResponse(response);
}

async function fetchFromAnthropic(
  baseUrl,
  model,
  apiKey,
  messages,
  systemPrompt,
) {
  if (apiKey === "" || model === "") {
    document.getElementById("output").innerText =
      "Please set your Anthropic API key and model in the options page";
    return;
  }

  const requestBody = {
    model: model,
    max_tokens: 8192,
    stream: true,
    messages: messages,
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  // Add tools if enabled
  if (toolsEnabled()) {
    requestBody.tools = [
      {
        name: "click_element",
        description: "Click on a page element using CSS selector",
        input_schema: {
          type: "object",
          properties: {
            selector: {
              type: "string",
              description: "CSS selector for the element to click",
            },
          },
          required: ["selector"],
        },
      },
      {
        name: "scroll_to_element",
        description: "Scroll to a page element using CSS selector",
        input_schema: {
          type: "object",
          properties: {
            selector: {
              type: "string",
              description: "CSS selector for the element to scroll to",
            },
          },
          required: ["selector"],
        },
      },
      {
        name: "input_text",
        description:
          "Enter text into an input field, textarea, or other text element using CSS selector",
        input_schema: {
          type: "object",
          properties: {
            selector: {
              type: "string",
              description: "CSS selector for the input element",
            },
            text: {
              type: "string",
              description: "Text to enter into the field",
            },
            clear: {
              type: "boolean",
              description:
                "Whether to clear the field before entering text (default: true)",
            },
          },
          required: ["selector", "text"],
        },
      },
      {
        name: "navigate_to",
        description:
          "Navigate to a different URL and wait for the page to load completely",
        input_schema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "The URL to navigate to (can be relative or absolute)",
            },
          },
          required: ["url"],
        },
      },
    ];
    requestBody.tool_choice = { type: "auto" };
  }

  const response = await fetch(baseUrl + "/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(requestBody),
  });

  return await streamAnthropicResponse(response);
}

async function getLLMResponse(messages) {
  index = -1; // Reset index

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      {
        service: "openai",
        apiKey: "",
        openAIBaseUrl: "",
      },
      async function (items) {
        const service = items.service;
        const apiKey = items.apiKey;
        const model = document.getElementById("model").value;
        const openAIBaseUrl = items.openAIBaseUrl;

        if (apiKey === "") {
          document.getElementById("output").innerText =
            "Please set your API key in the options page";
          return;
        }

        if (model === "") {
          document.getElementById("output").innerText =
            "Please select a model";
          return;
        }

        // Persist selected model
        chrome.storage.local.set({ model: model });

        // Show progress indicator
        document.getElementById("progress-container").style.display = "flex";

        document.getElementById("output").innerText =
          `Processing using ${model}...`;

        let currentMessages = [...messages];
        let systemPrompt = "";
        let finalResponse = "";
        let toolCallsHtml = "";

        // Extract system message for Anthropic
        if (service === "anthropic") {
          currentMessages = currentMessages.filter((msg) => {
            if (msg.role === "system") {
              systemPrompt = msg.content;
              return false;
            }
            return true;
          });
        }

        // Continue conversation until we get a non-tool response
        while (true) {
          let response;
          if (service === "anthropic") {
            response = await fetchFromAnthropic(
              openAIBaseUrl,
              model,
              apiKey,
              currentMessages,
              systemPrompt,
            );
          } else {
            response = await fetchFromOpenAI(
              openAIBaseUrl,
              model,
              apiKey,
              currentMessages,
            );
          }

          if (response.toolCalls && response.toolCalls.length > 0) {
            // Add assistant message with tool calls
            if (service === "anthropic") {
              const contentBlocks = [];
              if (response.content) {
                contentBlocks.push({ type: "text", text: response.content });
              }
              for (const toolCall of response.toolCalls) {
                contentBlocks.push({
                  type: "tool_use",
                  id: toolCall.id,
                  name: toolCall.function.name,
                  input: JSON.parse(toolCall.function.arguments),
                });
              }
              currentMessages.push({
                role: "assistant",
                content: contentBlocks,
              });
            } else {
              currentMessages.push({
                role: "assistant",
                content: response.content || "",
                tool_calls: response.toolCalls,
              });
            }

            // Execute tools and add results
            const anthropicToolResults = [];
            for (const toolCall of response.toolCalls) {
              try {
                const result = await executeToolCall(
                  toolCall.function.name,
                  JSON.parse(toolCall.function.arguments),
                );

                if (service === "anthropic") {
                  anthropicToolResults.push({
                    type: "tool_result",
                    tool_use_id: toolCall.id,
                    content: result,
                  });
                } else {
                  currentMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: result,
                  });
                }

                toolCallsHtml += `
                  <div class="tool-call">
                    🔧 ${result}
                  </div>
                `;
              } catch (error) {
                if (service === "anthropic") {
                  anthropicToolResults.push({
                    type: "tool_result",
                    tool_use_id: toolCall.id,
                    content: `Error: ${error.message}`,
                    is_error: true,
                  });
                } else {
                  currentMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: `Error: ${error.message}`,
                  });
                }

                const args = JSON.parse(toolCall.function.arguments);
                const argsDisplay = Object.entries(args)
                  .map(([key, value]) => `"${value}"`)
                  .join(", ");

                toolCallsHtml += `
                  <div class="tool-call error">
                    ❌ ${toolCall.function.name}(${argsDisplay}) → Error: ${error.message}
                  </div>
                `;
              }
            }

            // For Anthropic, tool results go in a single user message
            if (service === "anthropic") {
              currentMessages.push({
                role: "user",
                content: anthropicToolResults,
              });
            }

            // Update UI with current progress (show tool calls but don't include in AI response)
            renderWithToolCalls("", toolCallsHtml);
          } else {
            // Final response without tools
            finalResponse = response.response;
            aiResponseOnly = finalResponse; // Store clean AI response for copy
            // Hide progress indicator
            document.getElementById("progress-container").style.display =
              "none";

            // Render final response with any tool calls that were executed
            renderWithToolCalls(finalResponse, toolCallsHtml);

            resolve({ provider: service, model, response: finalResponse });
            break;
          }
        }
      },
    );
  });
}

// Store the last n interactions with timestamp
async function storeInteraction(kind, replace, url, messages, response) {
  chrome.storage.local.get(
    {
      interactions: [],
    },
    function (items) {
      messages.push({
        role: "assistant",
        content: response.response,
      });

      const interactions = items.interactions;
      if (replace) {
        interactions.pop();
      }

      interactions.push({
        model: response.model,
        provider: response.provider,
        kind: kind,
        url: url,
        messages: messages,
        timestamp: new Date().toISOString(),
      });

      // Remove messages until the json size is under 7MB (limit is 10MB)
      while (true) {
        let size = JSON.stringify(interactions).length;
        if (size < 7000000) {
          break;
        }

        interactions.shift();
      }

      chrome.storage.local.set({ interactions: interactions });
    },
  );
}

function getLastInteraction(url) {
  // Get the last interaction which is made from the same domain
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      {
        interactions: [],
      },
      function (items) {
        const interactions = items.interactions;
        let lastInteraction = null;
        for (let i = interactions.length - 1; i >= 0; i--) {
          if (interactions[i].url === url) {
            lastInteraction = interactions[i];
            break;
          }
        }
        resolve(lastInteraction);
      },
    );
  });
}

async function summarizeText(url, text, title) {
  const messages = [
    {
      role: "system",
      content:
        "You are a summarizer bot. " +
        "Help me summarize the text that I provide. " +
        "Use emojis as necessary",
    },
    { role: "user", content: text },
  ];

  if (title && title.length > 0) {
    messages.push({
      role: "assistant",
      content: "What is the title of the page?",
    });
    messages.push({ role: "user", content: title });
  }

  document.getElementById("question").innerText = "Summary";
  let purl = new URL(url);
  document.getElementById("qurl").innerText = purl.hostname;
  document.getElementById("qurl").href = url;

  const response = await getLLMResponse(messages);
  await storeInteraction("summary", false, url, messages, response);
}

async function answerQuestion(input, cont, question) {
  const lastInteraction = await getLastInteraction(input.url);
  let messages = [
    {
      role: "system",
      content:
        "You are a question answering bot. Be concise, yet informative. " +
        "I'll provide you with the content first and then a question. " +
        "Use emojies if necessary." +
        (toolsEnabled()
          ? " You have access to tools to interact with the page - use click_element(selector) to click elements, scroll_to_element(selector) to scroll to elements, input_text(selector, text) to enter text into form fields, and navigate_to(url) to navigate to other pages when helpful."
          : ""),
    },
  ];

  if (input.subtitles) {
    messages.push({ role: "user", content: input.subtitles });
  } else {
    // Use HTML content if the toggle is enabled, otherwise use plain text
    messages.push({
      role: "user",
      content: useHtmlContent() ? input.html : input.text,
    });
  }

  if (input.title) {
    messages.push({
      role: "assistant",
      content: "What is the title of the page?",
    });
    messages.push({ role: "user", content: input.title });
  }

  if (input.selection) {
    messages.push({
      role: "assistant",
      content: "Was there any specific text to focus on?",
    });
    messages.push({ role: "user", content: input.selection });
  }

  messages.push({ role: "assistant", content: "What is the question?" });
  messages.push({ role: "user", content: question });

  if (lastInteraction && cont) {
    messages = lastInteraction.messages;
    messages.push({ role: "user", content: question });
  }

  document.getElementById("question").innerText = "Q: " + question;
  let purl = new URL(input.url);
  document.getElementById("qurl").innerText = purl.hostname;
  document.getElementById("qurl").href = input.url;

  const response = await getLLMResponse(messages);
  await storeInteraction(
    "qa",
    lastInteraction && cont,
    input.url,
    messages,
    response,
  );
}

function continueConversation() {
  return document.getElementById("continue").checked;
}

function useHtmlContent() {
  return document.getElementById("use_html").checked;
}

function toolsEnabled() {
  return document.getElementById("enable_tools").checked;
}

function summarize() {
  document.getElementById("output").innerText = `Getting webpage content...`;
  // Hide progress indicator initially (will show when LLM starts)
  document.getElementById("progress-container").style.display = "none";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: "getContent" },
      (response) => {
        if (
          response === undefined ||
          response.text === undefined ||
          response.text === ""
        ) {
          document.getElementById("output").innerText = response.error
            ? response.error
            : "Woopsie! Unable to get the webpage content.";
          document.getElementById("copy").style.display = "none";
          return;
        }

        if (response.subtitles && response.subtitles.length > 0) {
          summarizeText(response.url, response.subtitles, response.title);
        } else {
          const content = useHtmlContent() ? response.html : response.text;
          summarizeText(response.url, content, response.title);
        }
      },
    );
  });
}

function answer(question) {
  document.getElementById("output").innerText = `Getting webpage content...`;
  // Hide progress indicator initially (will show when LLM starts)
  document.getElementById("progress-container").style.display = "none";
  let cont = continueConversation();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: "getContent" },
      (response) => {
        if (
          response === undefined ||
          response.text === undefined ||
          response.text === ""
        ) {
          document.getElementById("output").innerText = response.error
            ? response.error
            : "Woopsie! Unable to get the webpage content.";
          document.getElementById("copy").style.display = "none";
          return;
        }

        if (question == undefined || question === "") {
          question = document.getElementById("text").value;
          if (!question) {
            document.getElementById("output").innerText =
              "Please provide a question";
            return;
          }
        }

        answerQuestion(response, cont, question);
      },
    );
  });
}

function renderPartialHTML(partialText) {
  responseCache = partialText;
  aiResponseOnly = partialText; // Update AI-only response for copy
  const converter = new showdown.Converter();
  converter.setFlavor("github"); // use GFM
  const partialHtml = converter.makeHtml(partialText);
  document.getElementById("output").innerHTML = partialHtml;
  document.getElementById("copy").style.display = "block";

  // If response is complete, hide progress indicator
  if (!prevReader) {
    document.getElementById("progress-container").style.display = "none";
  }
}

function renderWithToolCalls(aiResponse, toolCallsHtml) {
  // Update the cache with full content for display purposes
  responseCache = aiResponse;
  aiResponseOnly = aiResponse; // Store clean AI response for copy

  const converter = new showdown.Converter();
  converter.setFlavor("github"); // use GFM

  let fullHtml = "";

  // Add tool calls section if there are any
  if (toolCallsHtml) {
    fullHtml += `<div class="tool-calls-section">
      ${toolCallsHtml}
    </div>`;
  }

  // Add AI response if there is any
  if (aiResponse && aiResponse.trim()) {
    const aiHtml = converter.makeHtml(aiResponse);
    fullHtml += aiHtml;
  } else if (toolCallsHtml) {
    // If we only have tool calls, show a message indicating processing
    fullHtml += `<p><em>Tool execution completed. Waiting for assistant response...</em></p>`;
  }

  document.getElementById("output").innerHTML = fullHtml || "Processing...";
  document.getElementById("copy").style.display = aiResponse ? "block" : "none";

  // If response is complete, hide progress indicator
  if (!prevReader) {
    document.getElementById("progress-container").style.display = "none";
  }
}

function renderButtons() {
  chrome.storage.local.get(
    {
      buttons: defaultButtons,
    },
    function (items) {
      const buttons = items.buttons;
      document.getElementById("buttons").innerHTML = "";
      buttons.forEach((button, index) => {
        const buttonElement = document.createElement("button");
        buttonElement.id = button.id;
        buttonElement.innerText = button.name;
        buttonElement.onclick = () => {
          document.getElementById("text").value = button.prompt;
          answer(button.prompt);
        };
        document.getElementById("buttons").appendChild(buttonElement);

        // Add keyboard shortcut
        if (index < 9) {
          document.addEventListener("keydown", function (event) {
            if (event.ctrlKey && event.key === (index + 1).toString()) {
              event.preventDefault();
              document.getElementById("text").value = button.prompt;
              answer(button.prompt);
            }
          });
        }
      });
    },
  );
}

document.addEventListener("DOMContentLoaded", function () {
  // Set up cancel button
  document
    .getElementById("cancel-request")
    .addEventListener("click", function () {
      if (prevReader) {
        prevReader.cancel();
        prevReader = null;
        document.getElementById("progress-container").style.display = "none";
        document.getElementById("output").innerHTML +=
          "<p><em>Request cancelled by user</em></p>";
      }
    });

  // Restore preferences
  chrome.storage.local.get(
    {
      useHtml: false,
      enableTools: false,
    },
    function (items) {
      document.getElementById("use_html").checked = items.useHtml;
      document.getElementById("enable_tools").checked = items.enableTools;

      // If tools are enabled, force HTML on and disable the checkbox
      if (items.enableTools) {
        document.getElementById("use_html").checked = true;
        document.getElementById("use_html").disabled = true;
        const htmlLabel = document.querySelector('label[for="use_html"]');
        htmlLabel.classList.add("disabled");
        htmlLabel.setAttribute(
          "data-hover-info",
          "Required when tools are enabled for element selection",
        );
      }
    },
  );

  // Save preferences when changed
  document.getElementById("use_html").addEventListener("change", function () {
    chrome.storage.local.set({ useHtml: this.checked });
  });

  document
    .getElementById("enable_tools")
    .addEventListener("change", function () {
      chrome.storage.local.set({ enableTools: this.checked });

      // Auto-enable HTML and disable the checkbox when tools are enabled
      if (this.checked) {
        document.getElementById("use_html").checked = true;
        document.getElementById("use_html").disabled = true;
        const htmlLabel = document.querySelector('label[for="use_html"]');
        htmlLabel.classList.add("disabled");
        htmlLabel.setAttribute(
          "data-hover-info",
          "Required when tools are enabled for element selection",
        );
        chrome.storage.local.set({ useHtml: true });
      } else {
        // Auto-disable HTML and re-enable the checkbox when tools are disabled
        document.getElementById("use_html").checked = false;
        document.getElementById("use_html").disabled = false;
        const htmlLabel = document.querySelector('label[for="use_html"]');
        htmlLabel.classList.remove("disabled");
        htmlLabel.setAttribute(
          "data-hover-info",
          "Use HTML content for better structure (slower)",
        );
        chrome.storage.local.set({ useHtml: false });
      }
    });

  document.getElementById("copy").onclick = () => {
    // Copy only the AI response, not the tool calls
    navigator.clipboard.writeText(aiResponseOnly || responseCache);
    document.getElementById("copy").innerText = "Copied!";
    setTimeout(() => {
      document.getElementById("copy").innerText = "Copy response";
    }, 2000);
  };

  document.getElementById("next").onclick = showNext;
  document.getElementById("prev").onclick = showPrev;
  document.getElementById("answer").onclick = (_) => answer();
  document.getElementById("summarize").onclick = summarize;
  document.getElementById("text").focus();
  setupModelPicker();
  populateModelPicker();
  renderButtons();

  // Enter on text box should trigger answer
  document.getElementById("text").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        summarize();
      } else {
        answer();
      }
    }
  });
});
