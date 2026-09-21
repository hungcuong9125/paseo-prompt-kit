# PromptKit

PromptKit is a Paseo plugin (id `prompt-kit`) that rewrites the prompt in your Composer. It adds one `PromptKit` pill to the Composer toolbar; the menu holds a single action, `Improve coding prompt`. Running it rewrites the current Composer text in place, keeps the user's language and every protected literal (URLs, absolute paths, shell commands, code blocks, model names, tool names), restores focus, and never sends the prompt. You review the result and send it yourself.

Rewriting runs in a temporary agent inside your workspace and is archived when the turn ends. Your primary conversation never receives a rewrite turn and never changes provider or session.

## Requirements

- Paseo Desktop or Web, version `>=0.8.0` (`paseo-plugin.json`).
- A provider/model reachable by the daemon for the rewrite.

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

Open the PromptKit settings screen from Paseo settings.

- Rewrite model: `Current agent model` (the model of the agent whose pill you pressed) or `Dedicated model`.
- For `Dedicated model`: pick a provider, model, and thinking option from the daemon's provider catalog. A provider or model the catalog no longer lists makes the rewrite fail closed with an error; the Composer text is kept.
- Timeout (ms): how long a rewrite may run, default `90000`, allowed range `1000`–`600000`.

Settings are host-scoped and persist across plugin reload.

## Limitations

- Desktop and Web only. Mobile is unsupported in this version: Paseo 0.8.0 exposes no plugin API for Composer text, so PromptKit reads and replaces the text through the Desktop/Web Composer DOM. The pill itself uses the official Composer pill API.
- Requires Paseo `>=0.8.0`. Because text access depends on the Composer DOM, a Paseo UI change can break it even when the public plugin SDK is compatible.
- No auto-send. PromptKit only replaces the Composer text; you send the message.
- PromptKit refuses to replace text you edited while a rewrite was running, and refuses when more than one Composer (or none) is visible.
- One action in this version: `Improve coding prompt`.
