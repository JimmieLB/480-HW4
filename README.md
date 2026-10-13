# pi-ask-user

An `ask_user` tool for the [Pi coding agent](https://pi.dev). When the agent hits a decision it
shouldn't guess at, it pauses, asks you (pick an option or type your own), and continues with your answer.

## Install / run

```bash
git clone <this-repo> && cd pi-ask-user
npm install

# try it for one session
pi -e ./src/index.ts

# or install as a Pi package
pi install .
```

Then give Pi a task with an unresolved choice, e.g.:

> Add a persistence layer to this project. Ask me which database to use before writing any code.

## Tool contract

`ask_user({ question, options?, allowCustom?, placeholder? })`

| Situation | What the agent gets back |
|---|---|
| User picks an option | `User selected: <option>` (`details.status = "selected"`) |
| User types a custom answer | `User answered: <text>` (`"custom"`) |
| User dismisses the dialog | A "cancelled" message telling the agent to stop or state an assumption (`"cancelled"`) |
| User submits blank text | An "empty answer" message (`"empty"`) |
| No interactive UI (print/JSON mode) | The tool **fails** with a message telling the agent not to retry |

- No `options` → free-text prompt.
- `allowCustom: false` → only the listed options are offered.
- Options are trimmed and de-duplicated; the abort signal is forwarded so a cancelled run closes the dialog.
- Works in the TUI and in RPC mode (dialogs go through Pi's RPC extension-UI protocol).

## Tests

```bash
npm test          # 18 tests (vitest)
npm run typecheck
```

Covered: selecting an option, custom answer (via menu and free-text), cancellation, empty/whitespace
answers, unavailable UI, option normalisation, rejecting un-offered values, tool registration, and
abort-signal forwarding.

## Layout

```
src/ask-user.ts   core logic, no Pi runtime imports (unit-tested with a fake UI)
src/index.ts      Pi extension: defines and registers the tool
test/             vitest suite
DEMO.md           60-90s demo script
```

Requires `@earendil-works/pi-coding-agent` (tested against 1.2.0). Older Pi releases used the
`@mariozechner/` scope; if you're on one, change the two import specifiers in `src/index.ts`.
