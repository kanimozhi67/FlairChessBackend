
import ChessTournament from "../models/ChessTournament.js";
import { generateSwissPairings } from "./swissPairing.js";

// Elo settings
const ELO_K_FACTOR = 32;
const MIN_RATING = 0;
const MAX_RATING = 4000;

// Serialize result updates for the same tournament within this Node.js process.
const tournamentQueues = new Map();

function idOf(value) {
  return value?._id?.toString?.() || value?.toString?.() || "";
}

function getRating(player) {
  const rating = Number(player.rating);
  return Number.isFinite(rating) ? rating : 800;
}

function clampRating(rating) {
  return Math.max(MIN_RATING, Math.min(MAX_RATING, rating));
}

/**
 * Calculate and apply Elo rating changes.
 *
 * result:
 *   "1-0"     => White wins
 *   "0-1"     => Black wins
 *   "1/2-1/2" => Draw
 */
function updatePlayerRatings(white, black, result) {
  const whiteRating = getRating(white);
  const blackRating = getRating(black);

  const expectedWhite =
    1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));

  const expectedBlack = 1 - expectedWhite;

  let whiteScore;

  if (result === "1-0") {
    whiteScore = 1;
  } else if (result === "0-1") {
    whiteScore = 0;
  } else {
    whiteScore = 0.5;
  }

  const blackScore = 1 - whiteScore;

  const whiteChange = Math.round(
    ELO_K_FACTOR * (whiteScore - expectedWhite)
  );

  // Apply the opposite change to keep the total rating points balanced.
  const blackChange = -whiteChange;

  white.rating = clampRating(whiteRating + whiteChange);
  black.rating = clampRating(blackRating + blackChange);

  console.log("[Chess Elo] Ratings updated:", {
    white: {
      name: white.displayName,
      oldRating: whiteRating,
      change: whiteChange,
      newRating: white.rating,
    },
    black: {
      name: black.displayName,
      oldRating: blackRating,
      change: blackChange,
      newRating: black.rating,
    },
    result,
  });
}

function awardByePoints(tournament, round) {
  for (const pairing of round.pairings || []) {
    if (pairing.status !== "bye" || !pairing.whitePlayer) continue;

    const player = tournament.players.id(pairing.whitePlayer);
    if (!player) continue;

    player.score = Number(player.score || 0) + 1;
    player.byeReceived = true;

    pairing.result = "bye";
    pairing.status = "bye";
    pairing.completedAt = new Date();
  }
}

function activateNextRound(tournament) {
  if (tournament.rounds.length >= tournament.roundsCount) {
    tournament.status = "completed";
    return;
  }

  const players = tournament.players.filter(
    (player) => !player.withdrawn
  );

  if (players.length < 2) {
    tournament.status = "completed";
    return;
  }

  const roundNumber = tournament.rounds.length + 1;
  const generated = generateSwissPairings(players, roundNumber);
  const now = new Date();

  tournament.rounds.push({
    ...generated,
    roundNumber,
    status: "published",
    generatedAt: now,
    publishedAt: now,
  });

  const nextRound = tournament.rounds.find(
    (round) => round.roundNumber === roundNumber
  );

  awardByePoints(tournament, nextRound);
  tournament.status = "in-progress";

  console.log(
    `[Chess Tournament] Automatically activated round ${roundNumber} for ${tournament._id}`
  );
}

/**
 * Record a finished game exactly once.
 * Updates tournament points and both players' Elo ratings.
 */
async function recordResultUnlocked({
  tournamentId,
  roundNumber,
  pairingId,
  result,
}) {
  if (!["1-0", "0-1", "1/2-1/2"].includes(result)) {
    throw new Error("Invalid completed-game result.");
  }

  const tournament = await ChessTournament.findById(tournamentId);

  if (!tournament) {
    throw new Error("Tournament not found.");
  }

  const round = tournament.rounds.find(
    (item) => Number(item.roundNumber) === Number(roundNumber)
  );

  if (!round) {
    throw new Error("Tournament round not found.");
  }

  const pairing = round.pairings.id(pairingId);

  if (!pairing || pairing.status === "bye") {
    throw new Error("Tournament pairing not found.");
  }

  // Prevent duplicate points and duplicate rating changes.
  if (
    pairing.result !== "pending" ||
    pairing.status === "completed"
  ) {
    return {
      tournament,
      alreadyRecorded: true,
    };
  }

  if (round.status !== "published") {
    throw new Error("The tournament round is not active.");
  }

  const white = tournament.players.id(pairing.whitePlayer);
  const black = tournament.players.id(pairing.blackPlayer);

  if (!white || !black) {
    throw new Error("The pairing has an invalid player.");
  }

  // Calculate rating changes before saving the completed result.
  updatePlayerRatings(white, black, result);

  pairing.result = result;
  pairing.status = "completed";
  pairing.completedAt = new Date();
  pairing.reportedBy = null;

  // Update tournament points.
  if (result === "1-0") {
    white.score = Number(white.score || 0) + 1;
  } else if (result === "0-1") {
    black.score = Number(black.score || 0) + 1;
  } else {
    white.score = Number(white.score || 0) + 0.5;
    black.score = Number(black.score || 0) + 0.5;
  }

  white.opponents.push(black._id);
  black.opponents.push(white._id);

  white.colors.push("white");
  black.colors.push("black");

  const allComplete = round.pairings.every(
    (item) =>
      item.status === "completed" ||
      item.status === "bye" ||
      item.result === "bye"
  );

  if (allComplete) {
    round.status = "completed";

    if (tournament.rounds.length >= tournament.roundsCount) {
      tournament.status = "completed";

      console.log(
        `[Chess Tournament] Tournament ${tournamentId} completed.`
      );
    } else {
      activateNextRound(tournament);
    }
  }

  // Save result, points, and rating changes together.
  await tournament.save();

  console.log(
    `[Chess Tournament] Result ${result} recorded for round ${roundNumber}, pairing ${pairingId}.`
  );

  return {
    tournament,
    alreadyRecorded: false,
    roundCompleted: allComplete,
    tournamentCompleted: tournament.status === "completed",
  };
}

export function recordTournamentGameResult(details) {
  const key = idOf(details.tournamentId);
  const previous = tournamentQueues.get(key) || Promise.resolve();

  const current = previous
    .catch(() => {})
    .then(() => recordResultUnlocked(details));

  tournamentQueues.set(key, current);

  return current.finally(() => {
    if (tournamentQueues.get(key) === current) {
      tournamentQueues.delete(key);
    }
  });
}
