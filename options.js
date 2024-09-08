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

function showStatus(statusText) {
    var status = document.getElementById("status");
    status.textContent = statusText;
    setTimeout(function () {
        status.textContent = "";
    }, 1000);
}

// Saves options to chrome.storage
function save_options() {
    var model = document.getElementById("model").value;
    var apiKey = document.getElementById("key").value;
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
            model: model,
            apiKey: apiKey,
            buttons: JSON.parse(buttonsConfig),
        },
        function () {
            showStatus("Options saved.");
        },
    );
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    // Use default value color = 'red' and likesColor = true.
    chrome.storage.local.get(
        {
            model: "gpt-4o-mini",
            apiKey: "",
            buttons: defaultButtons,
        },
        function (items) {
            document.getElementById("model").value = items.model;
            document.getElementById("key").value = items.apiKey;
            document.getElementById("buttons-config").value = JSON.stringify(
                items.buttons,
                null,
                2,
            );
        },
    );
}
document.addEventListener("DOMContentLoaded", restore_options);
document.getElementById("save").addEventListener("click", save_options);
