import { io, type Socket } from "socket.io-client";
import type { EventRecord, Settings, UserPresence } from "@slopify/shared";

export type SyncClientOptions = {
  onRemoteEvents: (events: EventRecord[]) => Promise<void>;
  onProjectHint: (projectId: string) => Promise<void>;
  onConnectionChanged: (connected: boolean) => void;
  onPresenceChanged: (projectId: string, presence: UserPresence[]) => void;
};

export type SyncIdentity = {
  userId: string;
  settings: Settings;
  serverAccessPassword: string;
};

const emitWithAck = <T>(
  socket: Socket,
  eventName: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${eventName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.timeout(timeoutMs).emit(eventName, payload, (error: Error | null, response?: T) => {
      clearTimeout(timer);
      if (error !== null) {
        reject(error);
        return;
      }
      if (response === undefined) {
        reject(new Error(`${eventName} returned no response`));
        return;
      }
      resolve(response);
    });
  });

export class SyncClient {
  private socket: Socket | null = null;

  private connectInFlight: Promise<boolean> | null = null;

  private identityFingerprint: string | null = null;

  public constructor(private readonly options: SyncClientOptions) {}

  public connect(identity: SyncIdentity): void {
    const fingerprint = this.fingerprint(identity);

    if (this.socket !== null && this.identityFingerprint === fingerprint) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return;
    }

    this.disconnect();
    this.identityFingerprint = fingerprint;

    const socket = io(identity.settings.serverUrl, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 300,
      reconnectionDelayMax: 3000,
      auth: {
        userId: identity.userId,
        displayName: identity.settings.displayName,
        avatarUrl: identity.settings.avatarUrl,
        serverAccessPassword: identity.serverAccessPassword,
      },
      timeout: 5000,
    });

    socket.on("connect", () => {
      this.options.onConnectionChanged(true);
      this.connectInFlight = null;
    });

    socket.on("disconnect", () => {
      this.options.onConnectionChanged(false);
      this.connectInFlight = null;
    });

    socket.on("connect_error", () => {
      this.options.onConnectionChanged(false);
      this.connectInFlight = null;
    });

    socket.on("sync:event", async (payload: { projectId: string }) => {
      await this.options.onProjectHint(payload.projectId);
    });

    socket.on("sync:events", async (payload: { events: EventRecord[] }) => {
      await this.options.onRemoteEvents(payload.events);
    });

    socket.on("presence:status", (payload: { projectId: string; presence: UserPresence[] }) => {
      this.options.onPresenceChanged(payload.projectId, payload.presence);
    });

    this.socket = socket;
    this.socket.connect();
  }

  public disconnect(): void {
    this.connectInFlight = null;
    this.identityFingerprint = null;

    if (this.socket !== null) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }

    this.options.onConnectionChanged(false);
  }

  public resetInFlight(): void {
    this.connectInFlight = null;
  }

  public get connected(): boolean {
    return this.socket?.connected === true;
  }

  public async ensureConnected(timeoutMs: number): Promise<boolean> {
    if (this.socket === null) {
      return false;
    }

    if (this.socket.connected) {
      return true;
    }

    if (this.connectInFlight !== null) {
      return await this.connectInFlight;
    }

    this.connectInFlight = new Promise<boolean>((resolve) => {
      if (this.socket === null) {
        resolve(false);
        return;
      }

      let settled = false;

      const cleanup = (): void => {
        if (this.socket === null) {
          return;
        }
        this.socket.off("connect", onConnect);
        this.socket.off("connect_error", onError);
      };

      const settle = (value: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(value);
      };

      const onConnect = (): void => {
        settle(true);
      };

      const onError = (): void => {
        settle(false);
      };

      const timer = setTimeout(() => {
        settle(false);
      }, timeoutMs);

      this.socket.on("connect", onConnect);
      this.socket.on("connect_error", onError);

      if (!this.socket.connected) {
        this.socket.connect();
      }
    }).finally(() => {
      this.connectInFlight = null;
    });

    return await this.connectInFlight;
  }

  public async pull(input: {
    projectIds: string[];
    since: number;
    serverAccessPassword: string;
  }): Promise<{ events: EventRecord[]; cursor: number }> {
    if (this.socket === null) {
      return { events: [], cursor: input.since };
    }

    const connected = await this.ensureConnected(5000);
    if (!connected || this.socket === null) {
      return { events: [], cursor: input.since };
    }

    const response = await emitWithAck<{ events: EventRecord[]; cursor?: number }>(
      this.socket,
      "sync:pull",
      {
        projectIds: input.projectIds,
        since: input.since,
        serverAccessPassword: input.serverAccessPassword,
      },
      10000,
    );

    return { events: response.events, cursor: response.cursor ?? input.since };
  }

  public async push(input: {
    events: EventRecord[];
    serverAccessPassword: string;
  }): Promise<string[]> {
    if (this.socket === null || input.events.length === 0) {
      return [];
    }

    const connected = await this.ensureConnected(5000);
    if (!connected || this.socket === null) {
      return [];
    }

    const response = await emitWithAck<{ acceptedIds: string[] }>(
      this.socket,
      "sync:push",
      {
        events: input.events,
        serverAccessPassword: input.serverAccessPassword,
      },
      10000,
    );

    return response.acceptedIds;
  }

  public updatePresence(status: "online" | "away"): void {
    if (this.socket?.connected) {
      this.socket.emit("presence:update", { status });
    }
  }

  public async getPresence(projectId: string): Promise<UserPresence[]> {
    if (this.socket === null || !this.socket.connected) {
      return [];
    }
    const response = await emitWithAck<{ presence: UserPresence[] }>(
      this.socket,
      "presence:list",
      { projectId },
      5000,
    );
    return response.presence;
  }

  private fingerprint(identity: SyncIdentity): string {
    return [
      identity.userId,
      identity.settings.displayName,
      identity.settings.avatarUrl ?? "",
      identity.settings.serverUrl,
      identity.serverAccessPassword,
    ].join("|");
  }
}
