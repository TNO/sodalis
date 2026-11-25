import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid({
  title: "Sodalis",
  description: "A research prototype for a more approachable digital companion",
  base: "/sodalis/",
  vite: {
    // Mermaid's transitive CommonJS dependencies need pre-bundling in dev.
    optimizeDeps: { include: ["mermaid"] },
  },
  srcExclude: [
    "adr/**",
    "avatar/**",
    "evaluations/**",
    "development-stack.md",
    "architecture/companion-graph-examples.md",
    "architecture/companion-harness.md",
    "architecture/desktop-foundation.md",
  ],
  themeConfig: {
    search: { provider: "local" },
    nav: [
      { text: "Overview", link: "/guide/overview" },
      { text: "User guide", link: "/guide/using-sodalis" },
      { text: "Setup", link: "/guide/setup" },
      { text: "Develop", link: "/guide/development" },
      { text: "Architecture", link: "/architecture/system" },
      { text: "Future work", link: "/guide/future-work" },
    ],
    sidebar: [
      {
        text: "Sodalis",
        items: [
          { text: "Overview", link: "/guide/overview" },
          { text: "Using Sodalis", link: "/guide/using-sodalis" },
          { text: "Set up the simulated stack", link: "/guide/setup" },
          { text: "Future work", link: "/guide/future-work" },
        ],
      },
      {
        text: "For contributors",
        items: [
          { text: "Development", link: "/guide/development" },
          { text: "System architecture", link: "/architecture/system" },
          { text: "Key decisions and evidence", link: "/architecture/decisions" },
          { text: "Documentation maintenance", link: "/guide/documentation" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/TNO/sodalis" }],
    footer: { message: "Sodalis is a research prototype." },
  },
});
