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
    {
        id: "answer",
        name: "Answer",
        prompt: "What is the answer to the question in the title?",
    },
];

const serviceModels = {
    openai: function () {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(
                {
                    openAIBaseUrl: "https://api.openai.com/v1",
                    apiKey: "",
                },
                async function (items) {
                    const req = await fetch(`${items.openAIBaseUrl}/models`, {
                        headers: {
                            Authorization: `Bearer ${items.apiKey}`,
                        },
                    });
                    const data = await req.json();
                    resolve(data.data.map((model) => model.id));
                },
            );
        });
    },
};

function showStatus(statusText) {
    var status = document.getElementById("status");
    status.textContent = statusText;
    setTimeout(function () {
        status.textContent = "";
    }, 1000);
}

async function populateModels(service) {
    const modelSelect = document.getElementById("model");
    modelSelect.innerHTML = "";
    const models = await serviceModels[service]();
    let modelStrings = "Available models: " + models.join(", ");
    document
        .getElementById("model-label")
        .setAttribute("data-hover-info", modelStrings);
}

// Saves options to chrome.storage
function save_options() {
    var service = document.getElementById("service").value;
    var model = document.getElementById("model").value;
    var apiKey = document.getElementById("key").value;
    var openAIBaseUrl = document.getElementById("url").value;
    var buttonsConfig = document.getElementById("buttons-config").value;

    // Check if buttons-config is valid JSON
    try {
        JSON.parse(buttonsConfig);
    } catch (e) {
        showStatus("Invalid JSON in buttons-config");
        return;
    }

    chrome.storage.local.set(
        {
            service: service,
            model: model,
            apiKey: apiKey,
            openAIBaseUrl: openAIBaseUrl,
            buttons: JSON.parse(buttonsConfig),
        },
        async function () {
            showStatus("Options saved.");
            await populateModels(service);
        },
    );
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    chrome.storage.local.get(
        {
            service: "openai",
            model: "gpt-4o-mini",
            apiKey: "",
            buttons: defaultButtons,
            openAIBaseUrl: "https://api.openai.com/v1",
        },
        async function (items) {
            document.getElementById("service").value = items.service;
            document.getElementById("model").value = items.model;
            document.getElementById("model").value = items.model;
            document.getElementById("key").value = items.apiKey;
            document.getElementById("url").value = items.openAIBaseUrl;
            document.getElementById("buttons-config").value = JSON.stringify(
                items.buttons,
                null,
                2,
            );
            await populateModels(items.service);
        },
    );
}

document.addEventListener("DOMContentLoaded", restore_options);
document.getElementById("save").addEventListener("click", save_options);
