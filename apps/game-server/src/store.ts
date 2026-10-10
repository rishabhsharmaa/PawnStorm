import { prisma, type PrismaClient, type Result, type Termination } from "@pawnstorm/db";
import type { GameResult, Termination as SharedTermination } from "@pawnstorm/shared";

export interface UserSummary {
  id: string;
  username: string;
  rating: number;
  isGuest: boolean;
}

export interface PersistFinishedGameInput {
  id: string;
  whiteId: string;
  blackId: string;
  pgn: string;
  result: GameResult;
  termination: SharedTermination;
  timeControl: string;
  whiteBefore: number;
  blackBefore: number;
  whiteAfter: number;
  blackAfter: number;
  startedAt: Date;
  endedAt: Date;
}

/** Persistence port: Prisma in production, in-memory in tests. */
export interface GameStore {
  getUser(id: string): Promise<UserSummary | null>;
  saveFinishedGame(input: PersistFinishedGameInput): Promise<void>;
}

export class PrismaGameStore implements GameStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getUser(id: string): Promise<UserSummary | null> {
    const user = await this.db.user.findUnique({
      where: { id },
      select: { id: true, username: true, rating: true, isGuest: true },
    });
    return user;
  }

  async saveFinishedGame(input: PersistFinishedGameInput): Promise<void> {
    await this.db.$transaction([
      this.db.game.create({
        data: {
          id: input.id,
          whiteId: input.whiteId,
          blackId: input.blackId,
          pgn: input.pgn,
          result: input.result as Result,
          termination: input.termination as Termination,
          timeControl: input.timeControl,
          whiteRatingBefore: input.whiteBefore,
          blackRatingBefore: input.blackBefore,
          whiteRatingAfter: input.whiteAfter,
          blackRatingAfter: input.blackAfter,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
        },
      }),
      this.db.user.update({
        where: { id: input.whiteId },
        data: { rating: input.whiteAfter },
      }),
      this.db.user.update({
        where: { id: input.blackId },
        data: { rating: input.blackAfter },
      }),
      this.db.ratingHistory.createMany({
        data: [
          { userId: input.whiteId, gameId: input.id, ratingAfter: input.whiteAfter },
          { userId: input.blackId, gameId: input.id, ratingAfter: input.blackAfter },
        ],
      }),
    ]);
  }
}

export class MemoryGameStore implements GameStore {
  readonly users = new Map<string, UserSummary>();
  readonly games: PersistFinishedGameInput[] = [];

  addUser(user: UserSummary): void {
    this.users.set(user.id, user);
  }

  async getUser(id: string): Promise<UserSummary | null> {
    return this.users.get(id) ?? null;
  }

  async saveFinishedGame(input: PersistFinishedGameInput): Promise<void> {
    this.games.push(input);
    const white = this.users.get(input.whiteId);
    const black = this.users.get(input.blackId);
    if (white) this.users.set(white.id, { ...white, rating: input.whiteAfter });
    if (black) this.users.set(black.id, { ...black, rating: input.blackAfter });
  }
}
