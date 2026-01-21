import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, SensitiveDataFilter, DefaultExporter, CloudExporter } from '@mastra/observability';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createTool } from '@mastra/core/tools';
import { createCompletenessScorer, createToolCallAccuracyScorerCode } from '@mastra/evals/scorers/prebuilt';
import { getUserMessageFromRunInput, getAssistantMessageFromRunOutput } from '@mastra/evals/scorers/utils';
import { createScorer } from '@mastra/core/evals';
import { readdir, readFile, mkdir, writeFile, stat } from 'fs/promises';
import { join, relative, basename } from 'path';
import { randomUUID } from 'crypto';
import matter from 'gray-matter';
import { MCPServer } from '@mastra/mcp';
import { createClient } from '@libsql/client';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';


// -- Shims --
import cjsUrl from 'node:url';
import cjsPath from 'node:path';
import cjsModule from 'node:module';
const __filename = cjsUrl.fileURLToPath(import.meta.url);
const __dirname = cjsPath.dirname(__filename);
const require = cjsModule.createRequire(import.meta.url);
const forecastSchema = z.object({
  date: z.string(),
  maxTemp: z.number(),
  minTemp: z.number(),
  precipitationChance: z.number(),
  condition: z.string(),
  location: z.string()
});
function getWeatherCondition$1(code) {
  const conditions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    95: "Thunderstorm"
  };
  return conditions[code] || "Unknown";
}
const fetchWeather = createStep({
  id: "fetch-weather",
  description: "Fetches weather forecast for a given city",
  inputSchema: z.object({
    city: z.string().describe("The city to get the weather for")
  }),
  outputSchema: forecastSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }
    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputData.city)}&count=1`;
    const geocodingResponse = await fetch(geocodingUrl);
    const geocodingData = await geocodingResponse.json();
    if (!geocodingData.results?.[0]) {
      throw new Error(`Location '${inputData.city}' not found`);
    }
    const { latitude, longitude, name } = geocodingData.results[0];
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,weathercode&timezone=auto,&hourly=precipitation_probability,temperature_2m`;
    const response = await fetch(weatherUrl);
    const data = await response.json();
    const forecast = {
      date: (/* @__PURE__ */ new Date()).toISOString(),
      maxTemp: Math.max(...data.hourly.temperature_2m),
      minTemp: Math.min(...data.hourly.temperature_2m),
      condition: getWeatherCondition$1(data.current.weathercode),
      precipitationChance: data.hourly.precipitation_probability.reduce(
        (acc, curr) => Math.max(acc, curr),
        0
      ),
      location: name
    };
    return forecast;
  }
});
const planActivities = createStep({
  id: "plan-activities",
  description: "Suggests activities based on weather conditions",
  inputSchema: forecastSchema,
  outputSchema: z.object({
    activities: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const forecast = inputData;
    if (!forecast) {
      throw new Error("Forecast data not found");
    }
    const agent = mastra?.getAgent("weatherAgent");
    if (!agent) {
      throw new Error("Weather agent not found");
    }
    const prompt = `Based on the following weather forecast for ${forecast.location}, suggest appropriate activities:
      ${JSON.stringify(forecast, null, 2)}
      For each day in the forecast, structure your response exactly as follows:

      \u{1F4C5} [Day, Month Date, Year]
      \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

      \u{1F321}\uFE0F WEATHER SUMMARY
      \u2022 Conditions: [brief description]
      \u2022 Temperature: [X\xB0C/Y\xB0F to A\xB0C/B\xB0F]
      \u2022 Precipitation: [X% chance]

      \u{1F305} MORNING ACTIVITIES
      Outdoor:
      \u2022 [Activity Name] - [Brief description including specific location/route]
        Best timing: [specific time range]
        Note: [relevant weather consideration]

      \u{1F31E} AFTERNOON ACTIVITIES
      Outdoor:
      \u2022 [Activity Name] - [Brief description including specific location/route]
        Best timing: [specific time range]
        Note: [relevant weather consideration]

      \u{1F3E0} INDOOR ALTERNATIVES
      \u2022 [Activity Name] - [Brief description including specific venue]
        Ideal for: [weather condition that would trigger this alternative]

      \u26A0\uFE0F SPECIAL CONSIDERATIONS
      \u2022 [Any relevant weather warnings, UV index, wind conditions, etc.]

      Guidelines:
      - Suggest 2-3 time-specific outdoor activities per day
      - Include 1-2 indoor backup options
      - For precipitation >50%, lead with indoor activities
      - All activities must be specific to the location
      - Include specific venues, trails, or locations
      - Consider activity intensity based on temperature
      - Keep descriptions concise but informative

      Maintain this exact formatting for consistency, using the emoji and section headers as shown.`;
    const response = await agent.stream([
      {
        role: "user",
        content: prompt
      }
    ]);
    let activitiesText = "";
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      activitiesText += chunk;
    }
    return {
      activities: activitiesText
    };
  }
});
const weatherWorkflow = createWorkflow({
  id: "weather-workflow",
  inputSchema: z.object({
    city: z.string().describe("The city to get the weather for")
  }),
  outputSchema: z.object({
    activities: z.string()
  })
}).then(fetchWeather).then(planActivities);
weatherWorkflow.commit();

