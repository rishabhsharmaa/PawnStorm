import bcrypt from "bcryptjs";
import { prisma } from "./index";

/**
 * Demo data: three password users (password: "password123") plus one finished
 * game (scholar's mate) so profile / review / leaderboard pages have content.
 */
async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash("password123", 10);

  const alice = await prisma.user.upsert({
    where: { username: "alice" },
    update: {},
    create: {
      username: "alice",
      email: "alice@example.com",
      passwordHash,
      rating: 1500,
    },
  });
  const bob = await prisma.user.upsert({
    where: { username: "bob" },
    update: {},
    create: {
      username: "bob",
      email: "bob@example.com",
      passwordHash,
      rating: 1350,
    },
  });
  await prisma.user.upsert({
    where: { username: "demo" },
    update: {},
    create: {
      username: "demo",
      email: "demo@example.com",
      passwordHash,
      rating: 1200,
    },
  });

  const pgn =
    '[Event "Pawnstorm seeded game"]\n[Site "Pawnstorm"]\n[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';
  const existing = await prisma.game.findFirst({ where: { pgn } });
  if (!existing) {
    const game = await prisma.game.create({
      data: {
        whiteId: alice.id,
        blackId: bob.id,
        pgn,
        result: "WHITE_WIN",
        termination: "CHECKMATE",
        timeControl: "5+3",
        whiteRatingBefore: 1490,
        blackRatingBefore: 1360,
        whiteRatingAfter: 1500,
        blackRatingAfter: 1350,
      },
    });
    await prisma.ratingHistory.createMany({
      data: [
        { userId: alice.id, gameId: game.id, ratingAfter: 1500 },
        { userId: bob.id, gameId: game.id, ratingAfter: 1350 },
      ],
    });
  }

  console.log("Seeded demo users: alice, bob, demo (password: password123)");
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
