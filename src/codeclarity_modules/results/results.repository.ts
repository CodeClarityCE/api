import { Injectable } from '@nestjs/common';
import { Result } from 'src/codeclarity_modules/results/result.entity';
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