const weatherTool = createTool({
  id: "get-weather",
  description: "Get current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("City name")
  }),
  outputSchema: z.object({
    temperature: z.number(),
    feelsLike: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windGust: z.number(),
    conditions: z.string(),
    location: z.string()
  }),
  execute: async (inputData) => {
    return await getWeather(inputData.location);
  }
});
const getWeather = async (location) => {
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
  const geocodingResponse = await fetch(geocodingUrl);
  const geocodingData = await geocodingResponse.json();
  if (!geocodingData.results?.[0]) {
    throw new Error(`Location '${location}' not found`);
  }
  const { latitude, longitude, name } = geocodingData.results[0];
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;
  const response = await fetch(weatherUrl);
  const data = await response.json();
  return {
    temperature: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    windGust: data.current.wind_gusts_10m,
    conditions: getWeatherCondition(data.current.weather_code),
    location: name
  };
};
function getWeatherCondition(code) {
  const conditions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail"
  };
  return conditions[code] || "Unknown";
}

const toolCallAppropriatenessScorer = createToolCallAccuracyScorerCode({
  expectedTool: "weatherTool",
  strictMode: false
});
const completenessScorer = createCompletenessScorer();
const translationScorer = createScorer({
  id: "translation-quality-scorer",
  name: "Translation Quality",
  description: "Checks that non-English location names are translated and used correctly",
  type: "agent",
  judge: {
    model: "anthropic/claude-sonnet-4-5",
    instructions: "You are an expert evaluator of translation quality for geographic locations. Determine whether the user text mentions a non-English location and whether the assistant correctly uses an English translation of that location. Be lenient with transliteration differences and diacritics. Return only the structured JSON matching the provided schema."
  }
}).preprocess(({ run }) => {
  const userText = getUserMessageFromRunInput(run.input) || "";
  const assistantText = getAssistantMessageFromRunOutput(run.output) || "";
  return { userText, assistantText };
}).analyze({
  description: "Extract location names and detect language/translation adequacy",
  outputSchema: z.object({
    nonEnglish: z.boolean(),
    translated: z.boolean(),
    confidence: z.number().min(0).max(1).default(1),
    explanation: z.string().default("")
  }),
  createPrompt: ({ results }) => `
            You are evaluating if a weather assistant correctly handled translation of a non-English location.
            User text:
            """
            ${results.preprocessStepResult.userText}
            """
            Assistant response:
            """
            ${results.preprocessStepResult.assistantText}
            """
            Tasks:
            1) Identify if the user mentioned a location that appears non-English.
            2) If non-English, check whether the assistant used a correct English translation of that location in its response.
            3) Be lenient with transliteration differences (e.g., accents/diacritics).
            Return JSON with fields:
            {
            "nonEnglish": boolean,
            "translated": boolean,
            "confidence": number, // 0-1
            "explanation": string
            }
        `
}).generateScore(({ results }) => {
  const r = results?.analyzeStepResult || {};
  if (!r.nonEnglish) return 1;
  if (r.translated)
    return Math.max(0, Math.min(1, 0.7 + 0.3 * (r.confidence ?? 1)));
  return 0;
}).generateReason(({ results, score }) => {
  const r = results?.analyzeStepResult || {};
  return `Translation scoring: nonEnglish=${r.nonEnglish ?? false}, translated=${r.translated ?? false}, confidence=${r.confidence ?? 0}. Score=${score}. ${r.explanation ?? ""}`;
});
const scorers = {
  toolCallAppropriatenessScorer,
  completenessScorer,
  translationScorer
};

