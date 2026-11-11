/** Shared by the Playwright config and the online-link spec. */
export const ONLINE_GAME_PORT = 3297;
/** The stand-in for Tailscale Funnel listens here with HTTPS (see `fake-tailscale.mjs`). */
export const ONLINE_PUBLIC_PORT = 3298;
export const ONLINE_PUBLIC_URL = `https://localhost:${ONLINE_PUBLIC_PORT}`;
export const ONLINE_HOST_URL = `http://localhost:${ONLINE_GAME_PORT}`;
export const ONLINE_INVITE_CODE = 'PLAY2GETHER';
export const ONLINE_INVITE_CODE_SHOWN = 'PLAY-2GETHER';
/**
 * Delay each way through the stand-in tunnel, in milliseconds. 150 each way is a 300 ms round
 * trip: a friend on mobile data on the other side of the world.
 */
export const ONLINE_LINK_LATENCY_MS = 150;
