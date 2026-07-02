import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScoringController } from "./scoring.controller";
import { ScoringService } from "./scoring.service";
import { ReasService } from "./reas.service";

@Module({
  imports: [ConfigModule],
  controllers: [ScoringController],
  providers: [ScoringService, ReasService],
  exports: [ScoringService, ReasService],
})
export class ScoringModule {}
