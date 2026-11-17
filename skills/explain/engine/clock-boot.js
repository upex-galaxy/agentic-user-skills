// Side-effect module: the page entry imports this FIRST so the shim is live before any scene code runs.
import { installClock } from './clock.js';

installClock();
