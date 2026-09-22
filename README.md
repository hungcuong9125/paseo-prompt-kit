# PromptKit

PromptKit is a Paseo plugin (id `prompt-kit`) that rewrites the prompt in your Composer. It adds one `PromptKit` pill to the Composer's track bar and a `/rewrite <prompt>` slash command; the bundled action is `Improve coding prompt`. Running it rewrites the current Composer text in place, keeps the user's language and every protected literal (URLs, absolute paths, shell commands, code blocks, model names, tool names), restores focus, and never sends the prompt. You review the result and send it yourself.

Rewriting has three paths, chosen in Settings. The default runs the selected model through the provider's own CLI, headlessly, in a temporary directory — no Paseo agent, no tab, no archive. Your primary conversation never receives a rewrite turn and never changes provider or session. The third path posts straight to an API you configure (Anthropic, OpenAI, Gemini, or anything speaking one of those three protocols) when a CLI cold start is too slow or no CLI exists.

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Three ways to run it

- **The pill** — write your prompt, press `PromptKit`. The text is rewritten in place; a leading `/rewrite ` left in the text is ignored. Available once the agent exists, so on a new seat it appears after the first message.
- **`/rewrite <prompt>`** — type the command with the prompt after it and press Enter. Paseo empties the Composer and hands the text to PromptKit, which puts the `/rewrite …` line straight back, dims it with a light sweep while it works, and then replaces it with the rewrite. A failed rewrite leaves your line in place. Available immediately, including on a new seat before its first message. Because no agent exists yet on a draft, `/rewrite` cannot use `Current agent model`; choose `Dedicated model` or `Direct API` in Settings, or use the pill once the agent exists.
- **The PromptKit sheet** (mobile) — write in the Composer as usual and press the pill. A sheet slides up already holding your text and rewrites it at once. Press **Rewrite** again until it reads right, then **Send**: the message goes to the agent, the Composer is cleared, the sheet closes. **✕** closes the sheet and leaves the Composer untouched.

No path sends the message on its own. You review the result and send it yourself.

## Requirements

- Paseo Desktop or Web, version `>=0.9.0` (`paseo-plugin.json`). The plugin is built and tested against the 0.9.0 SDK.
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

`--ref` chooses the initial branch, tag, or commit once; later `paseo plugin update prompt-kit` follows the remote's default HEAD. Pin a release instead of tracking `main` by giving `--ref` a tag:

```bash
paseo plugin install hungcuong9125/paseo-prompt-kit --ref v0.3.0
```

`paseo plugin ls` reports the installed commit.

## Settings

Open it from Paseo Settings → Plugins → the `…` menu on `prompt-kit` → **Settings**. The bar at the top says whether a rewrite would run and over which path, names the reason when it would not, and holds **Save** / **Discard** once something has changed. Nothing is written until Save.

The screen reads top to bottom in setup order:

1. **Actions** — one switch per bundled action. One enabled action makes the pill a direct button; two or more make it a menu; none hides the pill. A change here reaches the pill when the agent re-opens or the plugin reloads.
2. **Rewrite engine** — the two independent choices below. Every other section appears only when these two need it.
3. **Dedicated model** (CLI + Dedicated) or **API endpoint** (Direct API).
4. **Advanced** (collapsed) — timeout, secrets directory, and the two per-provider overrides.

### Transport

- `Provider CLI` (default) — the provider's own CLI runs the rewrite headlessly. The model comes from the next setting.
- `Direct API` — PromptKit posts to an endpoint you configure. No CLI is started.

### Model source

- `Current agent model` — the model the Composer's model control is showing for the agent whose pill you pressed. PromptKit reads the same value Paseo does (the provider session's runtime model first, then the configured model), so what you see is what runs.
- `Dedicated model` — a provider, model and thinking option you pick from the daemon's provider catalog, whatever the agent itself runs.

### Output language

