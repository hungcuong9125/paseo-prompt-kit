# PromptKit

PromptKit is a Paseo plugin (id `prompt-kit`) that rewrites the prompt in your Composer. It adds one `PromptKit` pill to the Composer toolbar; the menu holds a single action, `Improve coding prompt`. Running it rewrites the current Composer text in place, keeps the user's language and every protected literal (URLs, absolute paths, shell commands, code blocks, model names, tool names), restores focus, and never sends the prompt. You review the result and send it yourself.

Rewriting has three paths, chosen in Settings. The default runs the selected model through the provider's own CLI, headlessly, in a temporary directory — no Paseo agent, no tab, no archive. Your primary conversation never receives a rewrite turn and never changes provider or session. The third path posts straight to an API you configure (Anthropic, OpenAI, Gemini, or anything speaking one of those three protocols) when a CLI cold start is too slow or no CLI exists.

## Requirements

- Paseo Desktop or Web, version `>=0.8.0` (`paseo-plugin.json`).
- For the CLI transports: a provider/model reachable by the daemon, and that provider's CLI on the daemon's `PATH`.
- For the API transport: an endpoint URL, a model id, and a key — see [API keys](#api-keys).

## Install from a local directory

```bash
cd /path/to/paseo-prompt-kit
npm install
npm run typecheck
paseo plugin install /path/to/paseo-prompt-kit
paseo plugin ls
```

`paseo plugin install` trusts the plugin: server code runs unsandboxed on the daemon host and client code runs inside Paseo. Reload after a code change:

```bash
paseo plugin reload prompt-kit
paseo plugin logs prompt-kit
```

## Install from Git

After the repository is published, install the managed Git checkout:

```bash
paseo plugin install hungcuong9125/paseo-prompt-kit --ref main
paseo plugin ls
```

`--ref` chooses the initial branch, tag, or commit once; later `paseo plugin update prompt-kit` follows the remote's default HEAD. `paseo plugin ls` reports the installed commit.

## Settings

Open the PromptKit settings screen from Paseo settings. Two independent choices decide which of the three paths runs.

### Transport

- `Provider CLI` (default) — the provider's own CLI runs the rewrite headlessly. The model comes from the next setting.
- `Direct API` — PromptKit posts to an endpoint you configure. No CLI is started.

### Rewrite model

- `Current agent model` — the model the Composer's model control is showing for the agent whose pill you pressed. PromptKit reads the same value Paseo does (the provider session's runtime model first, then the configured model), so what you see is what runs.
- `Dedicated model` — a provider, model and thinking option you pick from the daemon's provider catalog, whatever the agent itself runs.

### The three paths

| Transport | Rewrite model | What runs |
|---|---|---|
| `Provider CLI` | `Current agent model` | The agent's own provider CLI with the model the Composer shows |
| `Provider CLI` | `Dedicated model` | The dedicated provider's CLI with the model you picked |
| `Direct API` | either | An HTTP request to the endpoint you configured |

On `Direct API` the model has two sources. If you map an endpoint to a provider under `Endpoint by provider`, the agent's own model is sent — this is how you point a provider such as `opencode` at your own OpenAI-compatible endpoint. Otherwise pick `Dedicated model` and choose an `API model`.

### Other fields

- `Provider CLI`: maps a provider id to a CLI family. Most ids need no entry — a profile named after its CLI (`pi-peer`, `codex-lead`) resolves on its own. Map one only when the id does not say which CLI runs it. An unmapped provider is refused, never guessed.
- `Endpoint by provider`: maps a provider id to an API endpoint, so that provider rewrites over HTTP. An entry here takes precedence over the global endpoint.
- `Timeout (ms)`: how long a rewrite may run, default `90000`, allowed range `1000`–`600000`. Note the daemon also caps a plugin call at 30 seconds, so a value above that is not reachable in practice.

Settings are host-scoped and persist across plugin reload.

## API keys

An API key is **never** stored in PromptKit's settings document. That document is read by the client — including the Paseo Web UI — so a key placed there would leave your machine. Instead an endpoint stores only the **name** of the variable that holds its key (`apiKeyEnv`), and the value is read on the daemon side, at request time, in this order:

1. **An environment variable** with that name. The plugin server is a child of the daemon, so it inherits the daemon's environment. This is the right source when the daemon was started from a shell.
2. **`secrets.json`** next to the plugin's settings file:

   ```
   <PASEO_HOME>/plugin-settings/prompt-kit/secrets.json
   ```

   `PASEO_HOME` defaults to `~/.paseo`. On macOS the default path is `~/.paseo/plugin-settings/prompt-kit/secrets.json`. Set the `secretsFile` setting to a directory path to override it (useful when the daemon runs with a non-default `PASEO_HOME`).

3. If neither has a value, the rewrite fails closed with `missing_api_key` and the Composer text is untouched. Nothing is sent.

### Why the file exists at all

On macOS, launching Paseo from Finder gives the daemon **no shell environment**, so a key exported in `~/.zshrc` never reaches it. `secrets.json` is the source that works regardless of how Paseo was started.

