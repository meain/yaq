let subtitleCache = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getContent") {
    const url = window.location.href;
    const selection = window.getSelection().toString();
    const html = document.documentElement.outerHTML;
    let text = document.body.innerText;
    let subtitles = "";
    const title = document.title;

    const videoID = new URL(url).searchParams.get("v");

    if (videoID) {
      if (subtitleCache[videoID]) {
        subtitles = subtitleCache[videoID];
        sendResponse({ text, html, selection, subtitles, url, title });
      } else {
        getLanguagesList(videoID)
          .then((languages) => {
            if (languages.length > 0) {
              let subtitle =
                languages.find(
                  (lang) =>
                    lang.language === "English" ||
                    lang.language === "English (auto-generated)",
                ) || languages[0];

              getSubtitles(subtitle)
                .then((fetchedSubtitles) => {
                  subtitleCache[videoID] = fetchedSubtitles;
                  subtitles = fetchedSubtitles;
                  sendResponse({
                    text,
                    html,
                    selection,
                    subtitles,
                    url,
                    title,
                  });
                })
                .catch((error) => {
                  sendResponse({
                    text,
                    html,
                    selection,
                    subtitles,
                    url,
                    title,
                    error: "Could not fetch subtitles",
                  });
                });
            } else {
              sendResponse({
                text,
                html,
                selection,
                subtitles,
                url,
                title,
                error: "No subtitles found",
              });
            }
          })
          .catch((error) => {
            sendResponse({
              text,
              html,
              selection,
              subtitles,
              url,
              title,
              error: "Could not fetch subtitles",
            });
          });

        return true; // Indicates that the response is sent asynchronously
      }
    } else {
      sendResponse({ text, html, selection, subtitles, url, title });
    }

    return true;
  }

  if (request.action === "executeTool") {
    const { toolName, args } = request;

    (async () => {
      try {
        let result;

        switch (toolName) {
          case "click_element":
            result = clickElement(args.selector);
            break;
          case "scroll_to_element":
            result = scrollToElement(args.selector);
            break;
          case "input_text":
            result = inputText(args.selector, args.text, args.clear);
            break;
          case "navigate_to":
            result = await navigateTo(args.url);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        sendResponse({ success: true, result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }
});

// === YouTube specific functions ===

function _extractCaptions(html) {
  const splittedHtml = html.split('"captions":');
  if (splittedHtml.length > 1) {
    const videoDetails = splittedHtml[1].split(',"videoDetails')[0];
    const jsonObj = JSON.parse(videoDetails.replace("\n", ""));
    return jsonObj["playerCaptionsTracklistRenderer"];
  }
  return null;
}

async function getLanguagesList(videoID) {
  const videoURL = `https://www.youtube.com/watch?v=${videoID}`;
  const data = await fetch(videoURL).then((res) => res.text());
  const decodedData = data.replace("\\u0026", "&").replace("\\", "");

  const captionJSON = this._extractCaptions(decodedData);

  // ensure we have access to captions data
  if (!captionJSON || (!"captionTracks") in captionJSON) {
    throw new Error(`Could not find captions for video: ${videoID}`);
  }

  return captionJSON.captionTracks.map((track) => {
    return {
      ...track,
      language: track.name.simpleText,
    };
  });
}

async function getSubtitles(subtitle) {
  if (!subtitle || !subtitle.baseUrl) {
    return "";
  }

  const response = await fetch(subtitle.baseUrl);
  const transcript = await response.text();

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(transcript, "text/xml");

  let transcriptText = "";
  for (let i = 0; i < xmlDoc.getElementsByTagName("text").length; i++) {
    transcriptText += xmlDoc.getElementsByTagName("text")[i].innerHTML + " ";
  }

  return transcriptText;
}

// === Tool functions ===

function clickElement(selector) {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Scroll element into view first
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    // Wait a bit for scroll to complete, then click
    setTimeout(() => {
      element.click();
    }, 500);

    return `Clicked element: ${selector}`;
  } catch (error) {
    throw new Error(`Failed to click element ${selector}: ${error.message}`);
  }
}

function scrollToElement(selector) {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    return `Scrolled to element: ${selector}`;
  } catch (error) {
    throw new Error(
      `Failed to scroll to element ${selector}: ${error.message}`,
    );
  }
}

function inputText(selector, text, clear = true) {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Check if element can accept text input
    const inputTypes = ["input", "textarea"];
    const editableTypes = [
      "text",
      "email",
      "password",
      "search",
      "tel",
      "url",
      "number",
    ];

    const tagName = element.tagName.toLowerCase();
    const inputType = element.type ? element.type.toLowerCase() : "";
    const isContentEditable = element.contentEditable === "true";

    if (!inputTypes.includes(tagName) && !isContentEditable) {
      throw new Error(`Element ${selector} is not a text input field`);
    }

    if (
      tagName === "input" &&
      !editableTypes.includes(inputType) &&
      inputType !== ""
    ) {
      throw new Error(
        `Input element ${selector} type "${inputType}" does not accept text`,
      );
    }

    // Scroll element into view and focus
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus();

    // Clear existing content if requested
    if (clear) {
      if (isContentEditable) {
        element.innerText = "";
      } else {
        element.value = "";
      }
    }

    // Set the text
    if (isContentEditable) {
      element.innerText = clear ? text : element.innerText + text;
    } else {
      element.value = clear ? text : element.value + text;
    }

    // Trigger input events to notify any listeners
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    const action = clear ? "Entered" : "Appended";
    return `${action} text "${text}" into element: ${selector}`;
  } catch (error) {
    throw new Error(
      `Failed to input text into element ${selector}: ${error.message}`,
    );
  }
}

async function navigateTo(url) {
  try {
    // Convert relative URLs to absolute
    const absoluteUrl = new URL(url, window.location.href).href;

    // Create a promise that resolves when navigation is complete
    const navigationPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Navigation timeout after 10 seconds"));
      }, 10000);

      // Listen for page load events
      const onLoad = () => {
        clearTimeout(timeout);
        window.removeEventListener("load", onLoad);
        resolve();
      };

      // If the page is already loaded (for same-page navigations), resolve immediately
      if (document.readyState === "complete") {
        clearTimeout(timeout);
        resolve();
        return;
      }

      window.addEventListener("load", onLoad);
    });

    // Navigate to the URL
    window.location.href = absoluteUrl;

    // Wait for navigation to complete
    await navigationPromise;

    return `Successfully navigated to: ${absoluteUrl}`;
  } catch (error) {
    throw new Error(`Failed to navigate to ${url}: ${error.message}`);
  }
}
