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
      messages: [
        {
          role: "system",
          content:
            "You are a summarizer bot. " +
            "Help me summarize text that I provide. " +
            "Use emojies as necessary",
        },
        { role: "user", content: text },
      ],
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
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
      messages: [
        {
          role: "system",
          content:
            "You are a question answering bot. " +
            "I'll provide you with the content first and then a question. " +
            "Answer the question with a brief answer.",
        },
        { role: "user", content: text },
        { role: "assistant", content: "What is the question?" },
        { role: "user", content: question },
      ],
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

function summarize() {
  document.getElementById("output").innerText = "Summarizing...";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getText" }, (response) => {
      summarizeText(response.text).then(renderHTML);
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

      answerQuestion(text, question).then(renderHTML);
    });
  });
}

function renderHTML(text) {
  const converter = new showdown.Converter();
  const html = converter.makeHtml(text);
  document.getElementById("output").innerHTML = html;
  document.getElementById("text").focus();
  document.getElementById("text").select();
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
