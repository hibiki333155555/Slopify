import Fastify from "fastify";
import { Server } from "socket.io";
import { z } from "zod";
import { eventSchema, type EventRecord } from "@slopify/shared";
import { createServerDb } from "./db.js";
import { SyncRepository } from "./repository.js";

const authCheckSchema = z.object({
  serverAccessPassword: z.string().min(1),
});

const createInviteSchema = z.object({
  projectId: z.string().min(1),
  requesterUserId: z.string().min(1),
  serverAccessPassword: z.string().min(1),
});

const joinInviteSchema = z.object({
  inviteCode: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1),
  avatarUrl: z.string().nullable().optional(),
  serverAccessPassword: z.string().min(1),
});

const pullSchema = z.object({
  projectIds: z.array(z.string().min(1)),
  since: z.number().int().nonnegative(),
  serverAccessPassword: z.string().min(1),
});

const pushSchema = z.object({
  events: z.array(eventSchema),
  serverAccessPassword: z.string().min(1),
});

const start = async (): Promise<void> => {
  const { pool, config } = await createServerDb();
  const repository = new SyncRepository(pool);

  const fastify = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

  fastify.get("/health", async () => ({ ok: true }));

  fastify.post("/auth/check", async (request, reply) => {
    const body = authCheckSchema.parse(request.body);
    if (body.serverAccessPassword !== config.serverAccessPassword) {
      reply.status(401);
      return { ok: false };
    }
    return { ok: true };
  });

  fastify.post("/invites/create", async (request, reply) => {
    const body = createInviteSchema.parse(request.body);
    if (body.serverAccessPassword !== config.serverAccessPassword) {
      reply.status(401);
      return { error: "Unauthorized" };
    }
    const inviteCode = await repository.createInvite(body.projectId, body.requesterUserId);
    return { inviteCode };
  });

  fastify.post("/invites/join", async (request, reply) => {
    const body = joinInviteSchema.parse(request.body);
    if (body.serverAccessPassword !== config.serverAccessPassword) {
      reply.status(401);
      return { error: "Unauthorized" };
    }

    const joined = await repository.joinByInvite({
      inviteCode: body.inviteCode,
      user: {
        userId: body.userId,
        displayName: body.displayName,
        avatarUrl: body.avatarUrl ?? null,
      },
    });

    return joined;
  });

  const io = new Server(fastify.server, {
    cors: {
      origin: "*",
    },
    maxHttpBufferSize: 50e6, // 50 MB — needed for base64 image payloads
  });

  io.use(async (socket, next) => {
    try {
      const auth = z
        .object({
          userId: z.string().min(1),
          displayName: z.string().min(1),
          avatarUrl: z.string().nullable().optional(),
          serverAccessPassword: z.string().min(1),
        })
        .parse(socket.handshake.auth);

      if (auth.serverAccessPassword !== config.serverAccessPassword) {
        next(new Error("Unauthorized"));
        return;
      }

      await repository.upsertUser({
        userId: auth.userId,
        displayName: auth.displayName,
        avatarUrl: auth.avatarUrl ?? null,
      });

      socket.data.userId = auth.userId;
      socket.data.serverAccessPassword = auth.serverAccessPassword;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Invalid auth"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = z.string().parse(socket.data.userId);
    const memberProjectIds = await repository.listProjectIdsForUser(userId);
    console.log(`[socket.io] connected: userId=${userId} projects=[${memberProjectIds.join(",")}] socketId=${socket.id}`);
    for (const projectId of memberProjectIds) {
      socket.join(`project:${projectId}`);
    }

    socket.on("disconnect", (reason) => {
      console.log(`[socket.io] disconnected: userId=${userId} reason=${reason}`);
    });

    socket.on("sync:pull", async (rawPayload: unknown, ack: (response: { events: EventRecord[]; cursor?: number }) => void) => {
      try {
        const payload = pullSchema.parse(rawPayload);
        if (payload.serverAccessPassword !== config.serverAccessPassword) {
          console.log(`[socket.io] pull UNAUTHORIZED: userId=${userId}`);
          ack({ events: [] });
          return;
        }

        for (const projectId of payload.projectIds) {
          socket.join(`project:${projectId}`);
        }

        const result = await repository.pullEvents(payload.projectIds, payload.since);
        console.log(`[socket.io] pull: userId=${userId} projects=[${payload.projectIds.join(",")}] since=${payload.since} returned=${result.events.length} cursor=${result.cursor}`);
        ack({ events: result.events, cursor: result.cursor });
      } catch (err) {
        console.error(`[socket.io] pull ERROR: userId=${userId}`, err);
        ack({ events: [] });
      }
    });

    socket.on("sync:push", async (rawPayload: unknown, ack: (response: { acceptedIds: string[] }) => void) => {
      try {
        const payload = pushSchema.parse(rawPayload);
        if (payload.serverAccessPassword !== config.serverAccessPassword) {
          console.log(`[socket.io] push UNAUTHORIZED: userId=${userId}`);
          ack({ acceptedIds: [] });
          return;
        }

        console.log(`[socket.io] push: userId=${userId} events=${payload.events.length} types=[${payload.events.map((e) => e.type).join(",")}]`);
        const acceptedIds = await repository.pushEvents(payload.events);
        console.log(`[socket.io] push accepted: ${acceptedIds.length}/${payload.events.length}`);
        ack({ acceptedIds });

        const acceptedSet = new Set(acceptedIds);
        const acceptedEvents = payload.events.filter((event) => acceptedSet.has(event.id));

        const byProject = new Map<string, EventRecord[]>();
        for (const event of acceptedEvents) {
          if (!byProject.has(event.projectId)) {
            byProject.set(event.projectId, []);
          }
          byProject.get(event.projectId)?.push(event);
        }

        for (const [projectId, projectEvents] of byProject.entries()) {
          const roomSize = io.sockets.adapter.rooms.get(`project:${projectId}`)?.size ?? 0;
          console.log(`[socket.io] broadcast: project=${projectId} events=${projectEvents.length} roomSize=${roomSize}`);
          io.to(`project:${projectId}`).emit("sync:event", { projectId });
          io.to(`project:${projectId}`).emit("sync:events", { events: projectEvents });
        }
      } catch (err) {
        console.error(`[socket.io] push ERROR: userId=${userId}`, err);
        ack({ acceptedIds: [] });
      }
    });
  });

  await fastify.listen({ port: config.port, host: "0.0.0.0" });
};

void start();
