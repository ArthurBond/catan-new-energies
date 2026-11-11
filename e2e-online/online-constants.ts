/** Shared by the Playwright config and the online-link spec. */
export const ONLINE_GAME_PORT = 3297;
/** The stand-in for Tailscale Funnel listens here with HTTPS (see `fake-tailscale.mjs`). */
export const ONLINE_PUBLIC_PORT = 3298;
export const ONLINE_PUBLIC_URL = `https://localhost:${ONLINE_PUBLIC_PORT}`;
export const ONLINE_HOST_URL = `http://localhost:${ONLINE_GAME_PORT}`;
export const ONLINE_INVITE_CODE = 'PLAY2GETHER';
export const ONLINE_INVITE_CODE_SHOWN = 'PLAY-2GETHER';
