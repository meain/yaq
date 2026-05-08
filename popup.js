// Main popup UI, conversation flow, and event handling

let prevReader = null;
let currentTabId = null;
let conversationMessages = [];
let pageContent = null;
let currentAssistantBubble = null;
let isYouTube = false;
let allModels = [];
let yoloMode = false;
let isProcessing = false;

const converter = new showdown.Converter();

// Persist conversation to storage after every mutation
function persistConversation() {
  if (currentTabId && pageContent) {
    saveConversation(currentTabId, conversationMessages, pageContent.url);
  }
}

function setProcessing(active) {
  isProcessing = active;
  const sendBtn = document.getElementById("send");
  if (active) {
    sendBtn.classList.add("loading");
    sendBtn.disabled = false;
    sendBtn.title = "Stop";
  } else {
    sendBtn.classList.remove("loading");
    sendBtn.disabled = false;
    sendBtn.title = "Send (Enter)";
  }
}

function stopProcessing() {
  if (prevReader) {
    prevReader.cancel();
    prevReader = null;
  }
  setProcessing(false);
  if (currentAssistantBubble) {
    const p = document.createElement("p");
    p.innerHTML = "<em>Stopped</em>";
    currentAssistantBubble.appendChild(p);
    currentAssistantBubble = null;
  }
}
converter.setFlavor("github");

const defaultButtons = [
  { id: "summary", name: "Summary", prompt: "Provide a concise summary of this content, highlighting the main points and key takeaways." },
  { id: "key-points", name: "Key Points", prompt: "Extract the 3-5 most important points from this content as a bulleted list." },
  { id: "explain", name: "Explain", prompt: "Explain this content in simple terms, as if you're teaching it to someone who's new to the topic." },
  { id: "tldr", name: "TL;DR", prompt: "Give me a TL;DR (too long; didn't read) version in 1-2 sentences." },
  { id: "questions", name: "Questions", prompt: "Generate 3-5 thoughtful questions that this content answers or raises." },
  { id: "action-items", name: "Action Items", prompt: "What are the actionable takeaways or next steps mentioned in this content?" },
  { id: "context", name: "Context", prompt: "What background knowledge or context is helpful to better understand this content?" },
  { id: "critique", name: "Critique", prompt: "What are the strengths and potential weaknesses or gaps in this content?" },
];

// === System prompt ===

function buildSystemPrompt() {
  let prompt = `You are Yaq, a web page assistant running in the user's browser. You are viewing the page the user currently has open.

## Context
The plain text content of the current page is provided in the first message. For HTML structure and interactive inspection, use the provided tools.

## Tools
- get_page_outline(selector?, depth?): Returns the DOM skeleton — tag names, IDs, classes, no text content. Use to understand page structure before drilling in.
- read_html(selector): Returns the full outerHTML of a specific element. Use when you need exact markup.
- exec_javascript(code): Run JavaScript on the page. The user will be asked to confirm unless auto-approve is on. Keep code minimal.
- add_css(css): Inject CSS styles into the page. Returns an ID for later removal via remove_css.
- remove_css(id): Remove previously injected CSS by its ID.
- get_quick_prompts(): List the current quick prompt pills.
- set_quick_prompts(prompts): Replace all quick prompt pills with a new list.`;

  if (isYouTube) {
    prompt += `\n- get_youtube_subtitles(): Fetch the video's subtitles/transcript.`;
  }

  prompt += `

## Guidelines
- Be concise and direct.
- Answer from the provided page text first; use tools only when needed.
- **Before running exec_javascript, ALWAYS use get_page_outline and/or read_html first** to find the correct selectors, element structure, and attributes. Never guess at selectors or class names — look them up. The page text does NOT contain this information.
- **Verify before acting**: after finding elements with the outline/HTML tools, confirm you have the right target before clicking, navigating, or modifying. If the user asks to click "the first blog post", read the HTML to find which link that actually is — don't assume.
- exec_javascript returns the value of the last expression (like a REPL). Use it for simple lookups like \`document.title\` or \`window.location.href\`.
- For page modifications, explain what you'll do before acting.
- When using exec_javascript, write minimal, safe code.`;

  return prompt;
}

// === Chat rendering ===

let userScrolledAway = false;

