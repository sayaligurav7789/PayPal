import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  fraudShieldPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.fraudShieldPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.fraudShieldPrisma = prisma;
}
