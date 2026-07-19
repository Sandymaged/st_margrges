import { sseManager } from './events.js';

let eventVersion = 0;

export function notifyProfileChanged(userId: string): void {
  eventVersion++;
  sseManager.broadcast(userId, {
    type: 'profile.updated',
    userId,
    version: eventVersion,
  });
}
