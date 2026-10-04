export interface MockMailMessage {
  readonly id: string;
  readonly from: string;
  readonly fromAddress: string;
  readonly subject: string;
  readonly body: string;
  readonly receivedAt: string;
}

export interface MockMailDraft {
  readonly id: string;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

const SEED_MESSAGES: readonly MockMailMessage[] = [
  {
    id: "mail-anne-project",
    from: "Anne de Vries",
    fromAddress: "anne@example.test",
    subject: "Project planning",
    body: "Could we review the project timeline together this Thursday afternoon?",
    receivedAt: "2026-06-02T09:15:00.000Z",
  },
  {
    id: "mail-support-invoice",
    from: "Sodalis Support",
    fromAddress: "support@example.test",
    subject: "Your sample invoice",
    body: "The sample invoice is ready. Let us know if you need any changes.",
    receivedAt: "2026-06-01T14:30:00.000Z",
  },
  {
    id: "mail-anne-reply",
    from: "Anne de Vries",
    fromAddress: "anne@example.test",
    subject: "Re: Accessibility review",
    body: "Thanks for the notes. I will update the keyboard navigation section.",
    receivedAt: "2026-05-29T11:45:00.000Z",
  },
];

export class MockMailApplication {
  private readonly messages = SEED_MESSAGES.map((message) => ({ ...message }));
  private readonly drafts: MockMailDraft[] = [];
  private readonly sentMessages: MockMailDraft[] = [];
  private selectedMessageId: string | undefined;
  private draftSequence = 0;
  private sentSequence = 0;

  listMessages(): readonly MockMailMessage[] {
    return this.messages.map((message) => ({ ...message }));
  }

  searchMessages(query: string): readonly MockMailMessage[] {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) throw new Error("Mail search requires a query.");
    return this.messages
      .filter((message) =>
        [message.from, message.fromAddress, message.subject, message.body]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalized),
      )
      .map((message) => ({ ...message }));
  }

  openMessage(id: string): MockMailMessage {
    const message = this.findMessage(id);
    this.selectedMessageId = message.id;
    return { ...message };
  }

  selectMessage(id: string): MockMailMessage {
    const message = this.findMessage(id);
    this.selectedMessageId = message.id;
    return { ...message };
  }

  readMessage(id: string): MockMailMessage {
    return { ...this.findMessage(id) };
  }

  createDraft(input: Omit<MockMailDraft, "id">): MockMailDraft {
    this.draftSequence += 1;
    const draft = { id: `draft-${this.draftSequence}`, ...input };
    this.drafts.push(draft);
    return { ...draft };
  }

  send(input: Omit<MockMailDraft, "id">): MockMailDraft {
    this.sentSequence += 1;
    const sent = { id: `sent-${this.sentSequence}`, ...input };
    this.sentMessages.push(sent);
    return { ...sent };
  }

  getDrafts(): readonly MockMailDraft[] {
    return this.drafts.map((draft) => ({ ...draft }));
  }

  getSentMessages(): readonly MockMailDraft[] {
    return this.sentMessages.map((message) => ({ ...message }));
  }

  getSelectedMessageId(): string | undefined {
    return this.selectedMessageId;
  }

  private findMessage(id: string): MockMailMessage {
    const message = this.messages.find((item) => item.id === id);
    if (!message) throw new Error(`Mail message "${id}" was not found.`);
    return message;
  }
}