function scrollChatToBottom(force) {
  if (force || !userScrolledAway) {
    const chat = document.getElementById("chat-messages");
    chat.scrollTop = chat.scrollHeight;
    userScrolledAway = false;
  }
}

function clearWelcome() {
  const welcome = document.querySelector(".welcome");
  if (welcome) welcome.remove();
}

function createCopyButton(getText) {
  const btn = document.createElement("button");
  btn.className = "copy-btn";
  btn.title = "Copy";
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  btn.onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getText());
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    setTimeout(() => {
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    }, 1500);
  };
  return btn;
}

function appendUserBubble(text) {
  clearWelcome();
  const chat = document.getElementById("chat-messages");
  const wrapper = document.createElement("div");
  wrapper.className = "chat-bubble-wrapper user";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble user";
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  wrapper.appendChild(createCopyButton(() => text));
  chat.appendChild(wrapper);
  scrollChatToBottom(true);
}

function appendAssistantBubble() {
  clearWelcome();
  const chat = document.getElementById("chat-messages");
  const wrapper = document.createElement("div");
  wrapper.className = "chat-bubble-wrapper assistant";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble assistant";
  wrapper.appendChild(bubble);
  wrapper.appendChild(createCopyButton(() => bubble._rawMarkdown || bubble.textContent));
  chat.appendChild(wrapper);
  scrollChatToBottom(true);
  return bubble;
}

function updateAssistantBubble(bubble, markdown) {
  bubble._rawMarkdown = markdown;
  bubble.innerHTML = converter.makeHtml(markdown);
  scrollChatToBottom();
}

function appendToolCallDisplay(bubble, toolName, args, result, isError) {
  const details = document.createElement("details");
  details.className = "tool-call-inline" + (isError ? " error" : "");

  const argsStr = Object.entries(args)
    .map(([, v]) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return s.length > 40 ? s.substring(0, 40) + "..." : s;
    })
    .join(", ");

  details.innerHTML = `
    <summary><em class="tool-icon">${isError ? "\u274C" : "\u{1F527}"}</em> ${toolName}(${argsStr})</summary>
    <div class="tool-result">${escapeHtml(typeof result === "string" ? result : JSON.stringify(result, null, 2))}</div>
  `;

  bubble.appendChild(details);
  scrollChatToBottom();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// JS execution confirmation card
function showJsConfirmation(code) {
  return new Promise((resolve) => {
    const bubble = currentAssistantBubble || appendAssistantBubble();

    if (yoloMode) {
      // Auto-approve: show briefly then resolve
      const card = document.createElement("div");
      card.className = "js-confirm-card";
      card.innerHTML = `
        <div class="js-confirm-header">
          <span>JavaScript</span>
          <span class="js-confirm-badge">auto-approved</span>
        </div>
        <div class="js-confirm-code">${escapeHtml(code)}</div>
      `;
      bubble.appendChild(card);
      scrollChatToBottom();
      resolve(true);
      return;
    }

    const card = document.createElement("div");
    card.className = "js-confirm-card";
    card.innerHTML = `
      <div class="js-confirm-header">
        <span>JavaScript — confirm execution</span>
      </div>
      <div class="js-confirm-code">${escapeHtml(code)}</div>
      <div class="js-confirm-actions">
        <button class="btn-skip">Skip</button>
        <button class="btn-run">Run</button>
      </div>
    `;
    bubble.appendChild(card);
    scrollChatToBottom();

    card.querySelector(".btn-run").onclick = () => {
      card.querySelector(".js-confirm-actions").remove();
      const header = card.querySelector(".js-confirm-header");
      header.innerHTML = `<span>JavaScript</span><span class="js-confirm-badge">approved</span>`;
      document.getElementById("text").focus();
      resolve(true);
    };
    card.querySelector(".btn-skip").onclick = () => {
      card.querySelector(".js-confirm-actions").remove();
      const header = card.querySelector(".js-confirm-header");
      header.innerHTML = `<span>JavaScript</span><span style="font-size:10px;color:var(--text-muted)">skipped</span>`;
      document.getElementById("text").focus();
      resolve(false);
    };
  });
}