const weatherAgent = new Agent({
  id: "weather-agent",
  name: "Weather Agent",
  instructions: `
      You are a helpful weather assistant that provides accurate weather information and can help planning activities based on the weather.

      Your primary function is to help users get weather details for specific locations. When responding:
      - Always ask for a location if none is provided
      - If the location name isn't in English, please translate it
      - If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
      - Include relevant details like humidity, wind conditions, and precipitation
      - Keep responses concise but informative
      - If the user asks for activities and provides the weather forecast, suggest activities based on the weather forecast.
      - If the user asks for activities, respond in the format they request.

      Use the weatherTool to fetch current weather data.
`,
  model: "anthropic/claude-sonnet-4-5",
  tools: { weatherTool },
  scorers: {
    toolCallAppropriateness: {
      scorer: scorers.toolCallAppropriatenessScorer,
      sampling: {
        type: "ratio",
        rate: 1
      }
    },
    completeness: {
      scorer: scorers.completenessScorer,
      sampling: {
        type: "ratio",
        rate: 1
      }
    },
    translation: {
      scorer: scorers.translationScorer,
      sampling: {
        type: "ratio",
        rate: 1
      }
    }
  },
  memory: new Memory()
});

function getMessagesRoot() {
  if (process.env.MESSAGES_ROOT) {
    return process.env.MESSAGES_ROOT;
  }
  const workspaceRoot = process.env.WORKSPACE_ROOT ?? "/workspaces/agent-ps";
  return join(workspaceRoot, ".agents/messages");
}
const defaultFolderConfig = {
  rootPath: getMessagesRoot(),
  endpoints: [
    {
      id: "inbox",
      path: "inbox",
      pattern: "**/*.md",
      direction: "inbox",
      requiredFrontmatter: [],
      watchMode: "poll",
      // Use polling for cross-platform compatibility
      pollIntervalMs: 1e3
      // 1 second for responsive detection
    },
    {
      id: "outbox",
      path: "outbox",
      pattern: "**/*.md",
      direction: "outbox",
      requiredFrontmatter: [],
      watchMode: "poll",
      pollIntervalMs: 1e3
    },
    {
      id: "bugs",
      path: "bugs",
      pattern: "**/*.md",
      direction: "inbox",
      requiredFrontmatter: [
        { name: "severity", type: "string", required: true, description: "Bug severity: low, medium, high, critical" }
      ],
      watchMode: "poll",
      pollIntervalMs: 1e3
    },
    {
      id: "feature-requests",
      path: "feature-requests",
      pattern: "**/*.md",
      direction: "inbox",
      requiredFrontmatter: [],
      watchMode: "poll",
      pollIntervalMs: 1e3
    }
  ],
  defaultFrontmatter: [
    { name: "id", type: "string", required: true },
    { name: "timestamp", type: "date", required: true },
    { name: "from", type: "string", required: false },
    { name: "replyTo", type: "string", required: false }
  ]
};
function getEndpoint(endpointId, config = defaultFolderConfig) {
  return config.endpoints.find((e) => e.id === endpointId);
}
function getEndpointPath(endpointId, config = defaultFolderConfig) {
  const endpoint = getEndpoint(endpointId, config);
  if (!endpoint) {
    throw new Error(`Endpoint not found: ${endpointId}`);
  }
  return join(config.rootPath, endpoint.path);
}
function listEndpoints(config = defaultFolderConfig) {
  return config.endpoints;
}
function getInboxEndpoints(config = defaultFolderConfig) {
  return config.endpoints.filter((e) => e.direction === "inbox" || e.direction === "bidirectional");
}
function getDefaultOutboxEndpoint(config = defaultFolderConfig) {
  return config.endpoints.find((e) => e.direction === "outbox");
}

