
import ChessTournament from "../models/ChessTournament.js";
import { generateSwissPairings } from "./swissPairing.js";

// Serialize result updates for the same tournament within this Node.js process.
const tournamentQueues = new Map();

function idOf(value) {
  return value?._id?.toString?.() || value?.toString?.() || "";
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

  const players = tournament.players.filter((player) => !player.withdrawn);

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
 * Save a finished game into its tournament pairing.
 * Repeated calls for an already-recorded result do not award points twice.
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
  if (!tournament) throw new Error("Tournament not found.");

  const round = tournament.rounds.find(
    (item) => Number(item.roundNumber) === Number(roundNumber)
  );

  if (!round) throw new Error("Tournament round not found.");

  const pairing = round.pairings.id(pairingId);
  if (!pairing || pairing.status === "bye") {
    throw new Error("Tournament pairing not found.");
  }

  // Idempotency: never score the same pairing twice.
  if (pairing.result !== "pending" || pairing.status === "completed") {
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

  pairing.result = result;
  pairing.status = "completed";
  pairing.completedAt = new Date();
  pairing.reportedBy = null;

  if (result === "1-0") {
    white.score += 1;
  } else if (result === "0-1") {
    black.score += 1;
  } else {
    white.score += 0.5;
    black.score += 0.5;
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
