# Data Model And Contracts

## Storage Keys

- `captureState`: `{ isCapturing: boolean, startedAt: number | null }`
- `sessions`: `Session[]`
- `steps`: `Step[]`
- `sessionByTab`: `Record<string, sessionId>`
- `eventLog`: recent system events (bounded list)
- `dockUi`: floating dock placement and minimized state

## Session Shape

```ts
type Session = {
  id: string;
  tabId: number;
  startUrl: string;
  startTitle?: string;
  lastUrl?: string;
  lastTitle?: string;
  startedAt: number;
  updatedAt: number;
  stepsCount: number;
};
```

## Step Shape

```ts
type Step = {
  id: string;
  sessionId: string;
  stepIndex?: number;
  type: "click" | "key" | "input" | "select" | "toggle" | "navigate" | "scroll" | string;
  url: string;
  pageTitle?: string;
  at: number;
  key?: string | null;
  modifiers?: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } | null;
  value?: string | null;
  inputType?: string | null;
  optionValue?: string | null;
  optionText?: string | null;
  checked?: boolean | null;
  scrollX?: number | null;
  scrollY?: number | null;
  navigationKind?: string | null;
  fromHref?: string | null;
  target?: {
    tag?: string | null;
    id?: string | null;
    name?: string | null;
    type?: string | null;
    role?: string | null;
    placeholder?: string | null;
    label?: string | null;
    text?: string | null;
  } | null;
  selectors?: { css?: string | null; xpath?: string | null } | null;
  thumbnailDataUrl?: string | null;
  annotations?: Array<{
    id: string;
    x: number;      // 0..1
    y: number;      // 0..1
    width: number;  // 0..1
    height: number; // 0..1
    label?: string;
  }>;
};
```

## Runtime Message Contracts

## Extension runtime messages (content/popup/editor -> service worker)

- `START_CAPTURE`: `{}`
- `STOP_CAPTURE`: `{}`
- `GET_DOCK_STATE`: `{}`
- `DISCARD_LAST_STEP`: `{ sessionId?: string }`
- `CONTENT_SCRIPT_READY`: `{ href: string, title?: string, ts: number }`
- `STEP_CAPTURED`:

```ts
{
  kind: "click" | "key" | "input" | "select" | "toggle" | "navigate" | "scroll";
  href: string;
  title?: string;
  ts: number;
  target?: object;
  selectors?: { css?: string; xpath?: string };
  key?: string;
  modifiers?: object;
  value?: string;
  inputType?: string;
  optionValue?: string;
  optionText?: string;
  checked?: boolean;
  scrollX?: number;
  scrollY?: number;
  navigationKind?: string;
  fromHref?: string;
}
```

## Dock bridge messages (iframe <-> content script)

- Channel: `CAP_ME_DOCK`
- Content script -> dock:
  - `STATE`: `{ isCapturing, startedAt, stepCount, minimized }`
  - `DISCARD_RESULT`: `{ discarded: boolean }`
- Dock -> content script:
  - `TOGGLE_CAPTURE`
  - `STOP_CAPTURE`
  - `DISCARD_LAST_STEP`
  - `TOGGLE_MINIMIZE`
  - `MOVE_DOCK`: `{ dx, dy }`

## App bridge messages (web app <-> content script via page postMessage)

- Channel: `CAP_ME_APP_BRIDGE`
- App -> content script:
  - `REQUEST_SESSIONS`: `{ requestId }`
- Content script -> app:
  - `SESSIONS_RESPONSE`: `{ requestId, ok, sessions?, steps?, error? }`

## Data Retention Rules

- Sessions persisted as last 20 only.
- Steps persisted as last 500 only.
- Event log persisted as last 100 only.
- Inspector previews max 10 recent steps and 6 thumbnails per selection view.
