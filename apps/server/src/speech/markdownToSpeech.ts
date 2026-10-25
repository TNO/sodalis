const MARKDOWN_IMAGE =
  /!\[([^\]]*)\]\((?:[^()\\]|\\.|\([^)]*\))*\)/g;
const MARKDOWN_LINK =
  /\[([^\]]+)\]\((?:[^()\\]|\\.|\([^)]*\))*\)/g;

export function markdownToSpeech(text: string): string {
  const cleaned = text
    .replace(/\r\n?/g, "\n")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(MARKDOWN_IMAGE, "$1")
    .replace(MARKDOWN_LINK, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]+/gm, "")
    .replace(/\*\*|__|\*|_/g, "")
    .replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}
