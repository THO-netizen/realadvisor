import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { ScoringService } from "../src/scoring/scoring.service";

const logger = new Logger("BackfillScoring");

const DELAY_MS = 400;
const DRY_RUN = process.argv.includes("--dry-run");

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  if (DRY_RUN) logger.warn("DRY RUN — žádné změny se neuloží.");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  const prisma = app.get(PrismaService);
  const scoring = app.get(ScoringService);

  // Inzeráty bez jakéhokoli záznamu v listing_scores
  const withoutScore = await prisma.listing.findMany({
    where: { scores: { none: {} } },
    select: { id: true },
  });

  // Inzeráty se záznamem SCORING_FAILED (PostgreSQL JSONB containment)
  const failedRows = await prisma.$queryRaw<{ listing_id: string }[]>`
    SELECT listing_id
    FROM listing_scores
    WHERE risk_flags::jsonb @> '["SCORING_FAILED"]'::jsonb
  `;

  const ids = [
    ...new Set([
      ...withoutScore.map((l) => l.id),
      ...failedRows.map((r) => r.listing_id),
    ]),
  ];

  logger.log(
    `Inzeráty ke zpracování: ${ids.length} ` +
    `(${withoutScore.length} bez skóre, ${failedRows.length} s SCORING_FAILED)`,
  );

  if (ids.length === 0) {
    logger.log("Vše je aktuální, není co dělat.");
    await app.close();
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const listingId = ids[i];
    const prefix = `[${i + 1}/${ids.length}]`;

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) {
      logger.warn(`${prefix} Listing ${listingId} nenalezen, přeskakuji.`);
      continue;
    }

    logger.log(`${prefix} Skóruji ${listingId} (${listing.municipality ?? "neznámá lokalita"})`);

    try {
      const result = await scoring.calculateScore(listing);

      if (!DRY_RUN) {
        const scoreData = {
          totalScore:       result.totalScore,
          priceScore:       result.priceScore,
          locationScore:    result.locationScore,
          mortgageScore:    result.mortgageScore,
          growthScore:      result.growthScore,
          liquidityScore:   result.liquidityScore,
          riskPenalty:      result.riskPenalty,
          riskFlags:        result.riskFlags,
          priceVsMedianPct: result.priceVsMedianPct,
          scoringVersion:   result.scoringVersion,
          calculatedAt:     result.calculatedAt,
        };

        await prisma.listingScore.upsert({
          where:  { listingId },
          create: { listing: { connect: { id: listingId } }, ...scoreData },
          update: scoreData,
        });
      }

      logger.log(
        `  ✓ totalScore=${result.totalScore}` +
        (result.riskFlags.length ? ` flags=[${result.riskFlags.join(", ")}]` : ""),
      );
      success++;
    } catch (err) {
      logger.error(`  ✗ ${listingId}: ${(err as Error).message}`);
      failed++;
    }

    if (i < ids.length - 1) await sleep(DELAY_MS);
  }

  logger.log(`Hotovo: ${success} OK, ${failed} chyb, celkem ${ids.length}`);
  await app.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
