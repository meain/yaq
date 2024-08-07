let prevReader = null;
let responseCache = "";
let index = -1;

const defaultButtons = {
  "one-line": {
    name: "One line",
    prompt: "Summarize in one line",
  },
  final: {
    name: "Final",
    prompt: "What was the final decision or next steps.",
  },
  faq: {
    name: "FAQ",
    prompt:
      "Generate 5 FAQ that is well answered in this along with their answers. The questions should be generic but informative and not obvious. Format them as markdown dropdowns.",
  },
  sentiment: {
    name: "Sentiment",
    prompt: "What is the sentiment of this text?",
  },
  unclickbait: {
    name: "Unclickbait",
    prompt: "What is the non-clickbait headline for this text?",
  },
};

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

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    result = decoder.decode(value, { stream: !done });
    // Process the stream as it comes in
    if (value) {
      const lines = result.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          if (line.substring(6) == "[DONE]") break;
          const data = JSON.parse(line.substring(6));

          if (data.choices && data.choices.length > 0) {
            const content = data.choices[0].delta?.content || "";
            output += content;
            renderPartialHTML(output);
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

async function answerQuestion(url, text, cont, question) {
  const lastInteraction = await getLastInteraction(url);
  let messages = [
    {
      role: "system",
      content:
        "You are a question answering bot. Be concise, yet informative. " +
        "I'll provide you with the content first and then a question. " +
        "Use emojies if necessary.",
    },
    { role: "user", content: text },
    { role: "assistant", content: "What is the question?" },
    { role: "user", content: question },
  ];

  if (lastInteraction && cont) {
    messages = lastInteraction.messages;
    messages.push({ role: "user", content: question });
  }

  document.getElementById("question").innerText = "Q: " + question;
  let purl = new URL(url);
  document.getElementById("qurl").innerText = purl.hostname;
  document.getElementById("qurl").href = url;

  const response = await getLLMResponse(messages);
  await storeInteraction(
    "qa",
    lastInteraction && cont,
    url,
    messages,
    response,
  );
}

function useSelection() {
  return document.getElementById("selection").checked;
}

function continueConversation() {
  return document.getElementById("continue").checked;
}

function summarize() {
  document.getElementById("output").innerText = `Getting webpage content...`;
  let action = useSelection() ? "getSelection" : "getText";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: action }, (response) => {
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
  let action = useSelection() ? "getSelection" : "getText";
  let cont = continueConversation();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: action }, (response) => {
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

      const text = response.text;

      if (question == undefined || question === "") {
        question = document.getElementById("text").value;
        if (!question) {
          document.getElementById("output").innerText =
            "Please provide a question";
          return;
        }
      }

      answerQuestion(response.url, text, cont, question);
    });
  });
}

function renderPartialHTML(partialText) {
  responseCache = partialText;
  const converter = new showdown.Converter();
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
      for (const [id, button] of Object.entries(buttons)) {
        const buttonElement = document.createElement("button");
        buttonElement.id = id;
        buttonElement.innerText = button.name;
        buttonElement.onclick = () => answer(button.prompt);
        document.getElementById("buttons").appendChild(buttonElement);
      }
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
