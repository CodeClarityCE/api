import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { GraphModule } from './graphs/graphs.module';
import { SampleModule } from './samples/samples.module';

@Module({
    imports: [
        SampleModule,
        GraphModule,
        ChatModule
    ],
    providers: [],
    controllers: []
})
export class EnterpriseModule {}