const listEndpointsTool = createTool({
  id: "list-endpoints",
  description: "List all available message endpoints (folders) configured in the system",
  inputSchema: z.object({}),
  outputSchema: z.object({
    endpoints: z.array(z.object({
      id: z.string(),
      path: z.string(),
      direction: z.enum(["inbox", "outbox", "bidirectional"])
    }))
  }),
  execute: async () => {
    const endpoints = listEndpoints();
    return {
      endpoints: endpoints.map((e) => ({
        id: e.id,
        path: e.path,
        direction: e.direction
      }))
    };
  }
});
const listMessagesTool = createTool({
  id: "list-messages",
  description: "List all messages in a specified endpoint folder",
  inputSchema: z.object({
    endpoint: z.string().default("inbox").describe('The endpoint ID to list messages from (e.g., "inbox", "bugs")'),
    limit: z.number().default(10).describe("Maximum number of messages to return")
  }),
  outputSchema: z.object({
    messages: z.array(z.object({
      id: z.string(),
      filename: z.string(),
      from: z.string().optional(),
      subject: z.string().optional(),
      timestamp: z.string().optional()
    })),
    total: z.number(),
    endpoint: z.string()
  }),
  execute: async ({ endpoint, limit }) => {
    const endpointPath = getEndpointPath(endpoint);
    const files = await readdir(endpointPath).catch(() => []);
    const mdFiles = files.filter((f) => f.endsWith(".md")).slice(0, limit);
    const messages = await Promise.all(
      mdFiles.map(async (filename) => {
        try {
          const content = await readFile(join(endpointPath, filename), "utf-8");
          const { data } = matter(content);
          return {
            id: data.id || filename,
            filename,
            from: data.from,
            subject: data.subject,
            timestamp: data.timestamp
          };
        } catch {
          return {
            id: filename,
            filename,
            from: void 0,
            subject: void 0,
            timestamp: void 0
          };
        }
      })
    );
    return {
      messages,
      total: files.filter((f) => f.endsWith(".md")).length,
      endpoint
    };
  }
});
const readMessageTool = createTool({
  id: "read-message",
  description: "Read the full content of a specific message from an endpoint",
  inputSchema: z.object({
    endpoint: z.string().default("inbox").describe("The endpoint ID to read from"),
    filename: z.string().describe("The filename of the message to read")
  }),
  outputSchema: z.object({
    id: z.string(),
    from: z.string().optional(),
    subject: z.string().optional(),
    timestamp: z.string().optional(),
    replyTo: z.string().optional(),
    content: z.string(),
    frontmatter: z.record(z.string(), z.unknown()),
    endpoint: z.string()
  }),
  execute: async ({ endpoint, filename }) => {
    const endpointPath = getEndpointPath(endpoint);
    const filePath = join(endpointPath, filename);
    const fileContent = await readFile(filePath, "utf-8");
    const { data, content } = matter(fileContent);
    return {
      id: data.id || filename,
      from: data.from,
      subject: data.subject,
      timestamp: data.timestamp,
      replyTo: data.replyTo,
      content: content.trim(),
      frontmatter: data,
      endpoint
    };
  }
});
const submitMessageTool = createTool({
  id: "submit-message",
  description: "Submit a new message to an inbox-direction endpoint (inbox or bidirectional)",
  inputSchema: z.object({
    endpoint: z.string().default("inbox").describe("The endpoint ID to submit to (must be inbox or bidirectional)"),
    from: z.string().describe("Sender identifier"),
    subject: z.string().describe("Message subject"),
    content: z.string().describe("Message body in Markdown"),
    type: z.string().optional().describe('Message type (e.g., "question", "task", "bug-report")'),
    replyTo: z.string().optional().describe("ID of message being replied to"),
    additionalFrontmatter: z.record(z.string(), z.unknown()).optional().describe("Additional frontmatter fields")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filename: z.string(),
    id: z.string(),
    endpoint: z.string()
  }),
  execute: async ({ endpoint, from, subject, content, type, replyTo, additionalFrontmatter }) => {
    const endpointConfig = getEndpoint(endpoint);
    if (!endpointConfig) {
      throw new Error(`Endpoint not found: ${endpoint}`);
    }
    if (endpointConfig.direction === "outbox") {
      throw new Error(`Cannot submit to outbox endpoint: ${endpoint}. Use an inbox or bidirectional endpoint.`);
    }
    const endpointPath = getEndpointPath(endpoint);
    const id = randomUUID();
    const filename = `${id}.md`;
    await mkdir(endpointPath, { recursive: true });
    const frontmatter = {
      id,
      from,
      subject,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...additionalFrontmatter
    };
    if (type) {
      frontmatter.type = type;
    }
    if (replyTo) {
      frontmatter.replyTo = replyTo;
    }
    const yamlLines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
    const fileContent = `---
${yamlLines}
---

${content}`;
    await writeFile(join(endpointPath, filename), fileContent, "utf-8");
    return { success: true, filename, id, endpoint };
  }
});
const writeResponseTool = createTool({
  id: "write-response",
  description: "Write a response message to the outbox or specified endpoint",
  inputSchema: z.object({
    endpoint: z.string().optional().describe("The endpoint ID to write to (defaults to outbox)"),
    to: z.string().describe("Recipient identifier"),
    subject: z.string().describe("Message subject"),
    content: z.string().describe("Message body in Markdown"),
    replyTo: z.string().optional().describe("ID of message being replied to"),
    from: z.string().optional().describe("Sender identifier (defaults to concierge-agent)")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filename: z.string(),
    id: z.string(),
    endpoint: z.string()
  }),
  execute: async ({ endpoint, to, subject, content, replyTo, from }) => {
    let targetEndpoint = endpoint;
    if (!targetEndpoint) {
      const outbox = getDefaultOutboxEndpoint();
      if (!outbox) {
        throw new Error("No outbox endpoint configured");
      }
      targetEndpoint = outbox.id;
    }
    const endpointPath = getEndpointPath(targetEndpoint);
    const id = randomUUID();
    const filename = `${id}.md`;
    await mkdir(endpointPath, { recursive: true });
    const frontmatter = {
      id,
      to,
      subject,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      from: from || "concierge-agent"
    };
    if (replyTo) {
      frontmatter.replyTo = replyTo;
    }
    const yamlLines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
    const fileContent = `---
${yamlLines}
---

${content}`;
    await writeFile(join(endpointPath, filename), fileContent, "utf-8");
    return { success: true, filename, id, endpoint: targetEndpoint };
  }
});
const listInboxTool = listMessagesTool;

