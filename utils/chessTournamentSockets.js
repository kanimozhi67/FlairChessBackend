
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Chess } from "chess.js";
import {
  recordTournamentGameResult,
} from "../services/chessTournamentAutomation.js";
import ChessTournament from "../models/ChessTournament.js";
import ChessTournamentGame from "../models/ChessTournamentGame.js";

const activeGames = new Map();
const DEFAULT_TIME_MS = 5 * 60 * 1000;

function idOf(value) {
  return value?._id?.toString?.() || value?.toString?.() || "";
}

function getToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (authToken) return authToken;

  const cookieHeader = socket.handshake.headers?.cookie || "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return [
          item.slice(0, index),
          decodeURIComponent(item.slice(index + 1)),
        ];
      })
      .filter(([key]) => key)
  );

  return cookies.token || cookies.accessToken || null;
}

function getActorFromToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");

  const decoded = jwt.verify(token, secret);
  const userId =
    decoded.id || decoded.userId || decoded._id || decoded.sub;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    throw new Error("Invalid user identity");
  }

  return {
    userId: String(userId),
    userModel:
      decoded.userModel || decoded.model || decoded.roleModel || null,
  };
}

function findTournamentPlayer(tournament, actor) {
  return tournament.players.find((player) => {
    if (idOf(player.userId) !== actor.userId) return false;

    if (
      actor.userModel &&
      player.userModel &&
      actor.userModel !== player.userModel
    ) {
      return false;
    }

    return !player.withdrawn;
  });
}

function getRound(tournament, roundNumber) {
  return tournament.rounds.find(
    (round) =>
      Number(round.roundNumber ?? round.number) === Number(roundNumber)
  );
}

function getPairing(round, pairingId) {
  return round?.pairings?.find(
    (pairing) => idOf(pairing._id) === String(pairingId)
  );
}

function resultForGame(game) {
  if (game.isCheckmate()) {
    return game.turn() === "b" ? "1-0" : "0-1";
  }

  if (game.isDraw()) return "1/2-1/2";

  return "pending";
}

/*
 * Calculate the live remaining time without changing the saved base time.
 * The database stores the time remaining at clockStartedAt.
 */
function getClockSnapshot(saved, now = Date.now()) {
  let whiteTimeMs = Number.isFinite(saved.whiteTimeMs)
    ? Math.max(0, saved.whiteTimeMs)
    : DEFAULT_TIME_MS;

  let blackTimeMs = Number.isFinite(saved.blackTimeMs)
    ? Math.max(0, saved.blackTimeMs)
    : DEFAULT_TIME_MS;

  const activeClock =
    saved.status === "active" ? saved.activeClock : null;

  if (activeClock && saved.clockStartedAt) {
    const startedAt = new Date(saved.clockStartedAt).getTime();
    const elapsed = Math.max(0, now - startedAt);

    if (activeClock === "w") {
      whiteTimeMs = Math.max(0, whiteTimeMs - elapsed);
    } else if (activeClock === "b") {
      blackTimeMs = Math.max(0, blackTimeMs - elapsed);
    }
  }

  return { whiteTimeMs, blackTimeMs, activeClock };
}

function publicState(game, saved) {
  const clocks = getClockSnapshot(saved);

  return {
    fen: game.fen(),
    moves: game.history(),
    turn: game.turn(),
    status: saved.status,
    result: saved.result,
    isCheck: game.isCheck(),
    isCheckmate: game.isCheckmate(),
    isDraw: game.isDraw(),
    gameOver: game.isGameOver(),
    whiteTimeMs: clocks.whiteTimeMs,
    blackTimeMs: clocks.blackTimeMs,
    activeClock: clocks.activeClock,
  };
}

async function loadGame(tournamentId, roundNumber, pairingId) {
  const key = `${tournamentId}:${roundNumber}:${pairingId}`;

  if (activeGames.has(key)) return activeGames.get(key);

  const saved = await ChessTournamentGame.findOne({
    tournamentId,
    roundNumber,
    pairingId,
  });

  if (!saved) {
    throw new Error("Match state has not been initialized");
  }

  const chess = new Chess(saved.fen === "start" ? undefined : saved.fen);

  const state = {
    chess,
    saved,
    key,
    lock: Promise.resolve(),
  };

  activeGames.set(key, state);
  return state;
}

