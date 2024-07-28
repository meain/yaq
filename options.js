// Saves options to chrome.storage
function save_options() {
    var model = document.getElementById("model").value;
    var apiKey = document.getElementById("key").value;
    chrome.storage.local.set(
        {
            model: model,
            apiKey: apiKey,
        },
        function () {
            // Update status to let user know options were saved.
            var status = document.getElementById("status");
            status.textContent = "Options saved.";
            setTimeout(function () {
                status.textContent = "";
            }, 750);
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
        },
        function (items) {
            document.getElementById("model").value = items.model;
            document.getElementById("key").value = items.apiKey;
        },
    );
}
document.addEventListener("DOMContentLoaded", restore_options);
document.getElementById("save").addEventListener("click", save_options);