// Build a map of tool call ID -> tool result from the message history
function buildToolResultMap(messages) {
  const map = {};
  for (const msg of messages) {
    if (msg.role === "tool" && msg.tool_call_id) {
      // OpenAI format
      map[msg.tool_call_id] = { content: msg.content, isError: false };
    } else if (msg.role === "user" && Array.isArray(msg.content)) {
      // Anthropic format: tool_result blocks inside user messages
      for (const block of msg.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          map[block.tool_use_id] = { content: block.content, isError: !!block.is_error };
        }
      }
    }
  }
  return map;
}

// Render a full conversation from history (read-only)
function renderConversation(messages) {
  const chat = document.getElementById("chat-messages");
  chat.innerHTML = "";

  const toolResults = buildToolResultMap(messages);

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        // Skip the initial page content message (it's very long)
        if (msg.content.length > 500) continue;
        appendUserBubble(msg.content);
      }
      continue;
    }

    // Skip tool result messages — they're rendered inline with the tool call
    if (msg.role === "tool") continue;

    if (msg.role === "assistant") {
      const bubble = appendAssistantBubble();

      if (typeof msg.content === "string" && msg.content.trim()) {
        updateAssistantBubble(bubble, msg.content);
      } else if (Array.isArray(msg.content)) {
        // Anthropic format with content blocks
        for (const block of msg.content) {
          if (block.type === "text" && block.text.trim()) {
            updateAssistantBubble(bubble, block.text);
          } else if (block.type === "tool_use") {
            const result = toolResults[block.id];
            appendToolCallDisplay(
              bubble, block.name, block.input || {},
              result ? result.content : "(no result)",
              result ? result.isError : false,
            );
          }
        }
      }

      // OpenAI format: tool_calls array on assistant message
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch (e) { /* ignore */ }
          const result = toolResults[tc.id];
          appendToolCallDisplay(
            bubble, tc.function.name, args,
            result ? result.content : "(no result)",
            result ? result.isError : false,
          );
        }
      }
    }
  }

  scrollChatToBottom();
}

// === Conversation flow ===

function getPageContent() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "getContent" },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.text) {
            reject(new Error(response?.error || "Unable to get page content"));
            return;
          }
          resolve(response);
        },
      );
    });
  });
}

async function sendMessage(text) {
  if (!text || !text.trim()) return;

  const textArea = document.getElementById("text");
  textArea.value = "";
  textArea.style.height = "auto";
  userScrolledAway = false;
  setProcessing(true);

  appendUserBubble(text);

  try {
    // First message: fetch page content and build initial context
    if (conversationMessages.length === 0) {
      pageContent = await getPageContent();

      const systemPrompt = buildSystemPrompt();
      conversationMessages.push({ role: "system", content: systemPrompt });

      // Add page content as first user message, then the actual question
      let contextMsg = `Here is the page content:\n\nTitle: ${pageContent.title}\nURL: ${pageContent.url}\n\n${pageContent.text}`;
      if (pageContent.selection) {
        contextMsg += `\n\n---\nUser selected text: ${pageContent.selection}`;
      }
      conversationMessages.push({ role: "user", content: contextMsg });
      conversationMessages.push({
        role: "assistant",
        content: "I've read the page content. How can I help?",
      });
    }

    // Add user message
    conversationMessages.push({ role: "user", content: text });
    persistConversation();

    // Get LLM response with tool loop
    await getLLMResponse();
  } catch (error) {
    const bubble = appendAssistantBubble();
    updateAssistantBubble(bubble, `**Error:** ${error.message}`);
  } finally {
    setProcessing(false);
    textArea.focus();
  }
}

