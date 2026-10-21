import STORY_BADGES from("./storyBadges");

export const awardStoryBadges = async (owner) => {
  if (!owner) {
    throw new Error("Story completion owner was not found.");
  }

  // Use unique completed story IDs so duplicate submissions
  // cannot award extra badges.
  const completedStories = Array.isArray(owner.completedStories)
    ? [...new Set(owner.completedStories.map(String))]
    : [];

  const earnedBadges = Array.isArray(owner.badges)
    ? owner.badges
    : [];

  const earnedBadgeIds = new Set(
    earnedBadges.map((badge) => badge.id)
  );

  const newlyEarnedBadges = STORY_BADGES.filter(
    (badge) =>
      completedStories.length >= badge.requiredStories &&
      !earnedBadgeIds.has(badge.id)
  ).map((badge) => ({
    ...badge,
    earnedAt: new Date(),
  }));

  if (newlyEarnedBadges.length > 0) {
    owner.badges.push(...newlyEarnedBadges);
    await owner.save();
  }

  return {
    badges: owner.badges,
    newlyEarnedBadges,
    completedStoryCount: completedStories.length,
  };
};

