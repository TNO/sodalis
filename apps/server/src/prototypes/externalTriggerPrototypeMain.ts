import { serveService } from "../serve.js";
import { createExternalTriggerPrototypeApp } from "./externalTriggerPrototype.js";

serveService(createExternalTriggerPrototypeApp(), "external trigger prototype", 3013);
