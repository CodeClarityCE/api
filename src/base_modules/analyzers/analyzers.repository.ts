import { Injectable } from '@nestjs/common';
import { Analyzer } from 'src/base_modules/analyzers/analyzer.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyzerDoesNotExist } from 'src/types/errors/types';

@Injectable()
export class AnalyzersRepository {
    constructor(
        @InjectRepository(Analyzer, 'codeclarity')
        private analyzerRepository: Repository<Analyzer>,
    ) { }

    async getAnalyzerById(analyzerId: string): Promise<Analyzer> {
        const analyzer = await this.analyzerRepository.findOneBy({
            id: analyzerId
        });

        if (!analyzer) {
            throw new AnalyzerDoesNotExist();
        }
        return analyzer
    }

}