### `secrets.json` format

```json
{
  "version": 1,
  "apiKeys": {
    "GROQ_API_KEY": "gsk_...",
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "GEMINI_API_KEY": "AIza..."
  }
}
```

Create it with owner-only permissions:

```bash
mkdir -p ~/.paseo/plugin-settings/prompt-kit
chmod 700 ~/.paseo/plugin-settings/prompt-kit
cat > ~/.paseo/plugin-settings/prompt-kit/secrets.json <<'EOF'
{ "version": 1, "apiKeys": { "GROQ_API_KEY": "gsk_replace_me" } }
EOF
chmod 600 ~/.paseo/plugin-settings/prompt-kit/secrets.json
```

### What PromptKit guarantees about keys

- The value is never written to the settings document, never returned by any RPC, and never written to a log or an error message. A failure names the **variable** (`No value for "GROQ_API_KEY"`), not the value.
- The key is read at request time and used for that one request only. It is not cached to disk.
- PromptKit never writes `secrets.json`. You create and own that file.
- An endpoint with an empty `apiKeyEnv` needs no key. That is valid for a local server (vLLM, llama.cpp, LM Studio), which is why it is allowed rather than treated as an error.

### Endpoint configuration

Endpoints are defined in the settings document under `apiEndpoints`, because that is the only configuration store a Paseo plugin can read. A provider profile in `~/.paseo/config.json` is **not** visible to PromptKit: the daemon does not pass provider environment variables to plugins.

Each endpoint is one of three protocols. Adding a vendor is a settings edit, not a code change:

| Protocol | Request | Works with |
|---|---|---|
| `openai` | `POST <baseUrl>/chat/completions`, `Authorization: Bearer` | OpenAI, **Groq**, OpenRouter, LiteLLM, vLLM, llama.cpp, LM Studio, Together, Fireworks, most gateways |
| `anthropic` | `POST <baseUrl>/v1/messages`, `x-api-key` | Anthropic, z.ai, Alibaba/Qwen, Anthropic-compatible gateways |
| `gemini` | `POST <baseUrl>/v1beta/models/<model>:generateContent`, `x-goog-api-key` | Google AI Studio, Vertex |

Example — the Groq endpoint from the settings document:

```json
{
  "transport": "api",
  "modelMode": "dedicated",
  "apiEndpointId": "groq",
  "apiModel": "openai/gpt-oss-20b",
  "apiEndpoints": [
    {
      "id": "groq",
      "label": "Groq",
      "protocol": "openai",
      "baseUrl": "https://api.groq.com/openai/v1",
      "apiKeyEnv": "GROQ_API_KEY",
      "models": ["openai/gpt-oss-20b"]
    }
  ]
}
```

Example — point one provider at your own endpoint, so it never pays a CLI cold start:

```json
{
  "transport": "api",
  "apiEndpointByProvider": { "opencode": "groq" }
}
```

An endpoint that lists `models` restricts the choice to that list, and a model outside it fails closed with `invalid_model` before any request. Leave `models` empty to accept any model id — correct for a local server whose list PromptKit cannot know.

### API failure codes

| Code | Meaning |
|---|---|
| `missing_api_key` | Neither the environment nor `secrets.json` has a value for the endpoint's `apiKeyEnv` |
| `api_endpoint_unknown` | The selected or mapped endpoint id is not defined in `apiEndpoints` |
| `api_http_error` | The endpoint answered a non-2xx status, or was unreachable |
| `api_bad_response` | The answer was not JSON, or carried no text |
| `timeout` | The request exceeded `Timeout (ms)` |

Every one of these leaves the Composer text untouched.

## Limitations

- Desktop and Web only. Mobile is unsupported in this version: Paseo 0.8.0 exposes no plugin API for Composer text, so PromptKit reads and replaces the text through the Desktop/Web Composer DOM. The pill itself uses the official Composer pill API.
- Requires Paseo `>=0.8.0`. Because text access depends on the Composer DOM, a Paseo UI change can break it even when the public plugin SDK is compatible.
- No auto-send. PromptKit only replaces the Composer text; you send the message.
- PromptKit refuses to replace text you edited while a rewrite was running, and refuses when more than one Composer (or none) is visible.
- One action in this version: `Improve coding prompt`.
- The API transport does not stream: it makes one request and waits for the whole answer. A slow endpoint can exceed the daemon's 30-second plugin-call cap, in which case the host reports a timeout before PromptKit's own `Timeout (ms)` can fire.
- No OAuth or token refresh: an endpoint uses a static key. A provider that needs an interactive login is better served by the CLI transport.

## License

MIT — see `LICENSE`. PromptKit contains no copied upstream code. The Composer text access pattern follows [paseo-emoji](https://github.com/YoseptF/paseo-emoji) (MIT); the plugin runs on [Paseo](https://github.com/getpaseo/paseo) (Apache-2.0) through its public plugin SDK.