export default function registerChessTournamentSockets(io) {
  io.use((socket, next) => {
    try {
      const token = getToken(socket);
      if (!token) return next(new Error("Authentication required"));

      socket.data.actor = getActorFromToken(token);
      next();
    } catch (error) {
      next(new Error(error.message || "Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("tournament:join-match", async (payload, ack = () => {}) => {
      try {
        const { tournamentId, roundNumber, pairingId } = payload || {};

        if (
          !mongoose.isValidObjectId(tournamentId) ||
          !mongoose.isValidObjectId(pairingId) ||
          !Number.isInteger(Number(roundNumber))
        ) {
          return ack({ ok: false, message: "Invalid match details." });
        }

        const tournament = await ChessTournament.findById(tournamentId);

        if (!tournament) {
          return ack({ ok: false, message: "Tournament not found." });
        }

        if (tournament.status !== "in-progress") {
          return ack({
            ok: false,
            message: "This tournament has not started.",
          });
        }

        const round = getRound(tournament, Number(roundNumber));

        if (!round || round.status !== "published") {
          return ack({
            ok: false,
            message: "This round has not been published.",
          });
        }

        const pairing = getPairing(round, pairingId);

        if (!pairing || pairing.status === "bye") {
          return ack({ ok: false, message: "Match not found." });
        }

        const actor = socket.data.actor;
        const player = findTournamentPlayer(tournament, actor);

        if (!player) {
          return ack({
            ok: false,
            message: "You are not registered for this tournament.",
          });
        }

        const playerId = idOf(player._id);
        const whitePlayerId = idOf(pairing.whitePlayer);
        const blackPlayerId = idOf(pairing.blackPlayer);

        if (playerId !== whitePlayerId && playerId !== blackPlayerId) {
          return ack({
            ok: false,
            message: "You are not assigned to this match.",
          });
        }

        const initialTimeMs =
          Math.max(1, Number(tournament.timeControlMinutes) || 5) *
          60 *
          1000;

        const saved = await ChessTournamentGame.findOneAndUpdate(
          { tournamentId, roundNumber: Number(roundNumber), pairingId },
          {
            $setOnInsert: {
              tournamentId,
              roundNumber: Number(roundNumber),
              pairingId,
              whitePlayerId,
              blackPlayerId,
              fen: "start",
              status: "active",
              result: "pending",
              whiteTimeMs: initialTimeMs,
              blackTimeMs: initialTimeMs,
              activeClock: "w",
              clockStartedAt: new Date(),
            },
          },
          { new: true, upsert: true }
        );

        const state = await loadGame(
          tournamentId,
          Number(roundNumber),
          pairingId
        );

        state.saved = saved;

        // Add clock fields to older matches that predate the timer.
        let needsSave = false;

        if (!Number.isFinite(state.saved.whiteTimeMs)) {
          state.saved.whiteTimeMs = initialTimeMs;
          needsSave = true;
        }

        if (!Number.isFinite(state.saved.blackTimeMs)) {
          state.saved.blackTimeMs = initialTimeMs;
          needsSave = true;
        }

        if (state.saved.status === "active" && !state.saved.activeClock) {
          state.saved.activeClock = state.chess.turn();
          needsSave = true;
        }

        if (state.saved.status === "active" && !state.saved.clockStartedAt) {
          state.saved.clockStartedAt = new Date();
          needsSave = true;
        }

        if (needsSave) await state.saved.save();

        // If the player refreshes, charge elapsed time to the running clock.
        const clocks = getClockSnapshot(state.saved);

        if (
          state.saved.status === "active" &&
          (clocks.whiteTimeMs <= 0 || clocks.blackTimeMs <= 0)
        ) {
          const flaggingColor =
            clocks.whiteTimeMs <= 0 ? "w" : "b";

          state.saved.whiteTimeMs = clocks.whiteTimeMs;
          state.saved.blackTimeMs = clocks.blackTimeMs;
          state.saved.status = "completed";
          state.saved.activeClock = null;
          state.saved.clockStartedAt = null;
          state.saved.result = flaggingColor === "w" ? "0-1" : "1-0";

          await state.saved.save();
          await recordTournamentGameResult({
  tournamentId,
  roundNumber: Number(roundNumber),
  pairingId,
  result: state.saved.result,
});
        }

        const room = state.key;
        await socket.join(room);

        socket.data.match = {
          room,
          tournamentId: String(tournamentId),
          roundNumber: Number(roundNumber),
          pairingId: String(pairingId),
          playerId,
          color: playerId === whitePlayerId ? "w" : "b",
        };

        ack({
          ok: true,
          color: socket.data.match.color,
          state: publicState(state.chess, state.saved),
        });

        socket.to(room).emit("tournament:opponent-connected");
        io.to(room).emit("tournament:state", publicState(state.chess, state.saved));
      } catch (error) {
        console.error("join-match error:", error);
        ack({
          ok: false,
          message: error.message || "Unable to join this match.",
        });
      }
    });

    socket.on("tournament:make-move", async (payload, ack = () => {}) => {
      const match = socket.data.match;

      if (!match) {
        return ack({ ok: false, message: "Join your match first." });
      }

      const state = activeGames.get(match.room);

      if (!state) {
        return ack({ ok: false, message: "Match state unavailable." });
      }

      const operation = state.lock.then(async () => {
        if (state.saved.status === "completed") {
          return ack({ ok: false, message: "This match has ended." });
        }

        const clocks = getClockSnapshot(state.saved);

        // Enforce timeout on the server before accepting a move.
        if (
          clocks.whiteTimeMs <= 0 ||
          clocks.blackTimeMs <= 0
        ) {
          const flaggingColor =
            clocks.whiteTimeMs <= 0 ? "w" : "b";

          state.saved.whiteTimeMs = clocks.whiteTimeMs;
          state.saved.blackTimeMs = clocks.blackTimeMs;
          state.saved.status = "completed";
          state.saved.result = flaggingColor === "w" ? "0-1" : "1-0";
          state.saved.activeClock = null;
          state.saved.clockStartedAt = null;

          await state.saved.save();

await recordTournamentGameResult({
  tournamentId: match.tournamentId,
  roundNumber: match.roundNumber,
  pairingId: match.pairingId,
  result: state.saved.result,
});

          const timeoutState = publicState(state.chess, state.saved);
          io.to(match.room).emit("tournament:state", timeoutState);
          io.to(match.room).emit("tournament:finished", {
            result: state.saved.result,
            message:
              flaggingColor === "w"
                ? "White ran out of time. Black wins!"
                : "Black ran out of time. White wins!",
          });

          return ack({
            ok: false,
            message: "Your match has ended on time.",
            state: timeoutState,
          });
        }

        if (state.chess.turn() !== match.color) {
          return ack({ ok: false, message: "It is not your turn." });
        }

        const { from, to, promotion = "q" } = payload || {};

        if (typeof from !== "string" || typeof to !== "string") {
          return ack({ ok: false, message: "Invalid move." });
        }

        let move;

        try {
          move = state.chess.move({ from, to, promotion });
        } catch {
          move = null;
        }

        if (!move) {
          return ack({ ok: false, message: "That move is not legal." });
        }

        const result = resultForGame(state.chess);

        // Save both clocks at the instant the move is accepted.
        state.saved.whiteTimeMs = clocks.whiteTimeMs;
        state.saved.blackTimeMs = clocks.blackTimeMs;
        state.saved.fen = state.chess.fen();
        state.saved.moves = state.chess.history();
        state.saved.lastMoveAt = new Date();

        if (result !== "pending") {
          state.saved.status = "completed";
          state.saved.result = result;
          state.saved.activeClock = null;
          state.saved.clockStartedAt = null;
        } else {
          state.saved.status = "active";
          state.saved.activeClock = state.chess.turn();
          state.saved.clockStartedAt = new Date();
        }

        await state.saved.save();

        const statePayload = {
          ...publicState(state.chess, state.saved),
          lastMove: {
            from: move.from,
            to: move.to,
            san: move.san,
          },
        };

        io.to(match.room).emit("tournament:state", statePayload);
        ack({ ok: true, state: statePayload });

        if (result !== "pending") {
          io.to(match.room).emit("tournament:finished", {
            result,
            message:
              result === "1-0"
                ? "White wins!"
                : result === "0-1"
                ? "Black wins!"
                : "Draw!",
          });
        }
      });

      state.lock = operation.catch((error) => {
        console.error("make-move error:", error);
        ack({ ok: false, message: "Could not process the move." });
      });

      await state.lock;
    });

    socket.on("disconnect", () => {
      const match = socket.data.match;

      if (match) {
        socket.to(match.room).emit("tournament:opponent-disconnected");
      }
    });
  });
}
