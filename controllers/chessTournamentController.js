import mongoose from "mongoose";
import ChessTournament from "../models/ChessTournament.js";
import { generateSwissPairings } from "../services/swissPairing.js";

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

/**
 * Adapt this to the existing Flair auth middleware.
 * Never accept the acting student's identity from req.body.
 */
function getActor(req) {
  const user = req.user;
  console.log("req.user.username :",req.user.username)
  if (!user) return null;

  const id = user._id || user.id || user.studentId;
  if (!id || !isObjectId(String(id))) return null;

  const role = String(user.role || user.userType || "").toLowerCase();
  const model = String(user.model || "");
  const isStudent = model === "StudentModel" || model === "Student" || role === "student";
  const isTeacher = model === "Teacher";
  const schoolValue = user.schoolId || user.school || null;
  const schoolId = schoolValue && isObjectId(String(schoolValue._id || schoolValue))
    ? new mongoose.Types.ObjectId(String(schoolValue._id || schoolValue))
    : null;

  return {
    id: new mongoose.Types.ObjectId(String(id)),
    model: isStudent ? "StudentModel" : isTeacher ? "Teacher" : "User",
    name: String(user.username).slice(0, 80),
    schoolId,
    role,
  };
}

function canManageChessTournaments(req, tournament = null) {
  const actor = getActor(req);
  console.log(actor)
  if (!actor) return false;

  // Global Admin can manage any tournament. School staff can manage only their own school's tournaments.
  if (["admin", "superadmin"].includes(actor.role) && actor.model === "User") return true;
  if (!["schooladmin", "school_admin", "teacher"].includes(actor.role)) return false;
  if (!actor.schoolId) return false;
  if (!tournament) return true;
  return Boolean(tournament.schoolId) && String(tournament.schoolId) === String(actor.schoolId);
}

function canViewTournament(req, tournament) {
  const actor = getActor(req);
  if (!actor || !tournament) return false;
  // Global tournaments are visible to all authenticated account types.
  if (!tournament.schoolId) return true;
  return Boolean(actor.schoolId) && String(tournament.schoolId) === String(actor.schoolId);
}

function publicTournament(tournament) {
  const doc = tournament.toObject ? tournament.toObject() : tournament;
  return {
    ...doc,
    players: (doc.players || []).map((p) => ({
      _id: p._id,
      displayName: p.displayName,
      rating: p.rating,
      score: p.score,
      withdrawn: p.withdrawn,
    })),
  };
}

export async function listTournaments(req, res) {
  try {
    const actor = getActor(req);
    if (!actor) return res.status(401).json({ message: "Please sign in." });

    const visibilityFilter = actor.schoolId
      ? { $or: [{ schoolId: null }, { schoolId: actor.schoolId }] }
      : { schoolId: null };
    const tournaments = await ChessTournament.find({
      status: { $ne: "cancelled" },
      ...visibilityFilter,
    }).sort({ createdAt: -1 }).limit(100);
    return res.json(tournaments.map(publicTournament));
  } catch (error) {
    return res.status(500).json({ message: "Could not load tournaments." });
  }
}


