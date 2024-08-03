let prevReader = null;
let responseCache = "";

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
}

async function fetchFromOpenAI(messages) {
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

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
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
        },
      );

      await streamResponse(response);
    },
  );
}

async function summarizeText(text) {
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

  await fetchFromOpenAI(messages);
}

async function answerQuestion(text, question) {
  const messages = [
    {
      role: "system",
      content:
        "You are a question answering bot. " +
        "I'll provide you with the content first and then a question. " +
        "Answer the question with a brief answer. ",
    },
    { role: "user", content: text },
    { role: "assistant", content: "What is the question?" },
    { role: "user", content: question },
  ];

  await fetchFromOpenAI(messages);
}

function useSelection() {
  return document.getElementById("selection").checked;
}

function summarize() {
  document.getElementById("output").innerText = `Getting webpage content...`;
  let action = useSelection() ? "getSelection" : "getText";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: action }, (response) => {
      summarizeText(response.text);
    });
  });
}

function answer(question) {
  document.getElementById("output").innerText = `Getting webpage content...`;
  let action = useSelection() ? "getSelection" : "getText";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: action }, (response) => {
      if (
        response === undefined ||
        response.text === undefined ||
        response.text === ""
      ) {
        document.getElementById("output").innerText =
          "Woopsie! Unable to get the webpage content.";
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

      answerQuestion(text, question);
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

    document.getElementById("summarize").onclick = summarize;

    const addClickListener = (id, text) => {
      document.getElementById(id).onclick = () => answer(text);
    };

    // TODO: This should be addable via options page
    addClickListener("answer", "");
    addClickListener("one-line", "Summarize in one line");
    addClickListener("final", "What was the final decision or next steps.");
    addClickListener(
      "sentiment",
      "What is the general sentiment of the text. Keep it short, ideally one line and add an emoji if possible.",
    );
    addClickListener(
      "faq",
      "Generate 5 FAQ that is well answered in this along with their answers. The questions should be generic but informative and not obvious. Format them as markdown dropdowns.",
    );

    document.getElementById("text").focus();

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
