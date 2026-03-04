import Fastify from "fastify";
import { Server as SocketIoServer } from "socket.io";
import { z } from "zod";
import {
  clientSyncEventSchema,
  parsePayloadForEventType,
  serverSyncEventSchema,
  syncAckSchema,
  ulidSchema
} from "@slopify/shared";
import { initializeDatabase, pool } from "./db.js";
import { SyncRepository } from "./repository.js";

const fastify = Fastify({ logger: true });
const repository = new SyncRepository(pool);

const io = new SocketIoServer(fastify.server, {
  cors: {
    origin: "*"
  }
});

const socketAuthSchema = z.object({
  userId: ulidSchema,
  deviceId: ulidSchema
});

const syncJoinProjectsSchema = z.object({
  projectIds: z.array(ulidSchema).max(1000)
});

const syncPullSchema = z.object({
  projectId: ulidSchema,
  lastPulledSeq: z.number().int().nonnegative()
});

const syncPushSchema = z.object({
  events: z.array(clientSyncEventSchema).max(500)
});

const createInviteBodySchema = z.object({
  projectId: ulidSchema,
  userId: ulidSchema,
  expiresInDays: z.number().int().min(1).max(30).default(7)
});

const joinInviteBodySchema = z.object({
  code: z.string().min(5).max(64),
  userId: ulidSchema
});

function emitPresence(projectId: string): void {
  const count = io.sockets.adapter.rooms.get(projectId)?.size ?? 0;
  io.to(projectId).emit("presence:update", {
    projectId,
    onlineCount: count
  });
}

fastify.get("/health", async () => ({ ok: true }));

fastify.post("/invites", async (request, reply) => {
  const parsed = createInviteBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }
  const result = await repository.createInvite(parsed.data.projectId, parsed.data.userId, parsed.data.expiresInDays);
  return reply.send(result);
});

fastify.post("/invites/join", async (request, reply) => {
  const parsed = joinInviteBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }

  try {
    const result = await repository.joinByInvite(parsed.data.code, parsed.data.userId);
    return reply.send(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Join failed";
    return reply.status(400).send({ error: message });
  }
});

io.on("connection", (socket) => {
  const authParsed = socketAuthSchema.safeParse(socket.handshake.auth);
  if (!authParsed.success) {
    socket.disconnect(true);
    return;
  }
  const auth = authParsed.data;

  socket.on("sync:joinProjects", async (rawPayload) => {
    const parsed = syncJoinProjectsSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }

    for (const projectId of parsed.data.projectIds) {
      const member = await repository.isMember(projectId, auth.userId);
      if (!member) {
        continue;
      }
      await socket.join(projectId);
      emitPresence(projectId);
    }
  });

  socket.on("sync:pull", async (rawPayload) => {
    const parsed = syncPullSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }
    const member = await repository.isMember(parsed.data.projectId, auth.userId);
    if (!member) {
      return;
    }
    const events = await repository.pullEvents(parsed.data.projectId, parsed.data.lastPulledSeq);
    socket.emit("sync:events", {
      projectId: parsed.data.projectId,
      events
    });
  });

  socket.on("sync:pushEvents", async (rawPayload) => {
    const parsed = syncPushSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }

    const accepted: Array<z.infer<typeof clientSyncEventSchema>> = [];
    for (const event of parsed.data.events) {
      if (event.actorUserId !== auth.userId) {
        continue;
      }
      if (event.eventType !== "project.created") {
        const member = await repository.isMember(event.projectId, auth.userId);
        if (!member) {
          continue;
        }
      } else {
        parsePayloadForEventType(event.eventType, event.payload);
      }
      accepted.push(event);
    }

    if (accepted.length === 0) {
      return;
    }

    const result = await repository.appendClientEvents(accepted);
    const acks = result.acks.map((ack) => syncAckSchema.parse(ack));
    socket.emit("sync:ack", { acks });

    for (const [projectId, events] of result.insertedByProject.entries()) {
      const normalizedEvents = events.map((event) => serverSyncEventSchema.parse(event));
      io.to(projectId).emit("sync:events", {
        projectId,
        events: normalizedEvents
      });
      emitPresence(projectId);
    }
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms).filter((roomId) => roomId !== socket.id);
    queueMicrotask(() => {
      for (const projectId of rooms) {
        emitPresence(projectId);
      }
    });
  });
});

async function bootstrap(): Promise<void> {
  await initializeDatabase();

  const port = Number(process.env.SYNC_PORT ?? 4000);
  const host = process.env.SYNC_HOST ?? "0.0.0.0";
  await fastify.listen({ port, host });
}

bootstrap().catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