export async function createTournament(req, res) {
  try {
    const actor = getActor(req);

    if (!actor) {
      return res.status(401).json({
        message: "Please sign in.",
      });
    }

    if (!canManageChessTournaments(req)) {
      return res.status(403).json({
        message: "Only an admin or school staff member can create tournaments.",
      });
    }
console.log("createTournament started");

res.once("finish", () => {
  console.log("Response finished with status:", res.statusCode);
});

res.once("close", () => {
  console.log("Response closed");
});
    const name = String(req.body.name || "").trim();

    if (name.length < 3) {
      return res.status(400).json({
        message: "Tournament name must be at least 3 characters.",
      });
    }

    const maxPlayers = Number(req.body.maxPlayers ?? 64);
    const roundsCount = Number(req.body.roundsCount ?? 5);
    const timeControlMinutes = Number(
      req.body.timeControlMinutes ?? 10
    );

    if (
      !Number.isInteger(maxPlayers) ||
      maxPlayers < 2 ||
      maxPlayers > 512
    ) {
      return res.status(400).json({
        message: "maxPlayers must be between 2 and 512.",
      });
    }

    if (
      !Number.isInteger(roundsCount) ||
      roundsCount < 1 ||
      roundsCount > 15
    ) {
      return res.status(400).json({
        message: "Rounds must be between 1 and 15.",
      });
    }

    if (
      !Number.isInteger(timeControlMinutes) ||
      timeControlMinutes < 1 ||
      timeControlMinutes > 180
    ) {
      return res.status(400).json({
        message: "Time control must be between 1 and 180 minutes.",
      });
    }

    const tournament = await ChessTournament.create({
      name,
      description: String(req.body.description || "")
        .trim()
        .slice(0, 500),
      createdBy: actor.id,
      createdByModel: actor.model,
      schoolId: actor.schoolId,
      maxPlayers,
      roundsCount,
      timeControlMinutes,
      registrationDeadline: req.body.registrationDeadline || null,
      status: "registration",
    });

   
console.log("Tournament created:", tournament._id);

// ADD THE DEBUG LOGS HERE
console.log("Before publicTournament");

const responseData = publicTournament(tournament);

console.log("Before sending response:", {
  headersSent: res.headersSent,
});

// Send the response only once
return res.status(201).json(responseData);

 } catch (error) {
  console.error("createTournament error:", error);

  if (res.headersSent) {
    console.error(
      "Headers already sent. Original error:",
      error.message
    );
    return;
  }

  return res.status(500).json({
    message: "Could not create tournament.",
    error: error.message,
  });
}
}


export async function joinTournament(req, res) {
  try {
    const actor = getActor(req);
    if (!actor) return res.status(401).json({ message: "Please sign in." });

    const tournament = await ChessTournament.findById(req.params.tournamentId);
    if (!tournament) return res.status(404).json({ message: "Tournament not found." });
    if (tournament.status !== "registration") {
      return res.status(400).json({ message: "Registration is closed." });
    }
    if (tournament.registrationDeadline && new Date() > tournament.registrationDeadline) {
      return res.status(400).json({ message: "Registration deadline has passed." });
    }
    if (tournament.players.length >= tournament.maxPlayers) {
      return res.status(400).json({ message: "Tournament is full." });
    }
    if (!canViewTournament(req, tournament)) {
      return res.status(403).json({ message: "This tournament is not available to your account or school." });
    }
    if (actor.model === "Teacher") {
      return res.status(403).json({ message: "Teacher accounts organise tournaments but cannot register as players." });
    }
    const alreadyJoined = tournament.players.some(
      (p) => String(p.userId) === String(actor.id) && p.userModel === actor.model
    );
    if (alreadyJoined) return res.status(409).json({ message: "You have already joined this tournament." });

    tournament.players.push({
      userId: actor.id,
      userModel: actor.model,
      displayName: actor.name,
      rating: Number(req.user.chessRating) || 800,
    });
    await tournament.save();
    return res.status(200).json(publicTournament(tournament));
  } catch (error) {
    return res.status(500).json({ message: "Could not join tournament." });
  }
}

export async function generateRoundPairings(req, res) {
  try {
    if (!getActor(req)) return res.status(401).json({ message: "Please sign in." });

    const tournament = await ChessTournament.findById(req.params.tournamentId);
    if (!tournament) return res.status(404).json({ message: "Tournament not found." });
    if (!canManageChessTournaments(req, tournament)) return res.status(403).json({ message: "Only an authorised organiser for this tournament can generate pairings." });
    if (tournament.status === "completed" || tournament.status === "cancelled") {
      return res.status(400).json({ message: "This tournament is not active." });
    }
    const previousRound = tournament.rounds[tournament.rounds.length - 1];
    if (previousRound && previousRound.status !== "completed") {
      return res.status(400).json({ message: "Complete the current round before generating another." });
    }
    if (tournament.rounds.length >= tournament.roundsCount) {
      return res.status(400).json({ message: "All planned rounds have been generated." });
    }
    const activePlayers = tournament.players.filter((p) => !p.withdrawn);
    if (activePlayers.length < 2) return res.status(400).json({ message: "At least two active players are required." });

    const roundNumber = tournament.rounds.length + 1;
    const generated = generateSwissPairings(activePlayers, roundNumber);
    tournament.rounds.push({ ...generated, status: "draft", generatedAt: new Date() });
    await tournament.save();

    return res.status(201).json(publicTournament(tournament));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Could not generate pairings." });
  }
}

