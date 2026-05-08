// API communication and streaming parsers

const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day

function fetchModelsForService(service, baseUrl, apiKey) {
  if (service === "anthropic") {
    return fetch(`${baseUrl}/models`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    })
      .then((r) => r.json())
      .then((data) => (data.data || []).map((m) => m.id))
      .catch(() => []);
  }
  return fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
    .then((r) => r.json())
    .then((data) => (data.data || []).map((m) => m.id))
    .catch(() => []);
}

// Parse OpenAI SSE stream
async function streamResponse(response, onChunk) {
  if (prevReader) {
    prevReader.cancel();
  }

  const reader = response.body.getReader();
  prevReader = reader;

  const decoder = new TextDecoder("utf-8");
  let done = false;
  let result = "";
  let output = "";
  let remaining = false;
  let toolCalls = [];

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (remaining) {
      result += decoder.decode(value, { stream: !done });
    } else {
      result = decoder.decode(value, { stream: !done });
    }

    remaining = false;

    if (value) {
      const lines = result.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          if (line.substring(6) === "[DONE]") break;
          try {
            const data = JSON.parse(line.substring(6));

            if (data.choices && data.choices.length > 0) {
              const delta = data.choices[0].delta;

              if (delta.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  if (toolCall.index !== undefined) {
                    if (!toolCalls[toolCall.index]) {
                      toolCalls[toolCall.index] = {
                        id: toolCall.id || "",
                        type: toolCall.type || "function",
                        function: {
                          name: toolCall.function?.name || "",
                          arguments: toolCall.function?.arguments || "",
                        },
                      };
                    } else {
                      if (toolCall.function?.name) {
                        toolCalls[toolCall.index].function.name +=
                          toolCall.function.name;
                      }
                      if (toolCall.function?.arguments) {
                        toolCalls[toolCall.index].function.arguments +=
                          toolCall.function.arguments;
                      }
                    }
                  }
                }
              }

              const content = delta.content || "";
              output += content;
              if (output.trim() && onChunk) {
                onChunk(output);
              }
            }
          } catch (error) {
            remaining = true;
            result = line;
          }
        }
      }
    }
  }

  return {
    response: output,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    content: output,
  };
}

// Parse Anthropic SSE stream
async function streamAnthropicResponse(response, onChunk) {
  if (prevReader) {
    prevReader.cancel();
  }

  const reader = response.body.getReader();
  prevReader = reader;

  const decoder = new TextDecoder("utf-8");
  let done = false;
  let buffer = "";
  let output = "";
  let toolCalls = [];
  let currentToolIndex = -1;

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.substring(6));

          if (data.type === "content_block_start") {
            if (data.content_block.type === "tool_use") {
              currentToolIndex++;
              toolCalls[currentToolIndex] = {
                id: data.content_block.id,
                type: "function",
                function: {
                  name: data.content_block.name,
                  arguments: "",
                },
              };
            }
          } else if (data.type === "content_block_delta") {
            if (data.delta.type === "text_delta") {
              output += data.delta.text;
              if (output.trim() && onChunk) {
                onChunk(output);
              }
            } else if (data.delta.type === "input_json_delta") {
              if (currentToolIndex >= 0) {
                toolCalls[currentToolIndex].function.arguments +=
                  data.delta.partial_json;
              }
            }
          }
        } catch (e) {
          // Incomplete JSON line, skip
        }
      }
    }
  }

  return {
    response: output,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
    content: output,
  };
}

// Send request to OpenAI-compatible API
async function fetchFromOpenAI(baseUrl, model, apiKey, messages, tools) {
  const requestBody = {
    model: model,
    stream: true,
    messages: messages,
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = "auto";
  }

  const response = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorMsg = `API error: ${response.status}`;
    try {
      const body = await response.json();
      errorMsg = body.error?.message || JSON.stringify(body);
    } catch (e) {
      // Could not parse error body
    }
    throw new Error(errorMsg);
  }

  return response;
}

// Send request to Anthropic API
async function fetchFromAnthropic(
  baseUrl,
  model,
  apiKey,
  messages,
  systemPrompt,
  tools,
) {
  const requestBody = {
    model: model,
    max_tokens: 8192,
    stream: true,
    messages: messages,
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = { type: "auto" };
  }

  const response = await fetch(baseUrl + "/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorMsg = `API error: ${response.status}`;
    try {
      const body = await response.json();
      errorMsg = body.error?.message || JSON.stringify(body);
    } catch (e) {
      // Could not parse error body
    }
    throw new Error(errorMsg);
  }

  return response;
}
