-- CreateEnum
CREATE TYPE "Result" AS ENUM ('WHITE_WIN', 'BLACK_WIN', 'DRAW');

-- CreateEnum
CREATE TYPE "Termination" AS ENUM ('CHECKMATE', 'RESIGN', 'TIMEOUT', 'STALEMATE', 'AGREEMENT', 'INSUFFICIENT_MATERIAL', 'THREEFOLD', 'FIFTY_MOVE', 'ABANDONED');

-- CreateTable
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "email" TEXT,
  "passwordHash" TEXT,
  "isGuest" BOOLEAN NOT NULL DEFAULT false,
  "rating" INTEGER NOT NULL DEFAULT 1200,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
  "id" TEXT NOT NULL,
  "whiteId" TEXT NOT NULL,
  "blackId" TEXT NOT NULL,
  "pgn" TEXT NOT NULL DEFAULT '',
  "result" "Result" NOT NULL,
  "termination" "Termination" NOT NULL,
  "timeControl" TEXT NOT NULL,
  "whiteRatingBefore" INTEGER NOT NULL,
  "blackRatingBefore" INTEGER NOT NULL,
  "whiteRatingAfter" INTEGER NOT NULL,
  "blackRatingAfter" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "ratingAfter" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RatingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_rating_idx" ON "User"("rating" DESC);
CREATE INDEX "User_isGuest_idx" ON "User"("isGuest");

-- CreateIndex
CREATE INDEX "Game_whiteId_endedAt_idx" ON "Game"("whiteId", "endedAt" DESC);
CREATE INDEX "Game_blackId_endedAt_idx" ON "Game"("blackId", "endedAt" DESC);
CREATE INDEX "Game_endedAt_idx" ON "Game"("endedAt" DESC);

-- CreateIndex
CREATE INDEX "RatingHistory_userId_createdAt_idx" ON "RatingHistory"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_whiteId_fkey" FOREIGN KEY ("whiteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_blackId_fkey" FOREIGN KEY ("blackId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
