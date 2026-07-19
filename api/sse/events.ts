interface IResponse {
  write: (data: any) => boolean;
  on: (event: string, handler: (...args: any[]) => void) => void;
  destroy?: () => void;
}

interface SSEEvent {
  type: string;
  userId: string;
  version?: number;
  [key: string]: unknown;
}

interface SSEClient {
  id: string;
  res: IResponse;
  userId: string;
  connectedAt: Date;
}

class SSEManager {
  private clientsByUser: Map<string, Map<string, SSEClient>> = new Map();
  private totalConnections = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly MAX_CLIENT_AGE_MS = 24 * 60 * 60 * 1000;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupStale(), this.CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  private getClients(userId: string): Map<string, SSEClient> {
    let clients = this.clientsByUser.get(userId);
    if (!clients) {
      clients = new Map();
      this.clientsByUser.set(userId, clients);
    }
    return clients;
  }

  addClient(userId: string, client: SSEClient): void {
    const clients = this.getClients(userId);

    const existing = clients.get(client.id);
    if (existing) {
      return;
    }

    clients.set(client.id, client);
    this.totalConnections++;
  }

  removeClient(userId: string, client: SSEClient): void {
    const clients = this.clientsByUser.get(userId);
    if (!clients) return;

    const removed = clients.delete(client.id);
    if (removed) {
      this.totalConnections--;
    }

    if (clients.size === 0) {
      this.clientsByUser.delete(userId);
    }
  }

  broadcast(userId: string, event: SSEEvent): void {
    const clients = this.clientsByUser.get(userId);
    if (!clients || clients.size === 0) return;

    const data = `data: ${JSON.stringify(event)}\n\n`;
    const deadClientIds: string[] = [];

    for (const [id, client] of clients) {
      try {
        client.res.write(data);
      } catch {
        deadClientIds.push(id);
      }
    }

    for (const id of deadClientIds) {
      const deadClient = clients.get(id);
      if (deadClient) {
        this.removeClient(userId, deadClient);
      }
    }
  }

  private cleanupStale(): void {
    const now = Date.now();

    for (const [userId, clients] of this.clientsByUser) {
      const staleIds: string[] = [];

      for (const [id, client] of clients) {
        const age = now - client.connectedAt.getTime();

        if (age > this.MAX_CLIENT_AGE_MS) {
          staleIds.push(id);
          try {
            client.res.destroy?.();
          } catch {
            // ignore destroy errors
          }
        }
      }

      for (const id of staleIds) {
        const stale = clients.get(id);
        if (stale) {
          this.removeClient(userId, stale);
        }
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const [, clients] of this.clientsByUser) {
      for (const [, client] of clients) {
        try {
          client.res.destroy?.();
        } catch {
          // ignore destroy errors
        }
      }
    }

    this.clientsByUser.clear();
    this.totalConnections = 0;
  }

  getStats(): { totalConnections: number; uniqueUsers: number } {
    return {
      totalConnections: this.totalConnections,
      uniqueUsers: this.clientsByUser.size,
    };
  }
}

export const sseManager = new SSEManager();
