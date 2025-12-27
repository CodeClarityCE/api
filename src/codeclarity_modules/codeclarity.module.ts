import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { defaultOptions } from "src/app.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { PolicyModule } from "./policies/policy.module";
import { ResultsModule } from "./results/results.module";
import { TicketsModule } from "./tickets/tickets.module";

@Module({
  imports: [
    ResultsModule,
    PolicyModule,
    KnowledgeModule,
    DashboardModule,
    TicketsModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      name: "knowledge",
      useFactory: () => ({
        ...defaultOptions,
        autoLoadEntities: true,
        database: "knowledge",
        migrations: ["dist/migrations/knowledge/*.js"],
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      name: "codeclarity",
      useFactory: () => {
        const isTs = __filename.endsWith(".ts");
        return {
          ...defaultOptions,
          // Use explicit entity glob patterns instead of autoLoadEntities
          // This ensures ONLY entities matching these patterns are loaded
          // Entities from forFeature() work because they're loaded via glob first
          entities: [
            // Base modules (excluding plugins entity which belongs to 'plugins' DB)
            isTs
              ? "src/base_modules/!(plugins)/**/*.entity.ts"
              : "dist/base_modules/!(plugins)/**/*.entity.js",
            // CodeClarity modules: results, policies, dashboard (excluding knowledge)
            // Knowledge entities belong in 'knowledge' DB only
            isTs
              ? "src/codeclarity_modules/!(knowledge)/**/*.entity.ts"
              : "dist/codeclarity_modules/!(knowledge)/**/*.entity.js",
          ],
          database: "codeclarity",
          migrations: ["dist/migrations/codeclarity/*.js"],
        };
      },
    }),
  ],
})
export class CodeClarityModule {}
