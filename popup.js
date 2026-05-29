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
let customSystemPrompt = "";

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
  let prompt = `You are Yaq, a web page assistant running in the user's browser as a sidebar. You are viewing the page the user currently has open. You are in a narrow sidebar panel — keep responses short and compact.

## Context
The plain text content of the current page is provided in the first message. For HTML structure and interactive inspection, use the provided tools.

## Tools
- get_page_outline(selector?, depth?): Returns the DOM skeleton — tag names, IDs, classes, no text content. Use to understand page structure before drilling in.
- read_html(selector): Returns the full outerHTML of a specific element. Use when you need exact markup.
- exec_javascript(code): Run JavaScript on the page. The user will be asked to confirm unless auto-approve is on. Keep code minimal.
- add_css(css): Inject CSS styles into the page. Returns an ID for later removal via remove_css.
- remove_css(id): Remove previously injected CSS by its ID.
- render_custom_widget(html, css?): Render rich custom HTML/CSS inline in the chat as a widget. CSS is scoped and won't leak. **Almost never use this** — use markdown for text, lists, tables, code, and most other content. Only use render_custom_widget for truly interactive content (clickable elements, animations) that has no markdown equivalent. If you're about to use it for a table, list, summary, comparison, or any static content — use markdown instead.
- render_form(fields, title?): Render an interactive form in the chat and wait for the user to submit. Each field has a name, type (text/number/email/url/textarea/select/checkbox/radio/date/color/range), label, placeholder, default, options (for select/radio), required, min/max/step (for number/range). Returns the submitted values as a JSON object keyed by field name, or {"_cancelled": true} if cancelled. Use this when you need structured multi-field input from the user.
- get_quick_prompts(): List the current quick prompt pills.
- set_quick_prompts(prompts): Replace all quick prompt pills with a new list.`;

  if (isYouTube) {
    prompt += `\n- get_youtube_subtitles(): Fetch the video's subtitles/transcript.`;
  }

  if (customSystemPrompt) {
    prompt += `\n\n## Additional Instructions\n${customSystemPrompt}`;
  }

  prompt += `

## Guidelines
- You are running inside a narrow sidebar panel. Keep responses short and compact — avoid wide layouts, long prose, and unnecessary verbosity.
- Be concise and direct.
- Answer from the provided page text first; use tools only when needed.
- **Always use markdown** for text responses — tables, lists, code blocks, bold, headers, etc. Do NOT use render_custom_widget for content that can be expressed in markdown. The only valid use for render_custom_widget is truly interactive content with no markdown equivalent.
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

// Render an interactive form inside an assistant bubble and return a promise that resolves with submitted values
function renderForm(bubble, fields, title) {
  return new Promise((resolve) => {
    const card = document.createElement("div");
    card.className = "form-card";

    let html = "";
    if (title) {
      html += `<div class="form-card-header">${escapeHtml(title)}</div>`;
    }
    html += `<div class="form-card-body">`;

    for (const field of fields) {
      const name = field.name;
      const type = field.type || "text";
      const label = field.label || name;
      const placeholder = field.placeholder || "";
      const required = field.required ? "required" : "";
      const defaultVal = field.default != null ? field.default : "";

      if (type === "checkbox") {
        html += `<label class="form-field form-field-checkbox">
          <input type="checkbox" name="${escapeHtml(name)}" ${defaultVal ? "checked" : ""} ${required}>
          <span>${escapeHtml(label)}</span>
        </label>`;
      } else if (type === "radio" && field.options) {
        html += `<div class="form-field">
          <label class="form-label">${escapeHtml(label)}</label>
          <div class="form-radio-group">`;
        for (const opt of field.options) {
          const checked = String(opt.value) === String(defaultVal) ? "checked" : "";
          html += `<label class="form-radio-option">
            <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(opt.value)}" ${checked} ${required}>
            <span>${escapeHtml(opt.label)}</span>
          </label>`;
        }
        html += `</div></div>`;
      } else if (type === "select" && field.options) {
        html += `<div class="form-field">
          <label class="form-label">${escapeHtml(label)}</label>
          <select name="${escapeHtml(name)}" ${required}>`;
        for (const opt of field.options) {
          const selected = String(opt.value) === String(defaultVal) ? "selected" : "";
          html += `<option value="${escapeHtml(opt.value)}" ${selected}>${escapeHtml(opt.label)}</option>`;
        }
        html += `</select></div>`;
      } else if (type === "textarea") {
        html += `<div class="form-field">
          <label class="form-label">${escapeHtml(label)}</label>
          <textarea name="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}" ${required}>${escapeHtml(String(defaultVal))}</textarea>
        </div>`;
      } else if (type === "range") {
        let attrs = `type="range" name="${escapeHtml(name)}" value="${escapeHtml(String(defaultVal))}"`;
        if (field.min != null) attrs += ` min="${field.min}"`;
        if (field.max != null) attrs += ` max="${field.max}"`;
        if (field.step != null) attrs += ` step="${field.step}"`;
        html += `<div class="form-field">
          <div class="form-range-header">
            <label class="form-label">${escapeHtml(label)}</label>
            <span class="form-range-value" data-for="${escapeHtml(name)}">${escapeHtml(String(defaultVal))}</span>
          </div>
          <input ${attrs}>
        </div>`;
      } else {
        // text, number, email, url, date, color
        let attrs = `type="${escapeHtml(type)}" name="${escapeHtml(name)}" value="${escapeHtml(String(defaultVal))}" placeholder="${escapeHtml(placeholder)}" ${required}`;
        if (field.min != null) attrs += ` min="${field.min}"`;
        if (field.max != null) attrs += ` max="${field.max}"`;
        if (field.step != null) attrs += ` step="${field.step}"`;
        html += `<div class="form-field">
          <label class="form-label">${escapeHtml(label)}</label>
          <input ${attrs}>
        </div>`;
      }
    }

    html += `</div>`;
    html += `<div class="form-card-actions">
      <button class="btn-skip" type="button">Cancel</button>
      <button class="btn-run" type="submit">Submit</button>
    </div>`;

    card.innerHTML = html;
    bubble.appendChild(card);

    // Wire up range inputs to update their value display
    card.querySelectorAll('input[type="range"]').forEach((input) => {
      input.addEventListener("input", () => {
        const display = card.querySelector(`.form-range-value[data-for="${input.name}"]`);
        if (display) display.textContent = input.value;
      });
    });

    scrollChatToBottom();

    function collectValues() {
      const values = {};
      for (const field of fields) {
        const type = field.type || "text";
        if (type === "checkbox") {
          const input = card.querySelector(`input[name="${field.name}"]`);
          values[field.name] = input ? input.checked : false;
        } else if (type === "radio") {
          const checked = card.querySelector(`input[name="${field.name}"]:checked`);
          values[field.name] = checked ? checked.value : null;
        } else if (type === "select") {
          const sel = card.querySelector(`select[name="${field.name}"]`);
          values[field.name] = sel ? sel.value : null;
        } else if (type === "textarea") {
          const ta = card.querySelector(`textarea[name="${field.name}"]`);
          values[field.name] = ta ? ta.value : "";
        } else if (type === "number" || type === "range") {
          const input = card.querySelector(`input[name="${field.name}"]`);
          values[field.name] = input && input.value !== "" ? Number(input.value) : null;
        } else {
          const input = card.querySelector(`input[name="${field.name}"]`);
          values[field.name] = input ? input.value : "";
        }
      }
      return values;
    }

    card.querySelector(".btn-run").onclick = () => {
      // Check required fields — add validated class to show red borders
      card.classList.add("validated");
      const invalids = card.querySelectorAll(":invalid");
      if (invalids.length > 0) {
        invalids[0].focus();
        return;
      }
      const values = collectValues();
      // Replace actions with submitted badge
      card.querySelector(".form-card-actions").remove();
      const badge = document.createElement("div");
      badge.className = "form-card-header";
      badge.innerHTML = `<span>${title ? escapeHtml(title) : "Form"}</span><span class="js-confirm-badge">submitted</span>`;
      // Replace the header if it exists, or add one
      const existingHeader = card.querySelector(".form-card-header");
      if (existingHeader) {
        existingHeader.innerHTML = `<span>${escapeHtml(title)}</span><span class="js-confirm-badge">submitted</span>`;
      } else {
        card.prepend(badge);
      }
      // Disable all inputs
      card.querySelectorAll("input, select, textarea").forEach((el) => { el.disabled = true; });
      document.getElementById("text").focus();
      resolve(JSON.stringify(values));
    };

    card.querySelector(".btn-skip").onclick = () => {
      card.querySelector(".form-card-actions").remove();
      const existingHeader = card.querySelector(".form-card-header");
      if (existingHeader) {
        existingHeader.innerHTML = `<span>${escapeHtml(title || "Form")}</span><span style="font-size:10px;color:var(--text-muted)">cancelled</span>`;
      } else {
        const badge = document.createElement("div");
        badge.className = "form-card-header";
        badge.innerHTML = `<span>Form</span><span style="font-size:10px;color:var(--text-muted)">cancelled</span>`;
        card.prepend(badge);
      }
      card.querySelectorAll("input, select, textarea").forEach((el) => { el.disabled = true; });
      document.getElementById("text").focus();
      resolve(null);
    };
  });
}

// Render a static (already-submitted) form for conversation replay
function renderFormStatic(bubble, fields, title, toolResult) {
  let values = {};
  let cancelled = false;
  if (toolResult) {
    try {
      const parsed = JSON.parse(toolResult.content);
      if (parsed._cancelled) {
        cancelled = true;
      } else {
        values = parsed;
      }
    } catch (e) { /* ignore */ }
  }

  const card = document.createElement("div");
  card.className = "form-card";

  const statusBadge = cancelled
    ? `<span style="font-size:10px;color:var(--text-muted)">cancelled</span>`
    : `<span class="js-confirm-badge">submitted</span>`;
  card.innerHTML = `<div class="form-card-header"><span>${escapeHtml(title || "Form")}</span>${statusBadge}</div>`;

  const body = document.createElement("div");
  body.className = "form-card-body";

  for (const field of fields) {
    const val = values[field.name] != null ? values[field.name] : (field.default != null ? field.default : "");
    const label = field.label || field.name;
    const type = field.type || "text";
    const div = document.createElement("div");
    div.className = "form-field";
    if (type === "checkbox") {
      div.className = "form-field form-field-checkbox";
      div.innerHTML = `<input type="checkbox" ${val ? "checked" : ""} disabled><span>${escapeHtml(label)}</span>`;
    } else {
      div.innerHTML = `<label class="form-label">${escapeHtml(label)}</label>
        <input type="text" value="${escapeHtml(String(val))}" disabled>`;
    }
    body.appendChild(div);
  }

  card.appendChild(body);
  bubble.appendChild(card);
  scrollChatToBottom();
}

// Render a custom widget (HTML + CSS) inside an assistant bubble using shadow DOM
function renderCustomWidget(bubble, html, css) {
  const container = document.createElement("div");
  container.className = "custom-widget";
  const shadow = container.attachShadow({ mode: "open" });
  if (css) {
    const style = document.createElement("style");
    style.textContent = css;
    shadow.appendChild(style);
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  shadow.appendChild(wrapper);
  bubble.appendChild(container);
  scrollChatToBottom();
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
            if (block.name === "render_custom_widget") {
              renderCustomWidget(bubble, (block.input || {}).html || "", (block.input || {}).css || "");
            } else if (block.name === "render_form") {
              renderFormStatic(bubble, (block.input || {}).fields || [], (block.input || {}).title || "", toolResults[block.id]);
            } else {
              const result = toolResults[block.id];
              appendToolCallDisplay(
                bubble, block.name, block.input || {},
                result ? result.content : "(no result)",
                result ? result.isError : false,
              );
            }
          }
        }
      }

      // OpenAI format: tool_calls array on assistant message
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch (e) { /* ignore */ }
          if (tc.function.name === "render_custom_widget") {
            renderCustomWidget(bubble, args.html || "", args.css || "");
          } else if (tc.function.name === "render_form") {
            renderFormStatic(bubble, args.fields || [], args.title || "", toolResults[tc.id]);
          } else {
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
      if (isYouTube) {
        try {
          const subtitles = await executeToolCall("get_youtube_subtitles", {});
          if (subtitles && !subtitles.startsWith("Error:")) {
            contextMsg += `\n\n---\nVideo transcript:\n${subtitles}`;
          }
        } catch (e) { /* subtitles not available, continue without */ }
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
    bubble.classList.add("error");
    let errorMd = `**Error:** ${error.message}`;
    if (error.message.includes("Receiving end does not exist")) {
      errorMd += `\n\n<details><summary>Why does this happen?</summary>\n\nThis happens when:\n- The page is restricted (chrome://, file://, extension pages, Web Store)\n- The tab was opened before the extension was installed or reloaded\n- The page hasn't finished loading yet\n</details>`;
    } else if (error.message.includes("Unable to get page content")) {
      errorMd += `\n\n<details><summary>Why does this happen?</summary>\n\nThis can happen with:\n- PDF files or image-only pages\n- Pages that load content dynamically (heavy SPAs)\n- Blank or empty pages\n\nWait for the page to fully load and try again.\n</details>`;
    }
    updateAssistantBubble(bubble, errorMd);
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
                if (toolName === "render_custom_widget") {
                  renderCustomWidget(currentAssistantBubble, args.html, args.css || "");
                  localResult = "Widget rendered successfully";
                } else if (toolName === "render_form") {
                  const formResult = await renderForm(currentAssistantBubble, args.fields || [], args.title || "");
                  localResult = formResult !== null ? formResult : JSON.stringify({ _cancelled: true });
                } else if (toolName === "get_quick_prompts") {
                  localResult = await handleGetQuickPrompts();
                } else if (toolName === "set_quick_prompts") {
                  localResult = await handleSetQuickPrompts(args.prompts);
                }

                if (localResult !== null) {
                  if (toolName !== "render_custom_widget" && toolName !== "render_form") {
                    appendToolCallDisplay(currentAssistantBubble, toolName, args, localResult, false);
                  }
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
          b.classList.add("error");
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

// === Export chat ===

function exportChat() {
  if (conversationMessages.length === 0) return;

  const data = {
    url: pageContent?.url || null,
    exportedAt: new Date().toISOString(),
    messages: conversationMessages,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const title = getConversationTitle(conversationMessages).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.download = `yaq-${title || "chat"}.json`;
  a.click();
  URL.revokeObjectURL(url);
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

  // Load custom system prompt and wire up textarea
  chrome.storage.local.get({ customSystemPrompt: "" }, (items) => {
    customSystemPrompt = items.customSystemPrompt;
    document.getElementById("system-prompt-input").value = customSystemPrompt;
  });

  document.getElementById("system-prompt-input").addEventListener("input", function () {
    customSystemPrompt = this.value.trim();
    chrome.storage.local.set({ customSystemPrompt });
  });

  document.getElementById("yolo-mode").addEventListener("change", function () {
    yoloMode = this.checked;
    chrome.storage.local.set({ yoloMode });
  });

  // New chat button
  document.getElementById("new-chat").addEventListener("click", newChat);

  // Export chat button
  document.getElementById("export-btn").addEventListener("click", exportChat);

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
    "info-btn": "info-popup",
  };

  // Populate version in info popup
  const manifest = chrome.runtime.getManifest();
  document.querySelector(".info-version").textContent = "v" + manifest.version;

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
