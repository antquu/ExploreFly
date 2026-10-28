/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/// <reference types="vite/client" />

import type { FlyApi } from '../../preload';

declare global {
  interface Window {
    fly: FlyApi;
  }
}

export {};
