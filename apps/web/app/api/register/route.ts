import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@pawnstorm/db";

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "username must be 3–16 characters")
    .max(16)
    .regex(/^[a-zA-Z0-9_]+$/, "letters, numbers, and underscores only"),
  email: z.string().email(),
  password: z.string().min(8, "password must be at least 8 characters").max(72),
});

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid input" },
      { status: 400 },
    );
  }
  const { username, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email: normalizedEmail }] },
    select: { username: true, email: true },
  });
  if (existing) {
    const taken = existing.username === username ? "username" : "email";
    return NextResponse.json({ error: `that ${taken} is already taken` }, { status: 409 });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { username, email: normalizedEmail, passwordHash } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
