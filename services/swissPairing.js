/**
 * Practical Swiss-style pairing for an MVP.
 * - Sorts by score, rating, then registration time.
 * - Tries to avoid repeat opponents.
 * - Tries to balance White/Black assignment.
 * - Gives an odd-player bye to the lowest-ranked eligible player who has not had a bye.
 *
 * This is not a FIDE-certified pairing implementation.
 */

const getColorBalance = (player) =>
  player.colors.reduce((sum, color) => sum + (color === "white" ? 1 : -1), 0);

const hasPlayed = (a, b) =>
  a.opponents.some((id) => String(id) === String(b._id));

function chooseColors(a, b) {
  const aBalance = getColorBalance(a);
  const bBalance = getColorBalance(b);

  // Prefer the player who has had fewer White games to receive White.
  if (aBalance < bBalance) return { white: a, black: b };
  if (bBalance < aBalance) return { white: b, black: a };

  // Avoid giving the same colour three times in a row when possible.
  const aLast = a.colors[a.colors.length - 1];
  const bLast = b.colors[b.colors.length - 1];
  if (aLast === "white" && bLast !== "white") return { white: b, black: a };
  if (bLast === "white" && aLast !== "white") return { white: a, black: b };

  // Deterministic fallback.
  return String(a._id).localeCompare(String(b._id)) <= 0
    ? { white: a, black: b }
    : { white: b, black: a };
}

function findOpponent(index, pool, paired, allowRematch = false) {
  const player = pool[index];
  const candidates = [];

  for (let j = index + 1; j < pool.length; j += 1) {
    if (paired.has(String(pool[j]._id))) continue;
    candidates.push(pool[j]);
  }

  candidates.sort((a, b) => {
    const aRepeat = hasPlayed(player, a) ? 1 : 0;
    const bRepeat = hasPlayed(player, b) ? 1 : 0;
    if (!allowRematch && aRepeat !== bRepeat) return aRepeat - bRepeat;
    const scoreDiff = Math.abs(player.score - a.score) - Math.abs(player.score - b.score);
    if (scoreDiff !== 0) return scoreDiff;
    return b.rating - a.rating;
  });

  return candidates.find((candidate) => allowRematch || !hasPlayed(player, candidate)) || null;
}

export function generateSwissPairings(players, roundNumber) {
  const active = players.filter((player) => !player.withdrawn);
  if (active.length < 2) {
    throw new Error("At least two active players are required to generate pairings.");
  }

  const sorted = [...active].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.rating !== a.rating) return b.rating - a.rating;
    return new Date(a.registeredAt) - new Date(b.registeredAt);
  });

  let byePlayer = null;
  if (sorted.length % 2 === 1) {
    // Lowest-ranked eligible player gets the bye.
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (!sorted[i].byeReceived) {
        byePlayer = sorted[i];
        sorted.splice(i, 1);
        break;
      }
    }
    if (!byePlayer) {
      byePlayer = sorted.pop();
    }
  }

  const pairedIds = new Set();
  const pairings = [];
  let boardNumber = 1;

  for (let i = 0; i < sorted.length; i += 1) {
    const player = sorted[i];
    if (pairedIds.has(String(player._id))) continue;

    let opponent = findOpponent(i, sorted, pairedIds, false);
    if (!opponent) opponent = findOpponent(i, sorted, pairedIds, true);

    if (!opponent) {
      // Defensive fallback; normally impossible after odd-player handling.
      byePlayer = player;
      pairedIds.add(String(player._id));
      continue;
    }

    const colors = chooseColors(player, opponent);
    pairedIds.add(String(player._id));
    pairedIds.add(String(opponent._id));

    pairings.push({
      boardNumber: boardNumber++,
      whitePlayer: colors.white._id,
      blackPlayer: colors.black._id,
      result: "pending",
      status: "paired",
    });
  }

  if (byePlayer) {
    pairings.push({
      boardNumber,
      whitePlayer: byePlayer._id,
      blackPlayer: null,
      result: "bye",
      status: "bye",
    });
  }

  return { roundNumber, pairings };
}
