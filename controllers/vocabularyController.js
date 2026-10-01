// GET /reading/completed

export const getCompletedReadingStories = async (
  req,
  res
) => {
  try {
    const {
      studentId,
      userId,
    } = req.query;

    const filter = {};

    if (studentId) {
      filter.studentId = studentId;
    } else if (userId) {
      filter.userId = userId;
    } else {
      return res.status(400).json({
        success: false,
        message:
          "studentId or userId is required",
      });
    }

    const completedStories =
      await CompletedReading.find(filter)
        .populate("storyId")
        .sort({
          completedAt: -1,
        });

    const stories =
      completedStories
        .map((item) => {
          const story =
            item.storyId;

          if (!story) {
            return null;
          }

          return {
            _id: story._id,
            title: story.title,
            grade: story.grade,
            vocabulary:
              story.vocabulary || [],
            score: item.score,
            completedAt:
              item.completedAt,
          };
        })
        .filter(Boolean);

    res.json({
      success: true,
      data: stories,
    });
  } catch (error) {
    console.error(
      "Get completed reading stories error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to get completed reading stories",
    });
  }
};