const OPENAI_API_KEY =
  "...";

const OPENAI_MODEL = "gpt-4o-mini";

async function summarizeText(text) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      stream: true, // Enable streaming
      messages: [
        {
          role: "system",
          content:
            "You are a summarizer bot. " +
            "Help me summarize text that I provide. " +
            "Use emojis as necessary",
        },
        { role: "user", content: text },
      ],
    }),
  });

  await streamResponse(response);
}

async function streamResponse(response) {
  const reader = response.body.getReader();
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
            console.log(content);
            output += content;
            renderPartialHTML(output);
          }
        }
      }
    }
  }
}

async function answerQuestion(text, question) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      stream: true, // Enable streaming
      messages: [
        {
          role: "system",
          content:
            "You are a question answering bot. " +
            "I'll provide you with the content first and then a question. " +
            "Answer the question with a brief answer. " +
            "If the question is not answered by the content, " +
            "you can answer, but please mention that the answer is not in the content.",
        },
        { role: "user", content: text },
        { role: "assistant", content: "What is the question?" },
        { role: "user", content: question },
      ],
    }),
  });

  await streamResponse(response);
}

function summarize() {
  document.getElementById("output").innerText = "Summarizing...";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getText" }, (response) => {
      summarizeText(response.text);
    });
  });
}

function answer() {
  document.getElementById("output").innerText = "Answering...";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getText" }, (response) => {
      const text = response.text;

      const question = document.getElementById("text").value;
      if (!question) {
        document.getElementById("output").innerText =
          "Please provide a question";
        return;
      }

      answerQuestion(text, question);
    });
  });
}

function renderPartialHTML(partialText) {
  const converter = new showdown.Converter();
  const partialHtml = converter.makeHtml(partialText);
  document.getElementById("output").innerHTML = partialHtml;
}

document.addEventListener(
  "DOMContentLoaded",
  function () {
    document.getElementById("summarize").onclick = summarize;
    document.getElementById("answer").onclick = answer;
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
