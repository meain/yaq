let subtitleCache = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getText") {
    if (window.location.host == "www.youtube.com") {
      const url = new URL(window.location.href);
      const videoID = url.searchParams.get("v");

      if (subtitleCache[videoID]) {
        sendResponse({
          text: subtitleCache[videoID],
          url: window.location.href,
        });
        return true;
      }

      getLanguagesList(videoID)
        .then((languages) => {
          if (languages.length > 0) {
            // Get English or English generated
            let subtitle = languages.find(
              (lang) =>
                lang.language === "English" ||
                lang.language === "English (auto-generated)",
            );

            if (!subtitle) {
              // If no English, get the first one
              subtitle = languages[0];
            }

            getSubtitles(subtitle)
              .then((subtitles) => {
                subtitleCache[videoID] = subtitles;
                sendResponse({ text: subtitles, url: window.location.href });
              })
              .catch((error) => {
                sendResponse({
                  text: "",
                  url: window.location.href,
                  error: "Oops! Could not fetch subtitles",
                });
              });
          } else {
            sendResponse({
              text: "",
              url: window.location.href,
              error: "Oops! No subtitles found",
            });
          }
        })
        .catch((error) => {
          sendResponse({
            text: "",
            url: window.location.href,
            error: "Oops! Could not fetch subtitles",
          });
        });

      return true;
    } else {
      let text = document.body.innerText;
      sendResponse({ text: text, url: window.location.href });
      return true;
    }
  } else if (request.action === "getSelection") {
    sendResponse({
      text: window.getSelection().toString(),
      url: window.location.href,
    });
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
