import { serveService } from "../serve.js";
import { createHomeApp } from "./app.js";
import { HomeAssistantClient } from "./client.js";

if (process.env.HOME_PROVIDER !== "simulator") {
  throw new Error("Set HOME_PROVIDER=simulator; other Home providers are not available yet.");
}
if (!process.env.HOME_ASSISTANT_URL?.trim()) {
  throw new Error("Set HOME_ASSISTANT_URL for the Home Assistant Core simulator.");
}
const client = new HomeAssistantClient({
  baseUrl: process.env.HOME_ASSISTANT_URL,
  token: process.env.HOME_ASSISTANT_TOKEN ?? "",
});
const minTemperature = process.env.HOME_SAFE_MIN_C === undefined
  ? 16 : Number(process.env.HOME_SAFE_MIN_C);
const maxTemperature = process.env.HOME_SAFE_MAX_C === undefined
  ? 26 : Number(process.env.HOME_SAFE_MAX_C);
serveService(createHomeApp(client, { minTemperature, maxTemperature }), "Home", 3003);
