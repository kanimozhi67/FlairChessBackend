import mongoose from "mongoose";

const { Schema } = mongoose;

const tournamentPlayerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    userModel: { type: String, enum: ["User", "Student"], default: "User" },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    rating: { type: Number, default: 800, min: 0, max: 4000 },
    score: { type: Number, default: 0, min: 0 },
    opponents: [{ type: Schema.Types.ObjectId }],
    colors: [{ type: String, enum: ["white", "black"] }],
    byeReceived: { type: Boolean, default: false },
    registeredAt: { type: Date, default: Date.now },
    withdrawn: { type: Boolean, default: false },
  },
  { _id: true }
);

const pairingSchema = new Schema(
  {
    boardNumber: { type: Number, required: true, min: 1 },
    whitePlayer: { type: Schema.Types.ObjectId, default: null },
    blackPlayer: { type: Schema.Types.ObjectId, default: null },
    result: {
      type: String,
      enum: ["pending", "1-0", "0-1", "1/2-1/2", "bye"],
      default: "pending",
    },
    status: {
      type: String,
      enum: ["paired", "in-progress", "completed", "bye"],
      default: "paired",
    },
    reportedBy: { type: Schema.Types.ObjectId, default: null },
    completedAt: { type: Date, default: null },
  },
  { _id: true }
);

const roundSchema = new Schema(
  {
    roundNumber: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["draft", "published", "completed"],
      default: "draft",
    },
    pairings: [pairingSchema],
    generatedAt: { type: Date, default: Date.now },
    publishedAt: { type: Date, default: null },
  },
  { _id: false }
);

const chessTournamentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    format: { type: String, enum: ["swiss"], default: "swiss" },
    status: {
      type: String,
      enum: ["registration", "in-progress", "completed", "cancelled"],
      default: "registration",
    },
    schoolId: { type: Schema.Types.ObjectId, default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
    createdByModel: { type: String, enum: ["User", "Student"], default: "User" },
    maxPlayers: { type: Number, default: 64, min: 2, max: 512 },
    roundsCount: { type: Number, default: 5, min: 1, max: 15 },
    timeControlMinutes: { type: Number, default: 10, min: 1, max: 180 },
    registrationDeadline: { type: Date, default: null },
    players: [tournamentPlayerSchema],
    rounds: [roundSchema],
  },
  { timestamps: true }
);

chessTournamentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("ChessTournament", chessTournamentSchema);
