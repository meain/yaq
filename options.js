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
    prompt:
      "Give me a TL;DR (too long; didn't read) version in 1-2 sentences.",
  },
];

const serviceDefaults = {
  openai: { url: "https://api.openai.com/v1", placeholder: "sk-..." },
  anthropic: {
    url: "https://api.anthropic.com/v1",
    placeholder: "sk-ant-...",
  },
};

function showStatus(statusText) {
  const status = document.getElementById("status");
  status.textContent = statusText;
  setTimeout(() => {
    status.textContent = "";
  }, 1500);
}

function addButton(button = null) {
  const container = document.getElementById("buttons-container");
  const buttonDiv = document.createElement("div");
  buttonDiv.className = "button-config";

  const buttonData = button || { name: "", prompt: "" };

  buttonDiv.innerHTML = `
    <div class="button-row">
      <input type="text" name="button-name" placeholder="Prompt name" value="${buttonData.name}">
      <div>
        <button type="button" class="reorder-btn" title="Move up">\u2191</button>
        <button type="button" class="reorder-btn" title="Move down">\u2193</button>
        <button type="button" class="reorder-btn remove-button" title="Remove">X</button>
      </div>
    </div>
    <textarea name="button-prompt" class="button-prompt" placeholder="Enter the prompt text...">${buttonData.prompt}</textarea>
  `;

  const buttons = buttonDiv.querySelectorAll(".reorder-btn");
  buttons[0].addEventListener("click", () => moveButtonUp(buttonDiv));
  buttons[1].addEventListener("click", () => moveButtonDown(buttonDiv));
  buttonDiv
    .querySelector(".remove-button")
    .addEventListener("click", () => removeButton(buttonDiv));

  container.appendChild(buttonDiv);
}

function removeButton(el) {
  el.remove();
}

function moveButtonUp(el) {
  const prev = el.previousElementSibling;
  if (prev) el.parentNode.insertBefore(el, prev);
}

function moveButtonDown(el) {
  const next = el.nextElementSibling;
  if (next) el.parentNode.insertBefore(next, el);
}

function collectButtonsFromUI() {
  const buttons = [];
  document.querySelectorAll(".button-config").forEach((config) => {
    const name = config.querySelector('input[name="button-name"]').value.trim();
    const prompt = config
      .querySelector('textarea[name="button-prompt"]')
      .value.trim();

    if (name && prompt) {
      const id = name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      buttons.push({ id, name, prompt });
    }
  });
  return buttons;
}

function populateButtonsUI(buttons) {
  const container = document.getElementById("buttons-container");
  container.innerHTML = "";
  buttons.forEach((b) => addButton(b));
  if (buttons.length === 0) addButton();
}

function save_options() {
  const service = document.getElementById("service").value;
  const apiKey = document.getElementById("key").value;
  const openAIBaseUrl = document.getElementById("url").value;
  const buttons = collectButtonsFromUI();

  if (buttons.length === 0) {
    showStatus("At least one prompt is required");
    return;
  }

  const ids = buttons.map((b) => b.id);
  if (new Set(ids).size !== ids.length) {
    showStatus("Prompt names must be unique");
    return;
  }

  chrome.storage.local.set(
    { service, apiKey, openAIBaseUrl, buttons },
    () => showStatus("Options saved."),
  );
}

function restore_options() {
  chrome.storage.local.get(
    {
      service: "openai",
      apiKey: "",
      buttons: defaultButtons,
      openAIBaseUrl: "https://api.openai.com/v1",
    },
    (items) => {
      document.getElementById("service").value = items.service;
      document.getElementById("key").value = items.apiKey;
      document.getElementById("url").value = items.openAIBaseUrl;
      updateServiceUI(items.service);
      populateButtonsUI(items.buttons);
    },
  );
}

function updateServiceUI(service) {
  const urlField = document.getElementById("url");
  const keyField = document.getElementById("key");
  const other = service === "openai" ? "anthropic" : "openai";

  if (!urlField.value || urlField.value === serviceDefaults[other].url) {
    urlField.value = serviceDefaults[service].url;
  }
  keyField.placeholder = serviceDefaults[service].placeholder;
}

document.addEventListener("DOMContentLoaded", restore_options);
document.getElementById("save").addEventListener("click", save_options);
document
  .getElementById("add-button")
  .addEventListener("click", () => addButton());
document.getElementById("service").addEventListener("change", function () {
  updateServiceUI(this.value);
});