async function getLLMResponse() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      { service: "openai", apiKey: "", openAIBaseUrl: "" },
      async function (items) {
        const service = items.service;
        const apiKey = items.apiKey;
        const model = document.getElementById("model").value;
        const baseUrl = items.openAIBaseUrl;

        if (!apiKey) {
          const b = appendAssistantBubble();
          updateAssistantBubble(b, "Please set your API key in the [extension options](chrome://extensions).");
          resolve();
          return;
        }
        if (!model) {
          const b = appendAssistantBubble();
          updateAssistantBubble(b, "Please select a model first.");
          resolve();
          return;
        }

        chrome.storage.local.set({ model });

        let currentMessages = [...conversationMessages];
        let systemPrompt = "";

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

        const tools =
          service === "anthropic"
            ? getToolsAnthropic(isYouTube)
            : getToolsOpenAI(isYouTube);

        try {
          // Tool calling loop
          while (true) {
            currentAssistantBubble = appendAssistantBubble();

            const onChunk = (text) => {
              updateAssistantBubble(currentAssistantBubble, text);
            };

            let response;
            if (service === "anthropic") {
              const raw = await fetchFromAnthropic(
                baseUrl, model, apiKey, currentMessages, systemPrompt, tools,
              );
              response = await streamAnthropicResponse(raw, onChunk);
            } else {
              const raw = await fetchFromOpenAI(
                baseUrl, model, apiKey, currentMessages, tools,
              );
              response = await streamResponse(raw, onChunk);
            }

            // If no content was streamed but we have tool calls, remove the empty bubble
            if (!response.content?.trim() && response.toolCalls) {
              currentAssistantBubble.remove();
              currentAssistantBubble = appendAssistantBubble();
            }

            if (response.toolCalls && response.toolCalls.length > 0) {
              // Parse all tool arguments upfront (may be incomplete JSON from streaming)
              const parsedToolCalls = [];
              for (const tc of response.toolCalls) {
                let parsedArgs = {};
                try {
                  parsedArgs = tc.function.arguments
                    ? JSON.parse(tc.function.arguments)
                    : {};
                } catch (e) {
                  // Incomplete JSON from interrupted stream — skip this tool call
                  console.warn("Failed to parse tool args:", tc.function.arguments, e);
                  continue;
                }
                parsedToolCalls.push({ ...tc, parsedArgs });
              }

              if (parsedToolCalls.length === 0) {
                // All tool calls had unparseable arguments — treat as final response
                if (response.content) {
                  conversationMessages.push({
                    role: "assistant",
                    content: response.content,
                  });
                }
                persistConversation();
                setProcessing(false);
                currentAssistantBubble = null;
                resolve();
                break;
              }

              // Add assistant message to conversation
              if (service === "anthropic") {
                const contentBlocks = [];
                if (response.content) {
                  contentBlocks.push({ type: "text", text: response.content });
                }
                for (const tc of parsedToolCalls) {
                  contentBlocks.push({
                    type: "tool_use",
                    id: tc.id,
                    name: tc.function.name,
                    input: tc.parsedArgs,
                  });
                }
                currentMessages.push({ role: "assistant", content: contentBlocks });
                conversationMessages.push({ role: "assistant", content: contentBlocks });
              } else {
                const asstMsg = {
                  role: "assistant",
                  content: response.content || "",
                  tool_calls: response.toolCalls,
                };
                currentMessages.push(asstMsg);
                conversationMessages.push(asstMsg);
              }
              persistConversation();

              // Execute each tool
              const anthropicResults = [];

              for (const tc of parsedToolCalls) {
                const toolName = tc.function.name;
                const args = tc.parsedArgs;

                // exec_javascript needs confirmation
                if (toolName === "exec_javascript") {
                  const approved = await showJsConfirmation(args.code);
                  if (!approved) {
                    const result = "User declined execution";
                    appendToolCallDisplay(currentAssistantBubble, toolName, args, result, false);

                    if (service === "anthropic") {
                      anthropicResults.push({
                        type: "tool_result",
                        tool_use_id: tc.id,
                        content: result,
                      });
                    } else {
                      const toolMsg = { role: "tool", tool_call_id: tc.id, content: result };
                      currentMessages.push(toolMsg);
                      conversationMessages.push(toolMsg);
                      persistConversation();
                    }
                    continue;
                  }
                }

                // Handle local tools (not routed through content script)
                let localResult = null;
                if (toolName === "get_quick_prompts") {
                  localResult = await handleGetQuickPrompts();
                } else if (toolName === "set_quick_prompts") {
                  localResult = await handleSetQuickPrompts(args.prompts);
                }

                if (localResult !== null) {
                  appendToolCallDisplay(currentAssistantBubble, toolName, args, localResult, false);
                  if (service === "anthropic") {
                    anthropicResults.push({
                      type: "tool_result",
                      tool_use_id: tc.id,
                      content: localResult,
                    });
                  } else {
                    const toolMsg = { role: "tool", tool_call_id: tc.id, content: localResult };
                    currentMessages.push(toolMsg);
                    conversationMessages.push(toolMsg);
                    persistConversation();
                  }
                  continue;
                }

                try {
                  const result = await executeToolCall(toolName, args);
                  appendToolCallDisplay(currentAssistantBubble, toolName, args, result, false);

                  if (service === "anthropic") {
                    anthropicResults.push({
                      type: "tool_result",
                      tool_use_id: tc.id,
                      content: result,
                    });
                  } else {
                    const toolMsg = { role: "tool", tool_call_id: tc.id, content: result };
                    currentMessages.push(toolMsg);
                    conversationMessages.push(toolMsg);
                    persistConversation();
                  }
                } catch (error) {
                  const errMsg = `Error: ${error.message}`;
                  appendToolCallDisplay(currentAssistantBubble, toolName, args, errMsg, true);

                  if (service === "anthropic") {
                    anthropicResults.push({
                      type: "tool_result",
                      tool_use_id: tc.id,
                      content: errMsg,
                      is_error: true,
                    });
                  } else {
                    const toolMsg = { role: "tool", tool_call_id: tc.id, content: errMsg };
                    currentMessages.push(toolMsg);
                    conversationMessages.push(toolMsg);
                    persistConversation();
                  }
                }
              }

              if (service === "anthropic") {
                const toolResultMsg = { role: "user", content: anthropicResults };
                currentMessages.push(toolResultMsg);
                conversationMessages.push(toolResultMsg);
                persistConversation();
              }

              // Continue loop for next LLM response
            } else {
              // Final response — add to conversation
              if (response.content) {
                conversationMessages.push({
                  role: "assistant",
                  content: response.content,
                });
              }
              persistConversation();

              setProcessing(false);
              currentAssistantBubble = null;
              resolve();
              break;
            }
          }
        } catch (error) {
          setProcessing(false);
          const b = currentAssistantBubble || appendAssistantBubble();
          updateAssistantBubble(b, `**Error:** ${error.message}`);
          currentAssistantBubble = null;
          reject(error);
        }
      },
    );
  });
}