export async function publishRound(req, res) {
  try {
    if (!getActor(req)) return res.status(401).json({ message: "Please sign in." });

    const tournament = await ChessTournament.findById(req.params.tournamentId);
    if (!tournament) return res.status(404).json({ message: "Tournament not found." });
    if (!canManageChessTournaments(req, tournament)) return res.status(403).json({ message: "Only an authorised organiser for this tournament can publish pairings." });
    const round = tournament.rounds.find((r) => r.roundNumber === Number(req.params.roundNumber));
    if (!round) return res.status(404).json({ message: "Round not found." });
    if (round.status !== "draft") return res.status(400).json({ message: "Only draft rounds can be published." });

    // Award the Swiss bye only when the round is published, not while it is a draft.
    for (const pairing of round.pairings) {
      if (pairing.status === "bye" && pairing.whitePlayer) {
        const byePlayer = tournament.players.id(pairing.whitePlayer);
        if (byePlayer && !byePlayer.byeReceived) {
          byePlayer.score += 1;
          byePlayer.byeReceived = true;
        }
      }
    }

    round.status = "published";
    round.publishedAt = new Date();
    tournament.status = "in-progress";
    await tournament.save();
    return res.json(publicTournament(tournament));
  } catch (error) {
    return res.status(500).json({ message: "Could not publish pairings." });
  }
}

export async function submitPairingResult(req, res) {
  try {
    if (!getActor(req)) return res.status(401).json({ message: "Please sign in." });

    const { result } = req.body;
    if (!["1-0", "0-1", "1/2-1/2"].includes(result)) {
      return res.status(400).json({ message: "Result must be 1-0, 0-1 or 1/2-1/2." });
    }

    const tournament = await ChessTournament.findById(req.params.tournamentId);
    if (!tournament) return res.status(404).json({ message: "Tournament not found." });
    if (!canManageChessTournaments(req, tournament)) return res.status(403).json({ message: "Only an authorised organiser for this tournament can record results." });
    const round = tournament.rounds.find((r) => r.roundNumber === Number(req.params.roundNumber));
    if (!round) return res.status(404).json({ message: "Round not found." });
    if (round.status !== "published") return res.status(400).json({ message: "Publish the round before entering results." });

    const pairing = round.pairings.id(req.params.pairingId);
    if (!pairing || pairing.status === "bye") return res.status(404).json({ message: "Game pairing not found." });
    if (pairing.result !== "pending") return res.status(409).json({ message: "This result has already been recorded." });

    pairing.result = result;
    pairing.status = "completed";
    pairing.reportedBy = getActor(req).id;
    pairing.completedAt = new Date();

    const white = tournament.players.id(pairing.whitePlayer);
    const black = tournament.players.id(pairing.blackPlayer);
    if (!white || !black) return res.status(400).json({ message: "Pairing contains an invalid player." });

    if (result === "1-0") white.score += 1;
    if (result === "0-1") black.score += 1;
    if (result === "1/2-1/2") {
      white.score += 0.5;
      black.score += 0.5;
    }
    white.opponents.push(black._id);
    black.opponents.push(white._id);
    white.colors.push("white");
    black.colors.push("black");

    const allComplete = round.pairings.every((p) => p.status === "completed" || p.status === "bye");
    if (allComplete) {
      round.status = "completed";
      if (tournament.rounds.length >= tournament.roundsCount) tournament.status = "completed";
    }

    await tournament.save();
    return res.json(publicTournament(tournament));
  } catch (error) {
    return res.status(500).json({ message: "Could not save result." });
  }
}

export async function getTournament(req, res) {
  try {
    const actor = getActor(req);
    if (!actor) return res.status(401).json({ message: "Please sign in." });
    const tournament = await ChessTournament.findById(req.params.tournamentId);
    if (!tournament) return res.status(404).json({ message: "Tournament not found." });
    if (!canViewTournament(req, tournament)) {
      return res.status(403).json({ message: "This tournament is not available to your account or school." });
    }
    return res.json(publicTournament(tournament));
  } catch (error) {
    return res.status(500).json({ message: "Could not load tournament." });
  }
}