const conciergeAgent = new Agent({
  id: "concierge-agent",
  name: "Message Concierge Agent",
  description: "Processes incoming messages from any configured folder endpoint and generates appropriate responses",
  instructions: `
You are a message concierge agent that handles incoming messages from other AI agents and users across multiple folder endpoints.

Your responsibilities:
1. Monitor and process messages from any configured endpoint (inbox, bugs, feature-requests, etc.)
2. Understand the intent and content of each message
3. Route messages appropriately based on their type:
   - Questions: Formulate helpful responses
   - Tasks: Acknowledge and track
   - Bug reports: Log severity and details
   - Feature requests: Acknowledge and summarize
   - Information: Acknowledge receipt
   - Errors/Issues: Log and escalate if needed

4. Write responses to the appropriate outbox or bidirectional endpoint
5. Maintain conversation threads using replyTo references

When processing messages:
- Use list-endpoints to discover available endpoints
- Use list-messages with the endpoint parameter to see messages in any folder
- Always read the full message content before responding
- Include relevant context from the original message in replies
- Use clear, professional language
- Set appropriate subject lines that reflect the conversation topic
- Match the response endpoint based on message type when applicable

Available tools:
- list-endpoints: Discover all configured endpoints
- list-messages: List messages in any endpoint (default: inbox)
- read-message: Read a specific message from any endpoint
- submit-message: Submit a new message to inbox-direction endpoints
- write-response: Send a reply to the outbox

The system supports multiple folder endpoints, each with its own purpose:
- inbox: General incoming messages
- outbox: Outgoing responses
- Custom endpoints: bugs, feature-requests, etc.

Always acknowledge messages and provide helpful responses based on the message type and source endpoint.
`,
  model: "anthropic/claude-sonnet-4-5",
  tools: {
    listEndpointsTool,
    listMessagesTool,
    readMessageTool,
    submitMessageTool,
    writeResponseTool
  },
  memory: new Memory()
});

const processMessageStep = createStep({
  id: "process-message",
  description: "Process an incoming message using the concierge agent",
  inputSchema: z.object({
    filename: z.string().describe("The filename of the message to process"),
    endpoint: z.string().default("inbox").describe("The endpoint the message came from")
  }),
  outputSchema: z.object({
    processed: z.boolean(),
    responseId: z.string().optional(),
    summary: z.string(),
    endpoint: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }
    const agent = mastra?.getAgent("conciergeAgent");
    if (!agent) {
      throw new Error("Concierge agent not found");
    }
    const prompt = `
Process the message with filename: ${inputData.filename} from endpoint: ${inputData.endpoint}

Steps:
1. Read the message using the read-message tool with endpoint: "${inputData.endpoint}"
2. Analyze its content and intent
3. If a response is appropriate, write one using the write-response tool
4. Summarize what action was taken
`;
    const response = await agent.generate([
      { role: "user", content: prompt }
    ]);
    return {
      processed: true,
      responseId: void 0,
      summary: response.text,
      endpoint: inputData.endpoint
    };
  }
});
const messageWorkflow = createWorkflow({
  id: "message-workflow",
  description: "Process a message file from any endpoint and generate an appropriate response",
  inputSchema: z.object({
    filename: z.string().describe("The filename of the message to process"),
    endpoint: z.string().default("inbox").describe("The endpoint the message came from")
  }),
  outputSchema: z.object({
    processed: z.boolean(),
    responseId: z.string().optional(),
    summary: z.string(),
    endpoint: z.string()
  })
}).then(processMessageStep);
messageWorkflow.commit();