// === New Chat ===

function showWelcome() {
  const chat = document.getElementById("chat-messages");
  chat.innerHTML = `
    <div class="welcome">
      <svg class="welcome-illustration" width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="44" r="24" fill="var(--surface)" stroke="var(--border)" stroke-width="2"/>
        <circle cx="33" cy="39" r="3" fill="var(--accent)"/>
        <circle cx="47" cy="39" r="3" fill="var(--accent)"/>
        <path d="M35 50 Q40 55 45 50" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round"/>
        <circle cx="62" cy="22" r="10" stroke="var(--text-muted)" stroke-width="2.5" fill="none"/>
        <line x1="69" y1="29" x2="76" y2="36" stroke="var(--text-muted)" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M14 18 L16 14 L18 18 L22 20 L18 22 L16 26 L14 22 L10 20 Z" fill="var(--border)"/>
      </svg>
      <h2>Yaq</h2>
      <p>Ask anything about this page, or pick a quick prompt above.</p>
    </div>
  `;
}

function newChat() {
  const hadConversation = conversationMessages.length >= 3 && pageContent;
  const oldMessages = conversationMessages;
  const oldUrl = pageContent?.url;

  // Reset state
  conversationMessages = [];
  pageContent = null;
  currentAssistantBubble = null;

  showWelcome();

  // Clear stored conversation
  if (currentTabId) {
    clearConversation(currentTabId);
  }

  document.getElementById("text").focus();

  // Archive then refresh history list so the new entry appears immediately
  if (hadConversation) {
    archiveConversation(oldMessages, oldUrl, () => {
      renderHistoryList(onHistorySelect);
    });
  } else {
    renderHistoryList(onHistorySelect);
  }
}

function onHistorySelect(interaction) {
  // Render archived conversation read-only
  renderConversation(interaction.messages);
}

// === Model picker ===

function updateModelLabel(model) {
  const label = document.getElementById("model-label");
  // Show short name: take last segment or truncate
  const short = model.includes("/") ? model.split("/").pop() : model;
  label.textContent = short.length > 15 ? short.substring(0, 15) + "..." : short;
}

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
      document.getElementById("model").value = m;
      chrome.storage.local.set({ model: m });
      updateModelLabel(m);
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
    if (allModels.length > 0) dropdown.classList.add("open");
  });

  modelInput.addEventListener("input", () => {
    renderModelDropdown(modelInput.value);
    if (allModels.length > 0) dropdown.classList.add("open");
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
      if (items.model) modelInput.value = items.model;
      modelInput.placeholder = "Model...";

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

      modelInput.placeholder = "Loading...";
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
            models,
            timestamp: now,
          },
        });
      }
      modelInput.placeholder = "Model...";
    },
  );
}

