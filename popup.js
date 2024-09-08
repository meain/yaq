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
    prompt: "Generate 5 FAQ that is well answered in this along with their answers. The questions should be generic but informative and not obvious. Format them as markdown dropdowns.",
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
      }

      if (index < interactions.length && index > 0) {
        index--;
        showInteractionAtIndex(interactions, index);
      }
    },
  );
}

async function streamResponse(response) {
  if (prevReader) {
    prevReader.cancel();
  }

  const reader = response.body.getReader();
  prevReader = reader;

  const decoder = new TextDecoder("utf-8");
  let done = false;
  let result = "";
  let output = "";
  let remaining = false;

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (remaining) {
      result += decoder.decode(value, { stream: !done });
    } else {
      result = decoder.decode(value, { stream: !done });
    }

    remaining = false

    // Process the stream as it comes in
    if (value) {
      const lines = result.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          if (line.substring(6) == "[DONE]") break;
          try {
            const data = JSON.parse(line.substring(6));

            if (data.choices && data.choices.length > 0) {
              const content = data.choices[0].delta?.content || "";
              output += content;
              renderPartialHTML(output);
            }
          } catch (error) {
            remaining = true
            result = line; // should be just the last line
          }
        }
      }
    }
  }

  return output;
}

async function fetchFromOpenAI(model, apiKey, messages) {
  if (apiKey === "" || model === "") {
    document.getElementById("output").innerText =
      "Please set your OpenAI API key and model in the options page";
    return;
  }

  document.getElementById("output").innerText = `Processing using ${model}...`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      stream: true, // Enable streaming
      messages: messages,
    }),
  });

  return await streamResponse(response);
}

function getLLMResponse(messages) {
  index = -1; // Reset index

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      {
        apiKey: "",
        model: "",
      },
      async function (items) {
        const apiKey = items.apiKey;
        const model = items.model;

        if (apiKey === "" || model === "") {
          document.getElementById("output").innerText =
            "Please set your OpenAI API key and model in the options page";
          return;
        }

        document.getElementById("output").innerText =
          `Processing using ${model}...`;

        const response = await fetchFromOpenAI(model, apiKey, messages);
        resolve({ provider: "openai", model, response });
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

async function summarizeText(url, text) {
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
        "Use emojies if necessary.",
    },
  ];

  if (input.subtitles) {
    messages.push({ role: "user", content: input.subtitles })
  } else {
    // we have an option to use html(but it is much slower)
    messages.push({ role: "user", content: input.text })
  }

  if (input.selection) {
    messages.push({role: "assistant", content: "Was there any specific text to focus on?"})
    messages.push({ role: "user", content: input.selection })
  }

  messages.push({ role: "assistant", content: "What is the question?" })
  messages.push({ role: "user", content: question })

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

function summarize() {
  document.getElementById("output").innerText = `Getting webpage content...`;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getContent" }, (response) => {
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

      summarizeText(response.url, response.text);
    });
  });
}

function answer(question) {
  document.getElementById("output").innerText = `Getting webpage content...`;
  let cont = continueConversation();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getContent" }, (response) => {
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
    });
  });
}

function renderPartialHTML(partialText) {
  responseCache = partialText;
  const converter = new showdown.Converter();
  converter.setFlavor('github'); // use GFM
  const partialHtml = converter.makeHtml(partialText);
  document.getElementById("output").innerHTML = partialHtml;
  document.getElementById("copy").style.display = "block";
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
        buttonElement.onclick = () => answer(button.prompt);
        document.getElementById("buttons").appendChild(buttonElement);

        // Add keyboard shortcut
        if (index < 9) {
          document.addEventListener('keydown', function(event) {
            if (event.ctrlKey && event.key === (index + 1).toString()) {
              event.preventDefault();
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
    document.getElementById("copy").onclick = () => {
      navigator.clipboard.writeText(responseCache);
      document.getElementById("copy").innerText = "Copied!";
      setTimeout(() => {
        document.getElementById("copy").innerText = "Copy response";
      }, 2000);
    };

    document.getElementById("next").onclick = showNext;
    document.getElementById("prev").onclick = showPrev;

    document.getElementById("answer").onclick = (_) => answer(); // passes event as arg
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
  false,
);
