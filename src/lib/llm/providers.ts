/**
 * Provider adapters.
 *
 * Deliberately hand-rolled `fetch` rather than five vendor SDKs. This ships in
 * an MV3 extension where every kilobyte is in the user's download and remote
 * code is forbidden outright — five SDKs to send five very similar JSON bodies
 * is not a trade worth making. Each adapter is ~20 lines and does one thing:
 * turn an LlmRequest into that vendor's structured-output dialect and parse the
 * reply back into a typed object.
 */
import { LlmError, type JsonSchema, type LlmConfig, type LlmRequest } from './types';

/** Requests that hang forever are worse than requests that fail. */
const TIMEOUT_MS = 30_000;

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: LlmConfig['provider'],
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new LlmError(
      `${provider} returned ${res.status}: ${detail.slice(0, 200)}`,
      provider,
      res.status,
    );
  }

  return res.json();
}

/** Parse the model's reply, which is JSON *text* on every provider. */
function parseReply<T>(text: string | undefined, provider: LlmConfig['provider']): T {
  if (!text) throw new LlmError('empty response', provider);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new LlmError(`response was not valid JSON: ${text.slice(0, 200)}`, provider);
  }
}

/** Gemini's schema dialect is an OpenAPI subset and rejects this key. */
function stripUnsupported(schema: JsonSchema): Record<string, unknown> {
  const { additionalProperties: _drop, ...rest } = schema;
  return rest;
}

/* --------------------------------------------------------------- anthropic */

interface AnthropicReply {
  content?: Array<{ type: string; text?: string }>;
}

async function callAnthropic<T>(cfg: LlmConfig, req: LlmRequest): Promise<T> {
  const json = (await postJson(
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      // Required for calls that originate in a browser context. Named
      // "dangerous" because it exposes the key to page scripts on a web page —
      // here the key never leaves the extension's own origin.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    {
      model: cfg.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
      // Structured outputs. Note there is no `temperature` here: the current
      // Claude models reject sampling parameters outright.
      output_config: { format: { type: 'json_schema', schema: req.schema } },
    },
    'anthropic',
  )) as AnthropicReply;

  const text = json.content?.find((b) => b.type === 'text')?.text;
  return parseReply<T>(text, 'anthropic');
}

/* ------------------------------------------------------------------ gemini */

interface GeminiReply {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

async function callGemini<T>(cfg: LlmConfig, req: LlmRequest): Promise<T> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(cfg.model)}:generateContent`;

  const json = (await postJson(
    url,
    { 'x-goog-api-key': cfg.apiKey },
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: stripUnsupported(req.schema),
        maxOutputTokens: req.maxTokens ?? 4096,
      },
    },
    'gemini',
  )) as GeminiReply;

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  return parseReply<T>(text, 'gemini');
}

/* --------------------------------------------------- openai / openrouter */

interface ChatReply {
  choices?: Array<{ message?: { content?: string } }>;
}

/** OpenAI and OpenRouter speak the same chat-completions dialect. */
async function callChatCompletions<T>(
  cfg: LlmConfig,
  req: LlmRequest,
  url: string,
): Promise<T> {
  const json = (await postJson(
    url,
    { authorization: `Bearer ${cfg.apiKey}` },
    {
      model: cfg.model,
      max_completion_tokens: req.maxTokens ?? 4096,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'reply', strict: true, schema: req.schema },
      },
    },
    cfg.provider,
  )) as ChatReply;

  return parseReply<T>(json.choices?.[0]?.message?.content, cfg.provider);
}

/* ------------------------------------------------------------------ ollama */

interface OllamaReply {
  message?: { content?: string };
}

async function callOllama<T>(cfg: LlmConfig, req: LlmRequest): Promise<T> {
  const base = (cfg.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');

  const json = (await postJson(
    `${base}/api/chat`,
    {},
    {
      model: cfg.model,
      stream: false,
      format: stripUnsupported(req.schema),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    },
    'ollama',
  )) as OllamaReply;

  return parseReply<T>(json.message?.content, 'ollama');
}

/* ---------------------------------------------------------------- dispatch */

export function callProvider<T>(cfg: LlmConfig, req: LlmRequest): Promise<T> {
  switch (cfg.provider) {
    case 'anthropic':
      return callAnthropic<T>(cfg, req);
    case 'gemini':
      return callGemini<T>(cfg, req);
    case 'openai':
      return callChatCompletions<T>(cfg, req, 'https://api.openai.com/v1/chat/completions');
    case 'openrouter':
      return callChatCompletions<T>(cfg, req, 'https://openrouter.ai/api/v1/chat/completions');
    case 'ollama':
      return callOllama<T>(cfg, req);
  }
}
