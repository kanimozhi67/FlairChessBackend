import { Router } from "express";
import {
  createTournament,
  generateRoundPairings,
  getTournament,
  joinTournament,
  listTournaments,
  publishRound,
  submitPairingResult,
} from "../controllers/chessTournamentController.js";

const router = Router();

/**
 * IMPORTANT: Replace this with the authentication middleware already used by Flair.
 * Example only:
 * import { protect } from "../middleware/authMiddleware.js";
 * router.use(protect);
 */
const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Authentication middleware is not configured for chess routes." });
  next();
};

router.get("/", requireAuth, listTournaments);
router.post("/", requireAuth, createTournament);
router.get("/:tournamentId", requireAuth, getTournament);
router.post("/:tournamentId/join", requireAuth, joinTournament);
router.post("/:tournamentId/rounds/generate", requireAuth, generateRoundPairings);
router.post("/:tournamentId/rounds/:roundNumber/publish", requireAuth, publishRound);
router.post("/:tournamentId/rounds/:roundNumber/pairings/:pairingId/result", requireAuth, submitPairingResult);

export default router;
