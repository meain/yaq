// History storage and panel rendering

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  return days + "d ago";
}

function getConversationTitle(messages) {
  // Find the first user text message (skip the initial page content)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user" && typeof msg.content === "string") {
      // Skip the initial page content message (first user message)
      // The actual first user question is the second user text message
      let userTextCount = 0;
      for (let j = 0; j <= i; j++) {
        if (messages[j].role === "user" && typeof messages[j].content === "string") {
          userTextCount++;
        }
      }
      if (userTextCount >= 2) {
        return msg.content.split("\n")[0].substring(0, 80);
      }
    }
  }
  // Fallback: use the first user message
  for (const msg of messages) {
    if (msg.role === "user" && typeof msg.content === "string") {
      const firstLine = msg.content.split("\n")[0];
      return firstLine.length > 80 ? firstLine.substring(0, 80) + "..." : firstLine;
    }
  }
  return "Conversation";
}

// Archive a conversation to the history store
function archiveConversation(messages, url, callback) {
  if (!messages || messages.length < 3) {
    if (callback) callback();
    return;
  }

  chrome.storage.local.get({ interactions: [] }, function (items) {
    const interactions = items.interactions;

    interactions.push({
      url: url,
      messages: messages,
      timestamp: new Date().toISOString(),
    });

    // Cap at 7MB
    while (JSON.stringify(interactions).length > 7000000) {
      interactions.shift();
    }

    chrome.storage.local.set({ interactions }, function () {
      if (callback) callback();
    });
  });
}

function deleteInteraction(idx, callback) {
  chrome.storage.local.get({ interactions: [] }, function (items) {
    const interactions = items.interactions;
    interactions.splice(idx, 1);
    chrome.storage.local.set({ interactions }, function () {
      if (callback) callback();
    });
  });
}

function renderHistoryList(onSelect) {
  chrome.storage.local.get({ interactions: [] }, function (items) {
    const interactions = items.interactions;
    const list = document.getElementById("history-list");
    const count = document.getElementById("history-count");

    count.textContent =
      interactions.length > 0 ? `(${interactions.length})` : "";

    if (interactions.length === 0) {
      list.innerHTML = '<div class="history-empty">No history yet</div>';
      return;
    }

    list.innerHTML = "";

    // Most recent first
    for (let i = interactions.length - 1; i >= 0; i--) {
      const interaction = interactions[i];
      const item = document.createElement("div");
      item.className = "history-item";

      let hostname = "";
      try {
        hostname = new URL(interaction.url).hostname;
      } catch (e) {
        hostname = interaction.url || "";
      }

      const title = getConversationTitle(interaction.messages);
      const time = interaction.timestamp ? timeAgo(interaction.timestamp) : "";

      item.innerHTML = `
        <div class="history-item-content">
          <div class="history-item-title">${title}</div>
          <div class="history-item-meta">${hostname}</div>
        </div>
        <span class="history-item-time">${time}</span>
        <button class="history-item-delete" title="Delete">&times;</button>
      `;

      const idx = i;
      item.querySelector(".history-item-content").addEventListener(
        "click",
        () => {
          if (onSelect) onSelect(interaction);
        },
      );
      item.querySelector(".history-item-delete").addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          deleteInteraction(idx, () => renderHistoryList(onSelect));
        },
      );

      list.appendChild(item);
    }
  });
}

// Save active conversation for a tab
function saveConversation(tabId, messages, url) {
  const key = `conv_${tabId}`;
  chrome.storage.local.set({
    [key]: { messages, url, updatedAt: Date.now() },
  });
}

// Load active conversation for a tab
function loadConversation(tabId, callback) {
  const key = `conv_${tabId}`;
  chrome.storage.local.get({ [key]: null }, function (items) {
    callback(items[key]);
  });
}

// Clear active conversation for a tab
function clearConversation(tabId) {
  const key = `conv_${tabId}`;
  chrome.storage.local.remove(key);
}
