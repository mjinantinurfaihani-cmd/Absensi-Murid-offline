declare module '@zxing/browser' {
  export interface VideoInputDevice {
    deviceId: string;
    groupId: string;
    kind: 'videoinput';
    label: string;
    toJSON(): unknown;
  }

  export interface ScanResult {
    getText(): string;
  }

  export interface ScannerControls {
    stop(): void;
  }

  export class BrowserMultiFormatReader {
    static listVideoInputDevices(): Promise<VideoInputDevice[]>;
    decodeFromConstraints(
      constraints: MediaStreamConstraints,
      element: HTMLVideoElement,
      callback: (result: ScanResult | undefined, error?: unknown, controls?: ScannerControls) => void
    ): Promise<ScannerControls>;
  }
}
