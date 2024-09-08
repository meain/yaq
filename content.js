let subtitleCache = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getContent") {
    const url = window.location.href;
    const selection = window.getSelection().toString();
    const html = document.documentElement.outerHTML;
    let text = document.body.innerText;
    let subtitles = "";
    const title = document.title;

    if (window.location.host === "www.youtube.com") {
      const videoID = new URL(url).searchParams.get("v");

      if (subtitleCache[videoID]) {
        subtitles = subtitleCache[videoID];
        sendResponse({ text, html, selection, subtitles, url, title });
      } else {
        getLanguagesList(videoID)
          .then((languages) => {
            if (languages.length > 0) {
              let subtitle = languages.find(
                (lang) =>
                  lang.language === "English" ||
                  lang.language === "English (auto-generated)"
              ) || languages[0];

              getSubtitles(subtitle)
                .then((fetchedSubtitles) => {
                  subtitleCache[videoID] = fetchedSubtitles;
                  subtitles = fetchedSubtitles;
                  sendResponse({ text, html, selection, subtitles, url, title });
                })
                .catch((error) => {
                  sendResponse({ text, html, selection, subtitles, url, title, error: "Could not fetch subtitles" });
                });
            } else {
              sendResponse({ text, html, selection, subtitles, url, title, error: "No subtitles found" });
            }
          })
          .catch((error) => {
            sendResponse({ text, html, selection, subtitles, url, title, error: "Could not fetch subtitles" });
          });

        return true; // Indicates that the response is sent asynchronously
      }
    } else {
      sendResponse({ text, html, selection, subtitles, url, title });
    }

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