let client = null;
function getDbClient() {
  if (!client) {
    client = createClient({
      url: process.env.LIBSQL_URL ?? "file:../.agents/data/agent-ps.db"
    });
  }
  return client;
}
async function initializeDb() {
  const db = getDbClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS message_statuses (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      filename TEXT NOT NULL,
      created_at TEXT NOT NULL,
      processed_at TEXT,
      error TEXT,
      summary TEXT
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_message_status
    ON message_statuses(status)
  `);
}

const messageStatusValue = z.enum(["pending", "processing", "completed", "failed"]);
z.object({
  id: z.string().describe("Message ID"),
  status: messageStatusValue.describe("Current processing status"),
  endpoint: z.string().describe("Endpoint the message came from"),
  filename: z.string().describe("Original filename"),
  createdAt: z.string().describe("When the message was detected"),
  processedAt: z.string().optional().describe("When processing completed"),
  error: z.string().optional().describe("Error message if failed"),
  summary: z.string().optional().describe("Processing summary")
});
async function updateMessageStatus(status) {
  const db = getDbClient();
  await db.execute({
    sql: `
      INSERT OR REPLACE INTO message_statuses
      (id, status, endpoint, filename, created_at, processed_at, error, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      status.id,
      status.status,
      status.endpoint,
      status.filename,
      status.createdAt,
      status.processedAt ?? null,
      status.error ?? null,
      status.summary ?? null
    ]
  });
}
async function getMessageStatus(id) {
  const db = getDbClient();
  const result = await db.execute({
    sql: "SELECT * FROM message_statuses WHERE id = ?",
    args: [id]
  });
  if (result.rows.length === 0) return void 0;
  const row = result.rows[0];
  return {
    id: row.id,
    status: row.status,
    endpoint: row.endpoint,
    filename: row.filename,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    error: row.error,
    summary: row.summary
  };
}
async function getAllMessageStatuses(filterStatus) {
  const db = getDbClient();
  const sql = filterStatus ? "SELECT * FROM message_statuses WHERE status = ? ORDER BY created_at DESC" : "SELECT * FROM message_statuses ORDER BY created_at DESC";
  const result = await db.execute({
    sql,
    args: filterStatus ? [filterStatus] : []
  });
  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    endpoint: row.endpoint,
    filename: row.filename,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    error: row.error,
    summary: row.summary
  }));
}

const getMessageStatusTool = createTool({
  id: "get-message-status",
  description: "Get the processing status of a specific message by ID",
  inputSchema: z.object({
    id: z.string().describe("The message ID to check status for")
  }),
  outputSchema: z.object({
    found: z.boolean(),
    status: z.object({
      id: z.string(),
      status: messageStatusValue,
      endpoint: z.string(),
      filename: z.string(),
      createdAt: z.string(),
      processedAt: z.string().optional(),
      error: z.string().optional(),
      summary: z.string().optional()
    }).optional()
  }),
  execute: async ({ id }) => {
    const status = await getMessageStatus(id);
    if (!status) {
      return { found: false, status: void 0 };
    }
    return { found: true, status };
  }
});
const listMessageStatusesTool = createTool({
  id: "list-message-statuses",
  description: "List processing statuses for all tracked messages",
  inputSchema: z.object({
    filterStatus: messageStatusValue.optional().describe("Filter by status: pending, processing, completed, failed"),
    limit: z.number().default(20).describe("Maximum number of statuses to return")
  }),
  outputSchema: z.object({
    statuses: z.array(z.object({
      id: z.string(),
      status: messageStatusValue,
      endpoint: z.string(),
      filename: z.string(),
      createdAt: z.string(),
      processedAt: z.string().optional(),
      error: z.string().optional()
    })),
    total: z.number()
  }),
  execute: async ({ filterStatus, limit }) => {
    const allStatuses = await getAllMessageStatuses(filterStatus);
    const statuses = allStatuses.slice(0, limit).map((s) => ({
      id: s.id,
      status: s.status,
      endpoint: s.endpoint,
      filename: s.filename,
      createdAt: s.createdAt,
      processedAt: s.processedAt,
      error: s.error
    }));
    return { statuses, total: allStatuses.length };
  }
});

const messageMcpServer = new MCPServer({
  id: "message-mcp",
  name: "Message MCP Server",
  version: "1.0.0",
  description: "Exposes message processing agent and tools via MCP for any configured folder endpoint",
  // Direct tool exposure
  tools: {
    listEndpointsTool,
    listMessagesTool,
    readMessageTool,
    submitMessageTool,
    writeResponseTool,
    getMessageStatusTool,
    listMessageStatusesTool
  },
  // Agent becomes ask_conciergeAgent tool
  agents: { conciergeAgent },
  // Workflow becomes run_messageWorkflow tool
  workflows: { messageWorkflow }
});

