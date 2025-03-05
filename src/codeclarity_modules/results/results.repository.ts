import { Injectable } from '@nestjs/common';
import { Result } from 'src/entity/codeclarity/Result';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class AnalysisResultsRepository {
    constructor(

        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>,
    ) { }

    async delete(resultId: string) {
        await this.resultRepository.delete(resultId)
    }

    async remove(result: Result) {
        await this.resultRepository.remove(result)
    }
}
