import { mount } from 'svelte';
import type { ExtensionToWebviewMessage } from '../types';
import App from './App.svelte';
import { dashboardState } from './lib/dashboardStore';
import { vscodeApi } from './lib/vscodeApi';

const appContainer = document.getElementById('app');

if (!appContainer) {
  throw new Error('App container not found.');
}

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  const message = event.data;
  if (message.type === 'dashboard/state') {
    dashboardState.set(message.payload);
  }
});

mount(App, {
  target: appContainer
});

vscodeApi.postMessage({ type: 'dashboard/ready' });

