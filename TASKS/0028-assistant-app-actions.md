# 0028 Assistant app actions

Status: done
Priority: high
Subsystem: assistant
Depends on: 0026, 0027

## Context

Connect the conversational assistant to Sodalis trusted applications.

The assistant must operate through semantic application actions rather than DOM manipulation.

Consequential actions require enforcement by Sodalis code, not merely an instruction in the LLM prompt.

Use a deterministic mock Mail application for the first implementation.

## Acceptance Criteria

- Connect the orchestrator to the existing trusted-app interface.
- Allow the assistant to obtain current semantic `AppContext`.
- Allow the assistant to discover available semantic app actions.
- Implement structured tool/action invocation.
- Integrate the existing AttentionManager for guidance.
- Support low-risk actions such as:
  - open app;
  - navigate;
  - search;
  - select;
  - read;
  - draft.
- Implement action risk metadata.
- Implement confirmation enforcement for external-effect/destructive actions.
- Confirmation is available through both GUI and conversational interaction.
- Bind confirmation to the exact action and arguments.
- A later unrelated "yes" must not approve an old action.
- Implement a mock Mail app/fixtures if one does not already exist.
- Mock Mail supports:
  - list/search messages;
  - open message;
  - read semantic content;
  - create draft;
  - mock send.
- `mock send` requires confirmation.
- Add tests proving the LLM cannot bypass confirmation.

## Implementation Notes

Conceptual action metadata:

```ts
interface AppActionDefinition {
  id: string;
  description: string;

  risk:
    | "read"
    | "navigate"
    | "draft"
    | "external-effect"
    | "destructive";

  requiresConfirmation: boolean;
  inputSchema: unknown;
}
```

Conceptual flow:

```text
LLM/tool request
      |
      v
semantic action
      |
      v
permission policy
      |
   +--+----------------+
   |                   |
allowed          confirmation required
   |                   |
   v                   v
execute            ask user
                       |
                      yes
                       |
                       v
                  execute exact
                  pending action
```

The LLM does not receive arbitrary DOM access.

Use AttentionManager to highlight/look toward UI when explaining or presenting results.

## Agent Notes

- Permission enforcement must remain deterministic application logic.
