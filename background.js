// Background script: tab lifecycle management

// Archive conversation when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const key = `conv_${tabId}`;
  chrome.storage.local.get({ [key]: null }, (items) => {
    const data = items[key];
    if (data && data.messages && data.messages.length >= 3) {
      // Archive to history
      chrome.storage.local.get({ interactions: [] }, (histItems) => {
        const interactions = histItems.interactions;
        interactions.push({
          url: data.url,
          messages: data.messages,
          timestamp: new Date().toISOString(),
        });

        // Cap at 7MB
        while (JSON.stringify(interactions).length > 7000000) {
          interactions.shift();
        }

        chrome.storage.local.set({ interactions });
      });
    }

    // Clean up active conversation
    chrome.storage.local.remove(key);
  });
});

// Clean up stale conversations on startup (tabs that were closed while browser was off)
chrome.runtime.onStartup?.addListener(() => {
  chrome.storage.local.get(null, (all) => {
    const convKeys = Object.keys(all).filter((k) => k.startsWith("conv_"));
    if (convKeys.length === 0) return;

    chrome.tabs.query({}, (tabs) => {
      const activeTabIds = new Set(tabs.map((t) => t.id.toString()));
      const staleKeys = convKeys.filter(
        (k) => !activeTabIds.has(k.replace("conv_", "")),
      );

      if (staleKeys.length > 0) {
        chrome.storage.local.remove(staleKeys);
      }
    });
  });
});
