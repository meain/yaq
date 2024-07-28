chrome.commands.onCommand.addListener((command) => {
    if (command === "_execute_browser_action") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.browserAction.openPopup(tabs[0].id);
        });
    }
});
