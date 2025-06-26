let prevReader = null;
let responseCache = "";
let index = -1;

const defaultButtons = [
  {
    id: "one-line",
    name: "One line",
    prompt: "Summarize in one line",
  },
  {
    id: "final",
    name: "Final",
    prompt: "What was the final decision or next steps.",
  },
  {
    id: "faq",
    name: "FAQ",
    prompt:
      "Generate 5 FAQ that is well answered in this along with their answers. The questions should be generic but informative and not obvious. Format them as markdown dropdowns.",
  },
  {
    id: "sentiment",
    name: "Sentiment",
    prompt: "What is the sentiment of this text?",
  },
  {
    id: "unclickbait",
    name: "Unclickbait",
    prompt: "What is the non-clickbait headline for this text?",
  },
  {
    id: "answer",
    name: "Answer",
    prompt: "What is the answer to the question in the title?",
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
                          arguments: toolCall.function?.arguments || ""
                        }
                      };
                    } else {
                      if (toolCall.function?.name) {
                        toolCalls[toolCall.index].function.name += toolCall.function.name;
                      }
                      if (toolCall.function?.arguments) {
                        toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
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
    content: output
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
        }
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
                description: "CSS selector for the element to click"
              }
            },
            required: ["selector"]
          }
        }
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
                description: "CSS selector for the element to scroll to"
              }
            },
            required: ["selector"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "input_text",
          description: "Enter text into an input field, textarea, or other text element using CSS selector",
          parameters: {
            type: "object",
            properties: {
              selector: {
                type: "string",
                description: "CSS selector for the input element"
              },
              text: {
                type: "string",
                description: "Text to enter into the field"
              },
              clear: {
                type: "boolean",
                description: "Whether to clear the field before entering text (default: true)"
              }
            },
            required: ["selector", "text"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "navigate_to",
          description: "Navigate to a different URL and wait for the page to load completely",
          parameters: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL to navigate to (can be relative or absolute)"
              }
            },
            required: ["url"]
          }
        }
      }
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

async function getLLMResponse(messages) {
  index = -1; // Reset index

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      {
        apiKey: "",
        model: "",
        openAIBaseUrl: "",
      },
      async function (items) {
        const apiKey = items.apiKey;
        const model = items.model;
        const openAIBaseUrl = items.openAIBaseUrl;

        if (apiKey === "" || model === "") {
          document.getElementById("output").innerText =
            "Please set your OpenAI API key and model in the options page";
          return;
        }

        // Show progress indicator
        document.getElementById("progress-container").style.display = "flex";
        
        document.getElementById("output").innerText =
          `Processing using ${model}...`;

        let currentMessages = [...messages];
        let finalResponse = "";

        // Continue conversation until we get a non-tool response
        while (true) {
          const response = await fetchFromOpenAI(
            openAIBaseUrl,
            model,
            apiKey,
            currentMessages,
          );
          
          if (response.toolCalls && response.toolCalls.length > 0) {
            // Add assistant message with tool calls
            currentMessages.push({
              role: "assistant",
              content: response.content || "",
              tool_calls: response.toolCalls
            });

            // Execute tools and add results
            for (const toolCall of response.toolCalls) {
              try {
                const result = await executeToolCall(toolCall.function.name, JSON.parse(toolCall.function.arguments));
                currentMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: result
                });
                finalResponse += `\n\n🔧 **Tool executed**: ${toolCall.function.name}(${toolCall.function.arguments})\n**Result**: ${result}`;
              } catch (error) {
                currentMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Error: ${error.message}`
                });
                finalResponse += `\n\n❌ **Tool error**: ${toolCall.function.name} - ${error.message}`;
              }
            }
            
            // Update UI with current progress
            renderPartialHTML(finalResponse);
          } else {
            // Final response without tools
            finalResponse += response.response;
            // Hide progress indicator
            document.getElementById("progress-container").style.display = "none";
            resolve({ provider: "openai", model, response: finalResponse });
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
        (toolsEnabled() ? " You have access to tools to interact with the page - use click_element(selector) to click elements, scroll_to_element(selector) to scroll to elements, input_text(selector, text) to enter text into form fields, and navigate_to(url) to navigate to other pages when helpful." : ""),
    },
  ];

  if (input.subtitles) {
    messages.push({ role: "user", content: input.subtitles });
  } else {
    // Use HTML content if the toggle is enabled, otherwise use plain text
    messages.push({ role: "user", content: useHtmlContent() ? input.html : input.text });
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

document.addEventListener(
  "DOMContentLoaded",
  function () {
    // Set up cancel button
    document.getElementById("cancel-request").addEventListener("click", function() {
      if (prevReader) {
        prevReader.cancel();
        prevReader = null;
        document.getElementById("progress-container").style.display = "none";
        document.getElementById("output").innerHTML += "<p><em>Request cancelled by user</em></p>";
      }
    });
    
    // Restore preferences
    chrome.storage.local.get({ 
      useHtml: false, 
      enableTools: false 
    }, function (items) {
      document.getElementById("use_html").checked = items.useHtml;
      document.getElementById("enable_tools").checked = items.enableTools;
      
      // If tools are enabled, force HTML on and disable the checkbox
      if (items.enableTools) {
        document.getElementById("use_html").checked = true;
        document.getElementById("use_html").disabled = true;
        const htmlLabel = document.querySelector('label[for="use_html"]');
        htmlLabel.classList.add('disabled');
        htmlLabel.setAttribute('data-hover-info', 'Required when tools are enabled for element selection');
      }
    });

    // Save preferences when changed
    document.getElementById("use_html").addEventListener("change", function() {
      chrome.storage.local.set({ useHtml: this.checked });
    });

    document.getElementById("enable_tools").addEventListener("change", function() {
      chrome.storage.local.set({ enableTools: this.checked });
      
      // Auto-enable HTML and disable the checkbox when tools are enabled
      if (this.checked) {
        document.getElementById("use_html").checked = true;
        document.getElementById("use_html").disabled = true;
        const htmlLabel = document.querySelector('label[for="use_html"]');
        htmlLabel.classList.add('disabled');
        htmlLabel.setAttribute('data-hover-info', 'Required when tools are enabled for element selection');
        chrome.storage.local.set({ useHtml: true });
      } else {
        // Auto-disable HTML and re-enable the checkbox when tools are disabled
        document.getElementById("use_html").checked = false;
        document.getElementById("use_html").disabled = false;
        const htmlLabel = document.querySelector('label[for="use_html"]');
        htmlLabel.classList.remove('disabled');
        htmlLabel.setAttribute('data-hover-info', 'Use HTML content for better structure (slower)');
        chrome.storage.local.set({ useHtml: false });
      }
    });

    document.getElementById("copy").onclick = () => {
      navigator.clipboard.writeText(responseCache);
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
  },
);