// === Pills ===

function renderPills() {
  chrome.storage.local.get({ buttons: defaultButtons }, function (items) {
    const pills = document.getElementById("pills");
    pills.innerHTML = "";

    items.buttons.forEach((button, idx) => {
      const pill = document.createElement("button");
      pill.className = "pill";
      pill.textContent = button.name;
      pill.onclick = () => sendMessage(button.prompt);
      pills.appendChild(pill);

      // Ctrl+1-9 shortcuts
      if (idx < 9) {
        document.addEventListener("keydown", function (e) {
          if (e.ctrlKey && e.key === (idx + 1).toString()) {
            e.preventDefault();
            sendMessage(button.prompt);
          }
        });
      }
    });
  });
}

// === Quick prompt tools ===

function handleGetQuickPrompts() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ buttons: defaultButtons }, (items) => {
      resolve(JSON.stringify(items.buttons, null, 2));
    });
  });
}

function handleSetQuickPrompts(prompts) {
  return new Promise((resolve) => {
    const buttons = prompts.map((p) => ({
      id: p.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      name: p.name,
      prompt: p.prompt,
    }));
    chrome.storage.local.set({ buttons }, () => {
      renderPills();
      resolve(`Updated ${buttons.length} quick prompts: ${buttons.map((b) => b.name).join(", ")}`);
    });
  });
}

// === Textarea auto-resize ===

function setupTextarea() {
  const textarea = document.getElementById("text");

  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(textarea.value.trim());
    }
  });
}

// === Init ===

document.addEventListener("DOMContentLoaded", function () {
  showWelcome();

  // Track if user has scrolled away from bottom
  const chatEl = document.getElementById("chat-messages");
  chatEl.addEventListener("scroll", () => {
    const nearBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 60;
    userScrolledAway = !nearBottom;
  });

  // Get current tab info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabId = tabs[0].id;
      isYouTube = tabs[0].url?.includes("youtube.com/watch") || false;

      // Restore conversation if exists
      loadConversation(currentTabId, (data) => {
        if (data && data.messages && data.messages.length > 0) {
          conversationMessages = data.messages;
          pageContent = { url: data.url, title: "", text: "", selection: "" };
          renderConversation(data.messages);
        }
      });
    }
  });

  // Load yolo mode preference
  chrome.storage.local.get({ yoloMode: false }, (items) => {
    yoloMode = items.yoloMode;
    document.getElementById("yolo-mode").checked = yoloMode;
  });

  document.getElementById("yolo-mode").addEventListener("change", function () {
    yoloMode = this.checked;
    chrome.storage.local.set({ yoloMode });
  });

  // New chat button
  document.getElementById("new-chat").addEventListener("click", newChat);

  // Send button — sends when idle, stops when processing
  document.getElementById("send").addEventListener("click", () => {
    if (isProcessing) {
      stopProcessing();
    } else {
      sendMessage(document.getElementById("text").value.trim());
    }
  });

  // Bottom bar popups
  const popupButtons = {
    "history-btn": "history-popup",
    "model-btn": "model-popup",
    "settings-btn": "settings-popup",
  };

  function closePopups() {
    for (const [btnId, popupId] of Object.entries(popupButtons)) {
      document.getElementById(popupId).style.display = "none";
      document.getElementById(btnId).classList.remove("active");
    }
  }

  for (const [btnId, popupId] of Object.entries(popupButtons)) {
    document.getElementById(btnId).addEventListener("click", (e) => {
      e.stopPropagation();
      const popup = document.getElementById(popupId);
      const wasOpen = popup.style.display !== "none";
      closePopups();
      if (!wasOpen) {
        popup.style.display = "block";
        document.getElementById(btnId).classList.add("active");
        // Focus model input when opening model popup
        if (popupId === "model-popup") {
          document.getElementById("model").focus();
        }
      }
    });
  }

  // Close popups when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".bottom-bar")) {
      closePopups();
    }
  });

  // Setup
  setupTextarea();
  setupModelPicker();
  populateModelPicker();
  renderPills();
  renderHistoryList(onHistorySelect);

  document.getElementById("text").focus();
});
