import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { ScoringModule } from "./scoring/scoring.module";
import { ListingsModule } from "./listings/listings.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    ScoringModule,
    ListingsModule,
    // Moduly se přidají postupně:
    // AuthModule,
    // SearchModule,
    // ClientsModule,
    // WatchlistsModule,
    // NotesModule,
    // ReportsModule,
    // AnalyticsModule,
    // ConnectorsModule,
  ],
})
export class AppModule {}
