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

  // Run in page context to access ytInitialData and monkey-patch fetch
  const text = await getYoutubeTranscriptFromPage();
  if (text) {
    subtitleCache[videoID] = text;
  }
  return text;
}

function getYoutubeTranscriptFromPage() {
  return new Promise((resolve) => {
    const id = "yaq-yt-transcript-" + Date.now();

    function handler(event) {
      if (event.data && event.data.type === id) {
        window.removeEventListener("message", handler);
        resolve(event.data.result);
      }
    }
    window.addEventListener("message", handler);

    const script = document.createElement("script");
    script.textContent = `
      (async function() {
        var msgId = "${id}";
        function findAll(obj, key, res) {
          res = res || [];
          if (!obj || typeof obj !== 'object') return res;
          if (obj[key]) res.push(obj[key]);
          for (var k in obj) { if (obj.hasOwnProperty(k)) findAll(obj[k], key, res); }
          return res;
        }
        function segsToText(segs) {
          return segs.map(function(s) { return (s.snippet && s.snippet.runs && s.snippet.runs[0] && s.snippet.runs[0].text) || ''; }).join(' ').trim();
        }

        try {
          // Path 1: check ytInitialData (instant, zero network calls)
          var panels = window.ytInitialData && window.ytInitialData.engagementPanels;
          if (panels) {
            var tp = panels.find(function(p) { return JSON.stringify(p).includes('transcriptSegmentRenderer'); });
            if (tp) {
              var segs = findAll(tp, 'transcriptSegmentRenderer');
              if (segs.length > 0) {
                window.postMessage({ type: msgId, result: segsToText(segs) }, "*");
                return;
              }
            }
          }

          // Path 2: intercept YouTube's own get_transcript fetch
          var btn = Array.from(document.querySelectorAll('ytd-button-renderer'))
            .find(function(b) { return b.textContent && b.textContent.toLowerCase().includes('transcript'); });
          var btnEl = btn && btn.querySelector('button');
          if (!btnEl) {
            window.postMessage({ type: msgId, result: "Error: No transcript available for this video" }, "*");
            return;
          }

          var done = false;
          var origFetch = window.fetch;
          window.fetch = function(input, init) {
            var result = origFetch.apply(this, arguments);
            var url = (typeof input === 'string' ? input : (input && input.url)) || '';
            if (url.includes('get_transcript')) {
              result.then(function(r) { return r.clone().json(); }).then(function(data) {
                if (done) return;
                var segs = findAll(data, 'transcriptSegmentRenderer');
                if (segs.length > 0) {
                  done = true;
                  window.fetch = origFetch;
                  var closeBtn = document.querySelector('button[aria-label="Close transcript"]');
                  if (closeBtn) closeBtn.click();
                  window.postMessage({ type: msgId, result: segsToText(segs) }, "*");
                }
              }).catch(function() {});
            }
            return result;
          };

          btnEl.click();

          // Timeout after 8s
          setTimeout(function() {
            if (!done) {
              done = true;
              window.fetch = origFetch;
              window.postMessage({ type: msgId, result: "Error: Timed out waiting for transcript" }, "*");
            }
          }, 8000);
        } catch(e) {
          window.postMessage({ type: msgId, result: "Error: " + e.message }, "*");
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();

    // Safety timeout from content script side
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve("Error: Transcript fetch timed out");
    }, 12000);
  });
}
