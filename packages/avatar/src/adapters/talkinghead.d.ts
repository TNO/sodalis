declare module "@met4citizen/talkinghead" {
  import type { Camera, Scene } from "three";

  export class TalkingHead {
    constructor(
      nodeAvatar: HTMLElement,
      options: {
        avatarOnly: true;
        avatarOnlyScene: Scene;
        avatarOnlyCamera: Camera;
        avatarMute: true;
        cameraRotateEnable: false;
        cameraPanEnable: false;
        cameraZoomEnable: false;
        avatarIdleEyeContact: number;
        avatarIdleHeadMove: number;
        avatarSpeakingEyeContact: number;
        avatarSpeakingHeadMove: number;
      },
    );
    opt: {
      avatarIdleHeadMove: number;
      avatarSpeakingHeadMove: number;
    };
    showAvatar(avatar: {
      url: string;
      avatarMood: string;
      avatarMute: true;
    }): Promise<void>;
    animate(deltaMilliseconds: number): void;
    setMood(mood: string): void;
    setValue(morph: string, value: number, durationMilliseconds?: number): void;
    makeEyeContact(durationMilliseconds: number): void;
    lookAt(x: number, y: number, durationMilliseconds: number): void;
    lookAtCamera(durationMilliseconds: number): void;
    lookAhead(durationMilliseconds: number): void;
    playGesture(
      name: string,
      durationSeconds?: number,
      mirror?: boolean,
      transitionMilliseconds?: number,
    ): void;
    stopGesture(transitionMilliseconds?: number): void;
    dispose(): void;
  }
}
