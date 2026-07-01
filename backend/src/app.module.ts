import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    // Moduly se přidají postupně:
    // AuthModule,
    // ListingsModule,
    // SearchModule,
    // ClientsModule,
    // WatchlistsModule,
    // NotesModule,
    // ReportsModule,
    // AnalyticsModule,
    // ScoringModule,
    // ConnectorsModule,
  ],
})
export class AppModule {}
