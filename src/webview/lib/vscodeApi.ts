import type { WebviewToExtensionMessage } from '../../types';

declare function acquireVsCodeApi(): { postMessage(message: WebviewToExtensionMessage): void };

class VsCodeApiWrapper {
  private api: { postMessage(message: WebviewToExtensionMessage): void } | undefined;

  constructor() {
    if (typeof acquireVsCodeApi === 'function') {
      this.api = acquireVsCodeApi();
    }
  }

  postMessage(message: WebviewToExtensionMessage) {
    if (this.api) {
      this.api.postMessage(message);
    } else {
      console.log('Mock postMessage:', message);
    }
  }
}

export const vscodeApi = new VsCodeApiWrapper();
