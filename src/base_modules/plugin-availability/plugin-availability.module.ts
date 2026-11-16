import { Module } from "@nestjs/common";

import { ConsumerProbe } from "./consumer-probe";
import { PluginAvailabilityService } from "./plugin-availability.service";
import { RabbitMqConsumerProbe } from "./rabbitmq-consumer-probe";

@Module({
  providers: [
    PluginAvailabilityService,
    { provide: ConsumerProbe, useClass: RabbitMqConsumerProbe },
  ],
  exports: [PluginAvailabilityService],
})
export class PluginAvailabilityModule {}
