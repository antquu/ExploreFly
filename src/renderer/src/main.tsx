/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import App from './App';
import StatsApp from './views/StatsApp';

// The same bundle serves the main window and the statistics window (#stats)
const Root = location.hash === '#stats' ? StatsApp : App;

createRoot(document.getElementById('root')!).render(<Root />);
