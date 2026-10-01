import express from "express";

import {
  getAllReadings,
  getReadingById,
  getReadingByGrade,
  createReading,
  updateReading,
  deleteReading,
  submitReadingResult,
  getStudentReadingResults,
  completeReadingStory,
   getCompletedReadingStories,
} from "../controllers/readingController.js";

// import {
//   getCompletedReadingStories,
// } from "../controllers/vocabularyController.js";

const router = express.Router();

/* =========================================================
   GET ALL READINGS

   GET /api/reading
   ========================================================= */

router.get(
  "/",
  getAllReadings
);


/* =========================================================
   GET UNFINISHED READINGS BY GRADE

   GET /api/reading/grade/4?studentId=XXXX
   GET /api/reading/grade/4?userId=XXXX
   ========================================================= */

router.get(
  "/grade/:grade",
  getReadingByGrade
);


/* =========================================================
   GET COMPLETED READING STORIES

   GET /api/reading/completed?studentId=XXXX
   GET /api/reading/completed?userId=XXXX

   IMPORTANT:
   This MUST be before /:id
   ========================================================= */

router.get(
  "/completed",
  getCompletedReadingStories
);


/* =========================================================
   COMPLETE READING STORY

   POST /api/reading/complete

   Student:
   {
     "studentId": "STUDENT_ID",
     "storyId": "STORY_ID",
     "score": 7
   }

   Normal User:
   {
     "userId": "USER_ID",
     "storyId": "STORY_ID",
     "score": 7
   }
   ========================================================= */

router.post(
  "/complete",
  completeReadingStory
);


/* =========================================================
   SUBMIT READING RESULT

   POST /api/reading/result
   ========================================================= */

router.post(
  "/result",
  submitReadingResult
);


/* =========================================================
   GET STUDENT READING RESULTS

   GET /api/reading/results/student/:studentId
   ========================================================= */

router.get(
  "/results/student/:studentId",
  getStudentReadingResults
);


/* =========================================================
   CREATE READING

   POST /api/reading
   ========================================================= */

router.post(
  "/",
  createReading
);


/* =========================================================
   GET READING BY ID

   GET /api/reading/:id

   IMPORTANT:
   Keep this AFTER all static routes such as:
   /completed
   /grade/:grade
   /results/student/:studentId
   ========================================================= */

router.get(
  "/:id",
  getReadingById
);


/* =========================================================
   UPDATE READING

   PUT /api/reading/:id
   ========================================================= */

router.put(
  "/:id",
  updateReading
);


/* =========================================================
   DELETE READING

   DELETE /api/reading/:id
   ========================================================= */

router.delete(
  "/:id",
  deleteReading
);


export default router;