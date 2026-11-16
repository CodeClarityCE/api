import { Module } from "@nestjs/common";

import { PluginModule } from "../plugins/plugin.module";

import { ConsumerProbe } from "./consumer-probe";
import { PluginAvailabilityService } from "./plugin-availability.service";
import { PluginDownWatch } from "./plugin-down-watch";
import { RabbitMqConsumerProbe } from "./rabbitmq-consumer-probe";

@Module({
  imports: [PluginModule], // For the registered plugins to watch
  providers: [
    PluginAvailabilityService,
    PluginDownWatch,
    { provide: ConsumerProbe, useClass: RabbitMqConsumerProbe },
  ],
  exports: [PluginAvailabilityService],
})
export class PluginAvailabilityModule {}
