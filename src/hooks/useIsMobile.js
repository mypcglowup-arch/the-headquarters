// Backward-compat shim — the canonical hook is useScreenSize.js (3-bucket).
// Keep this file so older imports (`import { useIsMobile } from '../hooks/useIsMobile.js'`)
// continue to work without a sweeping refactor.
export { useIsMobile, useScreenSize, useIsTablet, useIsDesktop } from './useScreenSize.js';
export { default } from './useScreenSize.js';
