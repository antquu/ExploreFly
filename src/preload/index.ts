/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';

export type Media = { name: string; url: string; kind: 'image' | 'video' | 'page' };
export type Frame = { width: number; height: number; data: Uint8Array };
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string };

// Subscribes to a main-process channel and returns the unsubscribe function
function on<T>(channel: string, fn: (payload: T) => void) {
  const listener = (_e: unknown, payload: T) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api = {
  pickFile: (): Promise<Media | null> => ipcRenderer.invoke('file:pick'),
  describeFile: (file: File): Promise<Media> => ipcRenderer.invoke('file:describe', webUtils.getPathForFile(file)),
  saveFile: (name: string, text: string): Promise<boolean> => ipcRenderer.invoke('file:save', name, text),
  capture: (id: number, width: number): Promise<Frame | null> => ipcRenderer.invoke('view:capture', id, width),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open', url),
  platform: process.platform,

  // Statistics window: the main window owns the history, the stats window displays it
  stats: {
    open: (): Promise<void> => ipcRenderer.invoke('stats:open'),
    push: (payload: unknown) => ipcRenderer.send('stats:push', payload),
    request: () => ipcRenderer.send('stats:request'),
    command: (cmd: string) => ipcRenderer.send('stats:command', cmd),
    onData: <T>(fn: (payload: T) => void) => on('stats:data', fn),
    onRequest: (fn: () => void) => on('stats:request', fn),
    onCommand: (fn: (cmd: string) => void) => on('stats:command', fn),
    onState: (fn: (open: boolean) => void) => on('stats:state', fn),
  },

  update: {
    onStatus: (fn: (s: UpdateStatus) => void) => on('update:status', fn),
    current: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:current'),
    install: () => ipcRenderer.invoke('update:install'),
  },
};

contextBridge.exposeInMainWorld('fly', api);

export type FlyApi = typeof api;
