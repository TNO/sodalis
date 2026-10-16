import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import type { PcmRecognizerFactory } from "./AzureRealtimeSttEngine.js";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** Azure Speech continuous recognition fed through a 16 kHz PCM16 push stream. */
export const createAzureSpeechRecognizer: PcmRecognizerFactory = (
  { endpoint, key, language },
  events,
) => {
  const speechConfig = sdk.SpeechConfig.fromEndpoint(endpoint, key);
  speechConfig.speechRecognitionLanguage = language;
  const audio = sdk.AudioInputStream.createPushStream(
    sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1),
  );
  const recognizer = new sdk.SpeechRecognizer(
    speechConfig,
    sdk.AudioConfig.fromStreamInput(audio),
  );
  recognizer.recognizing = (_sender, event) => events.recognizing(event.result.text);
  recognizer.recognized = (_sender, event) => {
    if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
      events.recognized(event.result.text);
    }
  };
  recognizer.canceled = (_sender, event) => {
    if (event.reason === sdk.CancellationReason.Error) {
      events.failed(new Error(
        `${sdk.CancellationErrorCode[event.errorCode]}: ${event.errorDetails}`,
      ));
    }
  };
  recognizer.sessionStopped = () => events.stopped();
  recognizer.startContinuousRecognitionAsync(
    undefined,
    (error) => events.failed(new Error(error)),
  );
  let audioClosed = false;
  let closed: Promise<void> | undefined;
  return {
    write(pcm) {
      if (!audioClosed) audio.write(toArrayBuffer(pcm));
    },
    endAudio() {
      if (audioClosed) return;
      audioClosed = true;
      audio.close();
    },
    close() {
      closed ??= new Promise<void>((resolve) => {
        const dispose = () => recognizer.close(resolve, () => resolve());
        recognizer.stopContinuousRecognitionAsync(dispose, dispose);
      });
      return closed;
    },
  };
};
