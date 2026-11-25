import { prisma } from "@visionops/db";
import { stopAllStreams, supervise } from "./camera/supervisor.js";

console.log("VisionOps worker starting");
await prisma.$queryRaw`SELECT 1`;
await supervise();

async function shutdown(): Promise<void> {
  stopAllStreams();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
