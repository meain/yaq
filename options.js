const defaultButtons = [
  {
    id: "tldr",
    name: "TL;DR",
    prompt: "Give me a TL;DR (too long; didn't read) version in 1-2 sentences.",
  },
  {
    id: "answerit",
    name: "Answer It",
    prompt: "What is the answer to the question in the title?",
  },
  {
    id: "unclickbait",
    name: "Unclickbait",
    prompt: "What is the non-clickbait headline for this text?",
  },
  {
    id: "context",
    name: "Context",
    prompt:
      "What background knowledge or context is helpful to better understand this content?",
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
  var status = document.getElementById("status");
  status.textContent = statusText;
  setTimeout(function () {
    status.textContent = "";
  }, 1000);
}

function addButton(button = null) {
  const container = document.getElementById("buttons-container");
  const buttonDiv = document.createElement("div");
  buttonDiv.className = "button-config";

  const buttonData = button || { name: "", prompt: "" };

  buttonDiv.innerHTML = `
        <div class="button-row">
            <input type="text" name="button-name" placeholder="Button name" value="${buttonData.name}">
            <div>
            <button type="button" class="reorder-btn add-button move-up" title="Move up">↑</button>
            <button type="button" class="reorder-btn add-button move-down" title="Move down">↓</button>
            <button type="button" class="reorder-btn add-button move-down remove-button" title="Remove">X</button>
            </div>
        </div>
        <textarea name="button-prompt" class="button-prompt" placeholder="Enter the prompt for this button...">${buttonData.prompt}</textarea>
    `;

  // Add event listeners
  const moveUpBtn = buttonDiv.querySelector(".move-up");
  const moveDownBtn = buttonDiv.querySelector(".move-down");
  const removeBtn = buttonDiv.querySelector(".remove-button");

  moveUpBtn.addEventListener("click", () => moveButtonUp(buttonDiv));
  moveDownBtn.addEventListener("click", () => moveButtonDown(buttonDiv));
  removeBtn.addEventListener("click", () => removeButton(buttonDiv));

  container.appendChild(buttonDiv);
}

function removeButton(buttonConfig) {
  buttonConfig.remove();
}

function moveButtonUp(buttonConfig) {
  const prevButton = buttonConfig.previousElementSibling;
  if (prevButton) {
    buttonConfig.parentNode.insertBefore(buttonConfig, prevButton);
  }
}

function moveButtonDown(buttonConfig) {
  const nextButton = buttonConfig.nextElementSibling;
  if (nextButton) {
    buttonConfig.parentNode.insertBefore(nextButton, buttonConfig);
  }
}

function collectButtonsFromUI() {
  const buttons = [];
  const buttonConfigs = document.querySelectorAll(".button-config");

  buttonConfigs.forEach((config) => {
    const name = config.querySelector('input[name="button-name"]').value.trim();
    const prompt = config
      .querySelector('textarea[name="button-prompt"]')
      .value.trim();

    if (name && prompt) {
      // Generate ID from name (lowercase, replace spaces with hyphens)
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

  buttons.forEach((button) => {
    addButton(button);
  });

  if (buttons.length === 0) {
    addButton();
  }
}

// Saves options to chrome.storage
function save_options() {
  var service = document.getElementById("service").value;
  var apiKey = document.getElementById("key").value;
  var openAIBaseUrl = document.getElementById("url").value;
  var buttons = collectButtonsFromUI();

  // Validate that all buttons have required fields
  if (buttons.length === 0) {
    showStatus("At least one button is required");
    return;
  }

  // Check for duplicate button IDs
  const buttonIds = buttons.map((b) => b.id);
  const uniqueIds = new Set(buttonIds);
  if (buttonIds.length !== uniqueIds.size) {
    showStatus("Button names must be unique (they generate IDs)");
    return;
  }

  chrome.storage.local.set(
    {
      service: service,
      apiKey: apiKey,
      openAIBaseUrl: openAIBaseUrl,
      buttons: buttons,
    },
    function () {
      showStatus("Options saved.");
    },
  );
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  chrome.storage.local.get(
    {
      service: "openai",
      apiKey: "",
      buttons: defaultButtons,
      openAIBaseUrl: "https://api.openai.com/v1",
    },
    function (items) {
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
  const otherService = service === "openai" ? "anthropic" : "openai";

  if (!urlField.value || urlField.value === serviceDefaults[otherService].url) {
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
