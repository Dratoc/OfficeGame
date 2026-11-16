-- AlterTable
ALTER TABLE "MatchParticipant" ADD COLUMN     "achievements" TEXT[];

-- CreateTable
CREATE TABLE "Achievement" (
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "matchId" TEXT,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("userId","achievementId")
);

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
