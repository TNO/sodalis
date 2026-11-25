# Using Sodalis

This guide is for someone using an already configured Sodalis prototype. An
administrator can follow the [setup guide](./setup.md) to start it.

## Open the desktop

Open the address supplied by your administrator, normally
`http://127.0.0.1:4176` on the machine running Sodalis. The desktop provides
ordinary graphical applications as well as a Sodalis assistant. This local
development address is not a production deployment.

Click the avatar or dots, or focus **Start a conversation with Sodalis**, to
open **Talk with Sodalis**. Type a message and send it. The assistant shows a
response and, when speech output is available, speaks it.

## Speak and read

Choose **Start microphone** or hold **Hold to talk**, allow microphone access
when the browser asks, and speak. The interface shows the listening state,
transcript, and response. Microphone permission is requested on activation,
not just because the desktop was opened.

In the Assistant sidebar, **Speech and subtitles** offers speech pacing and
subtitle options. If subtitles are hidden, **Read response** still exposes
the text; errors and confirmations remain visible. The **Avatar** picker
offers **Three dots** as an alternative to a 3D avatar.

## Ask about the simulated home

When the administrator has enabled the companion workflow and started a
replay, ask about the generated home data, for example “What is the
temperature in the home?” Answers depend on the dataset, replay time, and
model; a reading may be unavailable or an answer incorrect. The replay starts
before its first observation, so ask the administrator to advance it if no
data has appeared.

The replay is read-only. Conversation does not move its clock, change its
dataset, or operate real devices. The separate Home Assistant simulator is a
development facility, not evidence that the replay controls a home.

## If something does not work

Check that the stack is running and that the browser has microphone permission
if using speech. Try typing to separate microphone issues from conversation
issues. If the reply is visible but silent, try **Read aloud**. Ask the
administrator to consult the
[troubleshooting reference](https://github.com/TNO/sodalis/blob/main/docs/development-stack.md#troubleshooting).
