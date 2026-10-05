export interface StackSelection {
  readonly profiles: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly models: readonly string[];
}

type Settings = Readonly<Record<string, string | undefined>>;

export const ALL_LOCAL_PROFILES = [
  "whisper", "whistle", "parakeet-tdt", "piper", "llm", "home-simulator", "home-api",
] as const;

export function serviceNamePrefix(directory: string): string {
  const name = directory.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return name === "sodalis" || name.startsWith("sodalis-")
    ? name : `sodalis-${name}`;
}

function endpoint(value: string | undefined, name: string, preserveTrailingSlash = false): string {
  if (!value?.trim()) throw new Error(`Set ${name} to an explicit HTTP endpoint.`);
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.hash) {
    throw new Error(`${name} must be an HTTP(S) URL without embedded credentials.`);
  }
  return preserveTrailingSlash && value.endsWith("/")
    ? url.toString() : url.toString().replace(/\/$/, "");
}

export function resolveStack(settings: Settings): StackSelection {
  const profiles: string[] = [];
  const models: string[] = [];
  const environment: Record<string, string> = {
    SODALIS_PORT: settings.SODALIS_PORT || "4176",
    HOME_ADMIN_FILE: settings.HOME_ADMIN_UI === "1"
      ? "Caddyfile.admin" : "Caddyfile.desktop",
    HOME_API_UPSTREAM: "home:3003",
    HOME_ASSISTANT_IMAGE: settings.HOME_ASSISTANT_IMAGE ||
      "ghcr.io/home-assistant/home-assistant:2026.9.4",
  };
  if (settings.HOME_ADMIN_UI && !["0", "1"].includes(settings.HOME_ADMIN_UI)) {
    throw new Error("HOME_ADMIN_UI must be 0 or 1.");
  }
  const stt = settings.STT_PROVIDER || "whisper-cpp";
  if (stt !== "whisper-cpp" && (settings.WHISPER_CPP_URL || settings.WHISPER_MODEL)) {
    throw new Error("WHISPER_CPP_URL and WHISPER_MODEL require STT_PROVIDER=whisper-cpp.");
  }
  if (stt !== "whistle" && settings.WHISTLE_URL) {
    throw new Error("WHISTLE_URL requires STT_PROVIDER=whistle.");
  }
  if (stt !== "parakeet-tdt" && settings.PARAKEET_TDT_URL) {
    throw new Error("PARAKEET_TDT_URL requires STT_PROVIDER=parakeet-tdt.");
  }
  if (stt === "whisper-cpp") {
    environment.STT_PROVIDER = stt;
    if (settings.WHISPER_MODEL && settings.WHISPER_CPP_URL) {
      throw new Error("WHISPER_MODEL requires a local Whisper.cpp profile.");
    }
    environment.WHISPER_CPP_URL = settings.WHISPER_CPP_URL
      ? endpoint(settings.WHISPER_CPP_URL, "WHISPER_CPP_URL")
      : "http://whisper:8080";
    if (!settings.WHISPER_CPP_URL) {
      const model = settings.WHISPER_MODEL || "ggml-base.bin";
      if (!/^ggml-[A-Za-z0-9._-]+\.bin$/.test(model)) {
        throw new Error("WHISPER_MODEL must name a ggml-*.bin file in models/whisper.");
      }
      environment.WHISPER_MODEL = model;
      profiles.push("whisper");
      models.push(`models/whisper/${model}`);
    }
  } else if (stt === "whistle") {
    environment.STT_PROVIDER = stt;
    environment.WHISTLE_URL = settings.WHISTLE_URL
      ? endpoint(settings.WHISTLE_URL, "WHISTLE_URL")
      : "http://whistle:8080";
    if (!settings.WHISTLE_URL) profiles.push("whistle");
  } else if (stt === "parakeet-tdt") {
    environment.STT_PROVIDER = stt;
    environment.PARAKEET_TDT_URL = settings.PARAKEET_TDT_URL
      ? endpoint(settings.PARAKEET_TDT_URL, "PARAKEET_TDT_URL")
      : "http://parakeet-tdt:8080";
    if (!settings.PARAKEET_TDT_URL) profiles.push("parakeet-tdt");
  } else if (stt === "mock") {
    environment.STT_PROVIDER = stt;
  } else throw new Error(`Unsupported STT_PROVIDER "${stt}".`);

  const tts = settings.TTS_PROVIDER || "piper";
  if (tts === "piper") {
    environment.TTS_PROVIDER = "piper-http";
    environment.PIPER_HTTP_URL = settings.PIPER_HTTP_URL
      ? endpoint(settings.PIPER_HTTP_URL, "PIPER_HTTP_URL", true)
      : "http://piper:5000";
    if (!settings.PIPER_HTTP_URL) {
      profiles.push("piper");
      models.push("models/piper/nl_BE-nathalie-medium.onnx");
      models.push("models/piper/nl_BE-nathalie-medium.onnx.json");
    }
  } else if (tts === "piper-http") {
    environment.TTS_PROVIDER = tts;
    environment.PIPER_HTTP_URL = endpoint(settings.PIPER_HTTP_URL, "PIPER_HTTP_URL", true);
  } else if (tts === "mock") {
    if (settings.PIPER_HTTP_URL) throw new Error("PIPER_HTTP_URL requires a Piper TTS provider.");
    environment.TTS_PROVIDER = tts;
  } else throw new Error(`Unsupported TTS_PROVIDER "${tts}".`);

  switch (settings.LLM_PROVIDER) {
    case "mock":
      if (settings.LLM_BASE_URL || settings.LLM_MODEL || settings.LLM_API_KEY) {
        throw new Error("LLM settings are not used by LLM_PROVIDER=mock.");
      }
      environment.LLM_PROVIDER = "mock";
      break;
    case "openai-compatible": {
      const model = settings.LLM_MODEL;
      if (!model?.trim()) throw new Error("Set LLM_MODEL for the selected LLM provider.");
      environment.LLM_PROVIDER = "openai-compatible";
      environment.LLM_MODEL = model;
      environment.LLM_API_KEY = settings.LLM_API_KEY || "";
      environment.LLM_BASE_URL = settings.LLM_BASE_URL
        ? endpoint(settings.LLM_BASE_URL, "LLM_BASE_URL")
        : "http://llm:8080/v1";
      if (!settings.LLM_BASE_URL) {
        if (!/^[A-Za-z0-9._-]+\.gguf$/.test(model)) {
          throw new Error("Local LLM_MODEL must name a .gguf file in models/llm.");
        }
        profiles.push("llm");
        models.push(`models/llm/${model}`);
      }
      break;
    }
    default:
      throw new Error(settings.LLM_PROVIDER
        ? `Unsupported LLM_PROVIDER "${settings.LLM_PROVIDER}".`
        : "Set LLM_PROVIDER to mock or openai-compatible.");
  }

  switch (settings.HOME_PROVIDER) {
    case "simulator":
      profiles.push("home-simulator");
      environment.HOME_PROVIDER = "simulator";
      environment.HOME_ASSISTANT_URL = "http://homeassistant:8123";
      if (settings.HOME_API_URL) throw new Error("HOME_API_URL requires HOME_PROVIDER=external-api.");
      if (settings.HOME_ASSISTANT_TOKEN?.trim()) {
        environment.HOME_ASSISTANT_TOKEN = settings.HOME_ASSISTANT_TOKEN;
        profiles.push("home-api");
      } else if (settings.HOME_ADMIN_UI !== "1") {
        throw new Error("Set HOME_ASSISTANT_TOKEN after onboarding, or HOME_ADMIN_UI=1 for setup.");
      }
      break;
    case "external-api": {
      if (settings.HOME_ADMIN_UI === "1") {
        throw new Error("HOME_ADMIN_UI requires HOME_PROVIDER=simulator.");
      }
      environment.HOME_API_UPSTREAM = endpoint(settings.HOME_API_URL, "HOME_API_URL");
      const homeUrl = new URL(environment.HOME_API_UPSTREAM);
      if (homeUrl.pathname !== "/" || homeUrl.search) {
        throw new Error("HOME_API_URL must be an origin without a path or query.");
      }
      break;
    }
    default:
      throw new Error(settings.HOME_PROVIDER
        ? `Unsupported HOME_PROVIDER "${settings.HOME_PROVIDER}".`
        : "Set HOME_PROVIDER to simulator or external-api.");
  }
  return { profiles, environment, models };
}
