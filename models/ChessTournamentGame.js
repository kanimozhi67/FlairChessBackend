
import mongoose from "mongoose";

const chessTournamentGameSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChessTournament",
      required: true,
      index: true,
    },
    roundNumber: {
      type: Number,
      required: true,
    },
    pairingId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    whitePlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    blackPlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    fen: {
      type: String,
      required: true,
      default: "start",
    },
    moves: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    status: {
      type: String,
      enum: ["waiting", "active", "completed"],
      default: "waiting",
    },
    result: {
      type: String,
      enum: ["pending", "1-0", "0-1", "1/2-1/2"],
      default: "pending",
    },
    winnerPlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    lastMoveAt: {
      type: Date,
      default: null,
    },
    whiteTimeMs: {
  type: Number,
  default: 300000, // 5 minutes
},
blackTimeMs: {
  type: Number,
  default: 300000,
},
activeClock: {
  type: String,
  enum: ["w", "b", null],
  default: "w",
},
clockStartedAt: {
  type: Date,
  default: null,
},
  },
  { timestamps: true }
);

chessTournamentGameSchema.index(
  { tournamentId: 1, roundNumber: 1, pairingId: 1 },
  { unique: true }
);

export default mongoose.model(
  "ChessTournamentGame",
  chessTournamentGameSchema
);
