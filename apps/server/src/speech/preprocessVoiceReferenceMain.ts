import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { preprocessVoiceReference } from "./preprocessVoiceReference.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const forwardedArgs = args[0] === "--" ? args.slice(1) : args;
  const [input, output, extra] = forwardedArgs;
  if (!input || !output || extra) {
    throw new Error(
      "Usage: pnpm --filter @sodalis/server preprocess:voice-reference -- <input-audio> <output.wav>",
    );
  }
  await preprocessVoiceReference(input, output);
  console.log(`Prepared reference WAV: ${resolve(output)}`);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
