import { describe, expect, it } from "vitest";
import { configurations } from "./llm-compare.js";

describe("LLM comparison configurations", () => {
  it("configures Azure non-reasoning deployments without a reasoning effort", () => {
    const [config] = configurations(
      ["azure-off"],
      {
        AZURE_LLM_URL: "https://example.openai.azure.com/openai/v1",
        AZURE_LLM_KEY: "test-key",
        AZURE_LLM_DEPLOYMENT: "gpt-4.1-mini",
      },
      undefined,
      undefined,
    );

    expect(config).toEqual({
      label: "azure:gpt-4.1-mini:off",
      settings: {
        LLM_PROVIDER: "azure",
        AZURE_LLM_URL: "https://example.openai.azure.com/openai/v1",
        AZURE_LLM_KEY: "test-key",
        AZURE_LLM_DEPLOYMENT: "gpt-4.1-mini",
        AZURE_LLM_REASONING_EFFORT: "off",
      },
    });
  });
});