function isContainerEnvironment() {
  if (process.env.CONTAINER === "true") return true;
  if (process.env.DOCKER_CONTAINER === "true") return true;
  if (process.env.REMOTE_CONTAINERS === "true") return true;
  if (process.env.REMOTE_CONTAINERS_IPC) return true;
  try {
    require("fs").accessSync("/.dockerenv");
    return true;
  } catch {
  }
  return false;
}
class FolderWatcher extends EventEmitter {
  config;
  watchers = /* @__PURE__ */ new Map();
  isRunning = false;
  forcePolling;
  constructor(config) {
    super();
    this.config = config;
    this.forcePolling = isContainerEnvironment();
  }
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    for (const endpoint of this.config.endpoints) {
      if (endpoint.direction === "outbox") continue;
      await this.watchEndpoint(endpoint);
    }
  }
  async stop() {
    this.isRunning = false;
    for (const [id, watcher] of this.watchers) {
      await watcher.close();
      this.watchers.delete(id);
    }
  }
  async watchEndpoint(endpoint) {
    const fullPath = join(this.config.rootPath, endpoint.path);
    const shouldPoll = endpoint.watchMode === "poll" || this.forcePolling;
    const pollInterval = endpoint.pollIntervalMs ?? 1e3;
    const watcher = chokidar.watch(fullPath, {
      persistent: true,
      ignoreInitial: true,
      // Don't process existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      },
      usePolling: shouldPoll,
      interval: pollInterval,
      depth: 1
      // Watch immediate children only (no deep nesting)
    });
    const isMarkdownFile = (path) => path.endsWith(".md");
    watcher.on("add", (path) => {
      if (isMarkdownFile(path)) {
        this.handleFile("created", path, endpoint);
      }
    }).on("change", (path) => {
      if (isMarkdownFile(path)) {
        this.handleFile("updated", path, endpoint);
      }
    }).on("unlink", (path) => {
      if (isMarkdownFile(path)) {
        this.handleDelete(path, endpoint);
      }
    }).on("error", (error) => this.emit("error", error)).on("ready", () => {
      console.log(`Watching ${endpoint.id} at ${fullPath} (polling: ${shouldPoll})`);
    });
    this.watchers.set(endpoint.id, watcher);
  }
  async handleFile(action, filePath, endpoint) {
    try {
      const message = await this.parseFile(filePath, endpoint);
      const event = {
        type: action === "created" ? "message:created" : "message:updated",
        message
      };
      this.emit("message", event);
    } catch (error) {
      const event = {
        type: "error",
        filePath,
        error: error instanceof Error ? error.message : String(error)
      };
      this.emit("message", event);
    }
  }
  handleDelete(filePath, endpoint) {
    const event = {
      type: "message:deleted",
      filePath,
      endpointId: endpoint.id
    };
    this.emit("message", event);
  }
  async parseFile(filePath, endpoint) {
    const fileContent = await readFile(filePath, "utf-8");
    const { data: frontmatter, content } = matter(fileContent);
    const stats = await stat(filePath);
    const allRequired = [
      ...this.config.defaultFrontmatter?.filter((f) => f.required) ?? [],
      ...endpoint.requiredFrontmatter?.filter((f) => f.required) ?? []
    ];
    for (const field of allRequired) {
      if (!(field.name in frontmatter)) {
        throw new Error(`Missing required frontmatter field: ${field.name}`);
      }
    }
    return {
      id: frontmatter.id || relative(this.config.rootPath, filePath),
      filePath,
      endpointId: endpoint.id,
      frontmatter,
      content: content.trim(),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime
    };
  }
}

