import { io, type Socket } from "socket.io-client";
import {
  serverSyncEventSchema,
  syncAckSchema,
  syncConnectionStateSchema,
  syncUpdatePayloadSchema,
  type ClientSyncEvent,
  type ServerSyncEvent,
  type SyncAck,
  type SyncConnectionState,
  type SyncUpdatePayload
} from "@slopify/shared";
import { LocalRepository } from "./repository.js";

type ClientToServerEvents = {
  "sync:joinProjects": (payload: { projectIds: string[] }) => void;
  "sync:pull": (payload: { projectId: string; lastPulledSeq: number }) => void;
  "sync:pushEvents": (payload: { events: ClientSyncEvent[] }) => void;
};

type ServerToClientEvents = {
  "sync:ack": (payload: { acks: SyncAck[] }) => void;
  "sync:events": (payload: { projectId: string; events: ServerSyncEvent[] }) => void;
  "presence:update": (payload: { projectId: string; onlineCount: number }) => void;
};

export class DesktopSyncClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private connected = false;
  private serverUrl = "http://127.0.0.1:4000";
  private readonly onlineCountByProject = new Map<string, number>();

  public constructor(
    private readonly repository: LocalRepository,
    private readonly onProjectUpdated: (payload: SyncUpdatePayload) => void
  ) {}

  public connect(): SyncConnectionState {
    const config = this.repository.getSyncConfig();
    if (!config) {
      return syncConnectionStateSchema.parse({
        connected: false,
        serverUrl: this.serverUrl
      });
    }

    this.serverUrl = config.serverUrl;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    const socket = io(config.serverUrl, {
      autoConnect: false,
      transports: ["websocket"],
      auth: {
        userId: config.userId,
        deviceId: config.deviceId
      }
    });
    this.socket = socket;
    this.bindSocket(socket);
    socket.connect();
    return this.status();
  }

  public disconnect(): SyncConnectionState {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    return this.status();
  }

  public status(): SyncConnectionState {
    return syncConnectionStateSchema.parse({
      connected: this.connected,
      serverUrl: this.serverUrl
    });
  }

  public getOnlineCount(projectId: string): number {
    return this.onlineCountByProject.get(projectId) ?? 0;
  }

  public flushPendingEvents(): void {
    if (!this.socket || !this.connected) {
      return;
    }
    const pending = this.repository.getPendingSyncEvents(500);
    if (pending.length === 0) {
      return;
    }
    this.socket.emit("sync:pushEvents", { events: pending });
  }

  public refreshProjectSubscriptions(): void {
    this.joinAndPull();
  }

  private bindSocket(socket: Socket<ServerToClientEvents, ClientToServerEvents>): void {
    socket.on("connect", () => {
      this.connected = true;
      this.joinAndPull();
      this.flushPendingEvents();
    });

    socket.on("disconnect", () => {
      this.connected = false;
    });

    socket.on("sync:ack", (payload) => {
      const acks = payload.acks.map((ack) => syncAckSchema.parse(ack));
      this.repository.markAckedEvents(acks);
      for (const ack of acks) {
        this.onProjectUpdated(syncUpdatePayloadSchema.parse({ projectId: ack.projectId }));
      }
    });

    socket.on("sync:events", (payload) => {
      const events = payload.events.map((event) => serverSyncEventSchema.parse(event));
      const touched = this.repository.applyRemoteEvents(events);
      for (const projectId of touched) {
        this.onProjectUpdated(syncUpdatePayloadSchema.parse({ projectId }));
      }
    });

    socket.on("presence:update", (payload) => {
      this.onlineCountByProject.set(payload.projectId, payload.onlineCount);
      this.onProjectUpdated(syncUpdatePayloadSchema.parse({ projectId: payload.projectId }));
    });
  }

  private joinAndPull(): void {
    if (!this.socket || !this.connected) {
      return;
    }
    const projectIds = this.repository.listProjectIds();
    if (projectIds.length === 0) {
      return;
    }

    this.socket.emit("sync:joinProjects", { projectIds });
    for (const projectId of projectIds) {
      this.socket.emit("sync:pull", {
        projectId,
        lastPulledSeq: this.repository.getLastPulledSeq(projectId)
      });
    }
  }
}
