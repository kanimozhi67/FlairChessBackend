import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
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

router.get("/", authMiddleware, listTournaments);
router.post("/", authMiddleware, createTournament);
router.get("/:tournamentId", authMiddleware, getTournament);
router.post("/:tournamentId/join", authMiddleware, joinTournament);
router.post("/:tournamentId/rounds/generate", authMiddleware, generateRoundPairings);
router.post("/:tournamentId/rounds/:roundNumber/publish", authMiddleware, publishRound);
router.post("/:tournamentId/rounds/:roundNumber/pairings/:pairingId/result", authMiddleware, submitPairingResult);

export default router;