`Same as the prompt` (default) keeps the language you wrote in. `English`, `Tiếng Việt`, or any language you add translates the prose while paths, commands, code and names stay exactly as written. A language is one JSON file under `shared/languages/`; see `docs/guides/output-languages.md`.

### The three paths

| Transport | Model source | What runs |
|---|---|---|
| `Provider CLI` | `Current agent model` | The agent's own provider CLI with the model the Composer shows |
| `Provider CLI` | `Dedicated model` | The dedicated provider's CLI with the model you picked |
| `Direct API` | either | An HTTP request to the endpoint you configured |

On `Direct API` the model has two sources. If you map a provider to an endpoint under **Advanced → Endpoint per provider**, the agent's own model is sent — this is how you point a provider such as `opencode` at your own OpenAI-compatible endpoint. Otherwise pick `Dedicated model` and choose a model on the endpoint.

### API endpoint

Choose a preset (Groq, OpenAI, Anthropic, Google Gemini, OpenRouter, Local server) or a custom endpoint, fill in the base URL and the **name** of the key variable, and press **Test**. A successful test fills the model list from the endpoint; the rewrite refuses a model outside that list. Save is blocked while the endpoint cannot work (for example an empty base URL), with the reason in the status bar.

### Advanced

- `Timeout (ms)`: how long a rewrite may run, default `90000`, allowed range `1000`–`600000`. The daemon caps one plugin call at 30 s, so the screen notes when a budget above that cannot be reached.
- `Secrets directory` (Direct API): where `secrets.json` lives. Empty means `<PASEO_HOME>/plugin-settings/prompt-kit`.
- `CLI per provider` (Provider CLI): lists only the providers you have overridden, plus an Add row. A profile named after its CLI (`pi-peer`, `codex-lead`) resolves on its own and needs no entry; an unresolved provider is refused, never guessed.
- `Endpoint per provider` (Direct API): lists only mapped providers, plus an Add row. Pressing the pill in an agent of a mapped provider sends that agent's own model to the endpoint over HTTP. A mapped provider needs no dedicated model.

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

- In-place rewriting works on Desktop and Web only: the mobile app renders the Composer as a native text input with no DOM, and Paseo 0.9.0 exposes no plugin API for Composer text. On mobile the `PromptKit` pill opens the **PromptKit sheet** instead (see above); it reads and clears the Composer through the app's React tree rather than the DOM, which a Paseo update can break in the same way. Nothing is copied or sent on its own. `/rewrite` is not available on mobile. On Web, a refusal names what was found (no Composer, none visible, or more than one visible).
- Requires Paseo `>=0.9.0`. Because text access depends on the Composer DOM (or, on mobile, the React tree), a Paseo UI change can break it even when the public plugin SDK is compatible.
- No auto-send. PromptKit only replaces the Composer text; you send the message.
- PromptKit refuses to replace text you edited while a rewrite was running, and refuses when more than one Composer (or none) is visible.
- One bundled action in this version: `Improve coding prompt`. Adding another is one JSON file — see `docs/EXTENDING.md`.
- The API transport does not stream: it makes one request and waits for the whole answer. A slow endpoint can exceed the daemon's 30-second plugin-call cap, in which case the host reports a timeout before PromptKit's own `Timeout (ms)` can fire.
- No OAuth or token refresh: an endpoint uses a static key. A provider that needs an interactive login is better served by the CLI transport.

## Project layout

The host compiler accepts only `client/`, `server/` and `shared/` at the root, so the modules live inside them. `docs/CORE.md` names each module's one responsibility; `docs/guides/` walks through the two data-only extensions (a new action pack, a new output language); `docs/EXTENDING.md` covers those plus API protocols, CLI families and settings sections, with templates under `docs/templates/`.

## License

MIT — see `LICENSE`. PromptKit contains no copied upstream code. The Composer text access pattern follows [paseo-emoji](https://github.com/YoseptF/paseo-emoji) (MIT); the plugin runs on [Paseo](https://github.com/getpaseo/paseo) (Apache-2.0) through its public plugin SDK.
</content>
