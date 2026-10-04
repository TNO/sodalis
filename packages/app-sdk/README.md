# First-party app integrations

Developer-authored Sodalis browser apps live in `apps/desktop/src/integrations/`
and are bundled with the desktop. They do **not** register as Aster built-ins or
gain access to Aster's iframe DOM. `SampleNotes.ts` is a working example.

Register an app once with `createAppIntegrationRegistry({ attention, getHost,
getFocusedAppId })`, then pass the registry to
`createDesktopAssistantActionRuntime({ integrations, ... })`. An integration
has an ID, name, optional category, and typed `actions`; action IDs must
start with `<app-id>.`. Each action declares description, risk, confirmation
metadata (phrase and summary for external-effect/destructive actions), and
an object input schema. The shared `AssistantActionRuntime` validates IDs,
schema, and arguments and binds confirmations to the exact invocation.
Only actions for `getFocusedAppId()` are offered to the assistant unless
an action explicitly declares `scope: "global"`. The existing demo Mail and
desktop actions remain explicitly global; don't make app-specific production
actions global just to avoid implementing focus.

```ts
const registration = registry.register({
  id: "sample-notes",
  name: "Sample Notes",
  actions: [{
    id: "sample-notes.read",
    description: "Read the current sample note.",
    risk: "read",
    requiresConfirmation: false,
    inputSchema: {
      type: "object", properties: {}, additionalProperties: false,
    },
    execute: () => currentNote,
  }],
});
const unregisterTarget = registration.registerTarget({
  id: "sample-notes.text",
  element: noteElement,
  role: "textbox",
  label: "Sample note",
});
// On app teardown:
unregisterTarget();
registration.dispose();
```

Actions may receive `{ api }` as their second handler argument. It exposes
same-origin Sodalis Home API methods (`getHomeEntities`, `invokeHomeAction`,
`confirmHomeAction`), never Home Assistant tokens or provider URLs. Do not
accept arbitrary scripts, DOM selectors, or raw Home Assistant service calls
as action arguments. Register targets only for visible controls owned by
the app and unregister them on teardown. A backend service is optional; if
needed, add a Sodalis-owned API and route it through the same-origin gateway.
Importing untrusted third-party action code and its permission model are
out of scope.
