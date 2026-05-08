// Content script: page content extraction and tool execution

let subtitleCache = {};
let cssCounter = 0;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getContent") {
    const url = window.location.href;
    const selection = window.getSelection().toString();
    const text = document.body.innerText;
    const title = document.title;
    sendResponse({ text, selection, url, title });
    return true;
  }

  if (request.action === "executeTool") {
    const { toolName, args } = request;

    (async () => {
      try {
        let result;

        switch (toolName) {
          case "get_page_outline":
            result = getPageOutline(args.selector, args.depth);
            break;
          case "read_html":
            result = readHtml(args.selector);
            break;
          case "exec_javascript":
            result = await execJavascript(args.code);
            break;
          case "add_css":
            result = addCss(args.css);
            break;
          case "remove_css":
            result = removeCss(args.id);
            break;
          case "get_youtube_subtitles":
            result = await getYoutubeSubtitles();
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

// === Tool implementations ===

function getPageOutline(selector, depth) {
  selector = selector || "body";
  depth = depth || 5;

  const root = document.querySelector(selector);
  if (!root) {
    throw new Error(`Element not found: ${selector}`);
  }

  const lines = [];
  const MAX_SIZE = 50000;
  let size = 0;
  let truncated = false;

  function walk(el, currentDepth, indent) {
    if (truncated || currentDepth > depth) return;

    let line = indent + el.tagName.toLowerCase();
    if (el.id) line += `#${el.id}`;
    if (el.className && typeof el.className === "string") {
      const classes = el.className.trim();
      if (classes) line += "." + classes.split(/\s+/).join(".");
    }

    const childCount = el.children.length;
    if (childCount > 0 && currentDepth === depth) {
      line += ` (${childCount} children)`;
    }

    lines.push(line);
    size += line.length + 1;

    if (size > MAX_SIZE) {
      truncated = true;
      return;
    }

    for (const child of el.children) {
      walk(child, currentDepth + 1, indent + "  ");
    }
  }

  walk(root, 0, "");

  let result = lines.join("\n");
  if (truncated) {
    result += "\n... (truncated)";
  }
  return result;
}

function readHtml(selector) {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`Element not found: ${selector}`);
  }

  const html = el.outerHTML;
  const MAX_SIZE = 100000;
  if (html.length > MAX_SIZE) {
    return html.substring(0, MAX_SIZE) + "\n... (truncated)";
  }
  return html;
}

function execJavascript(code) {
  return new Promise((resolve) => {
    const id = "yaq-exec-" + Date.now() + "-" + Math.random().toString(36).slice(2);

    function handler(event) {
      if (event.data && event.data.type === id) {
        window.removeEventListener("message", handler);
        resolve(event.data.result);
      }
    }
    window.addEventListener("message", handler);

    // Escape code for embedding in template
    const escapedCode = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const script = document.createElement("script");
    script.textContent = `
      (function() {
        try {
          var __yaq_code = \`${escapedCode}\`;
          var __yaq_result;
          try {
            __yaq_result = eval(__yaq_code);
          } catch(e) {
            __yaq_result = (new Function(__yaq_code))();
          }
          var __yaq_str = typeof __yaq_result === 'undefined' ? 'undefined'
            : typeof __yaq_result === 'object' ? JSON.stringify(__yaq_result, null, 2)
            : String(__yaq_result);
          window.postMessage({ type: "${id}", result: __yaq_str }, "*");
        } catch(e) {
          window.postMessage({ type: "${id}", result: "Error: " + e.message }, "*");
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();

    // Timeout after 10s
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve("Error: Execution timed out after 10 seconds");
    }, 10000);
  });
}

function addCss(css) {
  cssCounter++;
  const id = `yaq-css-${cssCounter}`;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);

  return JSON.stringify({ id });
}

function removeCss(id) {
  const style = document.getElementById(id);
  if (!style) {
    throw new Error(`CSS stylesheet not found: ${id}`);
  }
  style.remove();
  return `Removed stylesheet: ${id}`;
}

// === YouTube subtitle functions ===

async function getYoutubeSubtitles() {
  const videoID = new URL(window.location.href).searchParams.get("v");
  if (!videoID) {
    throw new Error("Not a YouTube video page");
  }

  if (subtitleCache[videoID]) {
    return subtitleCache[videoID];
  }

  const languages = await getLanguagesList(videoID);
  if (languages.length === 0) {
    throw new Error("No subtitles available for this video");
  }

  const subtitle =
    languages.find(
      (lang) =>
        lang.language === "English" ||
        lang.language === "English (auto-generated)",
    ) || languages[0];

  const text = await getSubtitles(subtitle);
  subtitleCache[videoID] = text;
  return text;
}

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

  const captionJSON = _extractCaptions(decodedData);

  if (!captionJSON || !("captionTracks" in captionJSON)) {
    throw new Error(`Could not find captions for video: ${videoID}`);
  }

  return captionJSON.captionTracks.map((track) => ({
    ...track,
    language: track.name.simpleText,
  }));
}

async function getSubtitles(subtitle) {
  if (!subtitle || !subtitle.baseUrl) {
    return "";
  }

  const response = await fetch(subtitle.baseUrl);
  const transcript = await response.text();

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(transcript, "text/xml");

  const textElements = xmlDoc.getElementsByTagName("text");
  let transcriptText = "";
  for (let i = 0; i < textElements.length; i++) {
    transcriptText += textElements[i].innerHTML + " ";
  }

  return transcriptText.trim();
}