const defaultRouterConfig = {
  routes: [
    // Bug reports get special handling
    {
      endpoint: "bugs",
      type: "*",
      handlerType: "agent",
      handlerId: "conciergeAgent",
      priority: 10
    },
    // Feature requests get special handling
    {
      endpoint: "feature-requests",
      type: "*",
      handlerType: "agent",
      handlerId: "conciergeAgent",
      priority: 10
    },
    // Questions go through the workflow
    {
      endpoint: "*",
      type: "question",
      handlerType: "workflow",
      handlerId: "messageWorkflow",
      priority: 5
    },
    // Tasks go through the workflow
    {
      endpoint: "*",
      type: "task",
      handlerType: "workflow",
      handlerId: "messageWorkflow",
      priority: 5
    }
  ],
  defaultHandler: {
    handlerType: "agent",
    handlerId: "conciergeAgent"
  }
};
class MessageRouter {
  config;
  mastra;
  constructor(mastra, config = defaultRouterConfig) {
    this.mastra = mastra;
    this.config = config;
  }
  /**
   * Find the matching route for a message
   */
  findRoute(endpoint, messageType) {
    const sortedRoutes = [...this.config.routes].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );
    for (const route of sortedRoutes) {
      const endpointMatch = route.endpoint === "*" || route.endpoint === endpoint;
      const typeMatch = route.type === "*" || route.type === (messageType ?? "*");
      if (endpointMatch && typeMatch) {
        return route;
      }
    }
    return null;
  }
  /**
   * Route and process a message
   */
  async routeMessage(filename, endpoint, messageType) {
    const route = this.findRoute(endpoint, messageType);
    const handler = route ?? this.config.defaultHandler;
    if (handler.handlerType === "workflow") {
      const workflow = this.mastra.getWorkflow(handler.handlerId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${handler.handlerId}`);
      }
      const run = await workflow.createRun();
      const result = await run.start({
        inputData: { filename, endpoint }
      });
      const summary = typeof result === "object" && result !== null && "summary" in result ? String(result.summary) : "Processed via workflow";
      return { handler: handler.handlerId, result: summary };
    } else {
      const agent = this.mastra.getAgent(handler.handlerId);
      if (!agent) {
        throw new Error(`Agent not found: ${handler.handlerId}`);
      }
      const typeInfo = messageType ? ` (type: ${messageType})` : "";
      const response = await agent.generate([
        {
          role: "user",
          content: `Process the message with filename: ${filename} from endpoint: ${endpoint}${typeInfo}. Read it and respond appropriately.`
        }
      ]);
      return { handler: handler.handlerId, result: response.text };
    }
  }
}

class MessageProcessor {
  watcher;
  mastra;
  config;
  router;
  constructor(config, mastra, routerConfig) {
    this.mastra = mastra;
    this.config = config;
    this.router = new MessageRouter(mastra, routerConfig ?? defaultRouterConfig);
    const inboxEndpoints = getInboxEndpoints(config);
    const watchConfig = {
      ...config,
      endpoints: inboxEndpoints
    };
    this.watcher = new FolderWatcher(watchConfig);
    this.watcher.on("message", this.handleEvent.bind(this));
    this.watcher.on("error", this.handleError.bind(this));
  }
  async start() {
    const endpoints = getInboxEndpoints(this.config);
    const endpointIds = endpoints.map((e) => e.id).join(", ");
    await this.watcher.start();
    console.log(`Message processor started, watching endpoints: ${endpointIds}`);
  }
  async stop() {
    await this.watcher.stop();
    console.log("Message processor stopped");
  }
  async handleEvent(event) {
    if (event.type === "message:created") {
      console.log(`New message: ${event.message.filePath} (endpoint: ${event.message.endpointId})`);
      await this.processMessage(event.message);
    } else if (event.type === "message:updated") {
      console.log(`Updated message: ${event.message.filePath} (endpoint: ${event.message.endpointId})`);
    } else if (event.type === "message:deleted") {
      console.log(`Deleted message: ${event.filePath} (endpoint: ${event.endpointId})`);
    } else if (event.type === "error") {
      console.error(`Error processing ${event.filePath}: ${event.error}`);
    }
  }
  handleError(error) {
    console.error("Folder watcher error:", error);
  }
  async processMessage(message) {
    const filename = basename(message.filePath);
    const messageId = message.id;
    const endpointId = message.endpointId;
    const messageType = message.frontmatter?.type;
    const status = {
      id: messageId,
      status: "pending",
      endpoint: endpointId,
      filename,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await updateMessageStatus(status);
    try {
      if (!filename) {
        throw new Error("Could not extract filename from path");
      }
      status.status = "processing";
      await updateMessageStatus(status);
      const { handler, result } = await this.router.routeMessage(
        filename,
        endpointId,
        messageType
      );
      console.log(`Message ${filename} processed by ${handler}`);
      status.status = "completed";
      status.processedAt = (/* @__PURE__ */ new Date()).toISOString();
      status.summary = result;
      await updateMessageStatus(status);
    } catch (error) {
      console.error(`Error processing message ${message.filePath}:`, error);
      status.status = "failed";
      status.processedAt = (/* @__PURE__ */ new Date()).toISOString();
      status.error = error instanceof Error ? error.message : String(error);
      await updateMessageStatus(status);
    }
  }
}

const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    messageWorkflow
  },
  agents: {
    weatherAgent,
    conciergeAgent
  },
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    translationScorer
  },
  mcpServers: {
    message: messageMcpServer
  },
  storage: new LibSQLStore({
    id: "mastra-storage",
    // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:"
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info"
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "mastra",
        exporters: [
          new DefaultExporter(),
          // Persists traces to storage for Mastra Studio
          new CloudExporter()
          // Sends traces to Mastra Cloud (if MASTRA_CLOUD_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter()
          // Redacts sensitive data like passwords, tokens, keys
        ]
      }
    }
  })
});
const messageProcessor = new MessageProcessor(defaultFolderConfig, mastra);
initializeDb().then(() => messageProcessor.start()).catch((error) => {
  console.error("Failed to start message processor:", error);
});

export { listMessagesTool as a, writeResponseTool as b, listInboxTool as c, listMessageStatusesTool as d, getMessageStatusTool as g, listEndpointsTool as l, mastra as m, readMessageTool as r, submitMessageTool as s, weatherTool as w };
