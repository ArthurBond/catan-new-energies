/**
 * Saves the table to `<savesDir>/current-game.json` after every change and keeps the host key in
 * `<savesDir>/host-key.txt`, so a server restart resumes the game, seat tokens and host link.
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SavedRoom } from './room';

export const SAVE_FILE_NAME = 'current-game.json';
export const HOST_KEY_FILE_NAME = 'host-key.txt';

export interface RoomStore {
  readonly savesDir: string;
  load(): SavedRoom | null;
  save(snapshot: SavedRoom): void;
  /** Reads the host key, creating and storing a new random one on first use. */
  hostKey(): string;
}

export function createFileStore(savesDir: string, log: (m: string) => void = () => {}): RoomStore {
  const savePath = path.join(savesDir, SAVE_FILE_NAME);
  const keyPath = path.join(savesDir, HOST_KEY_FILE_NAME);
  const ensureDir = () => fs.mkdirSync(savesDir, { recursive: true });

  return {
    savesDir,

    load() {
      let raw: string;
      try {
        raw = fs.readFileSync(savePath, 'utf8');
      } catch {
        return null;
      }
      try {
        const parsed = JSON.parse(raw) as SavedRoom;
        if (parsed?.format !== 1 || !parsed.config) throw new Error('unknown save format');
        return parsed;
      } catch (e) {
        // Keep the unreadable file for inspection and start fresh.
        const backup = `${savePath}.broken-${Date.now()}`;
        try {
          fs.renameSync(savePath, backup);
        } catch {
          /* ignore */
        }
        log(`Could not read ${savePath} (${e instanceof Error ? e.message : e}); moved it to ${backup}.`);
        return null;
      }
    },

    save(snapshot) {
      ensureDir();
      const json = JSON.stringify(snapshot);
      const tmp = `${savePath}.tmp`;
      try {
        fs.writeFileSync(tmp, json, 'utf8');
        fs.renameSync(tmp, savePath);
      } catch {
        // Windows can refuse the rename while another process (e.g. antivirus) has the file open.
        fs.writeFileSync(savePath, json, 'utf8');
      }
    },

    hostKey() {
      try {
        const key = fs.readFileSync(keyPath, 'utf8').trim();
        if (/^[A-Za-z0-9_-]{8,}$/.test(key)) return key;
      } catch {
        /* create below */
      }
      ensureDir();
      const key = randomBytes(12).toString('base64url');
      fs.writeFileSync(keyPath, `${key}\n`, 'utf8');
      return key;
    },
  };
}
