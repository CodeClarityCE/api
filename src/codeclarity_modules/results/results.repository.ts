import { Injectable } from '@nestjs/common';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityNotFound } from 'src/types/error.types';

@Injectable()
export class AnalysisResultsRepository {
    constructor(
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async delete(resultId: string) {
        await this.resultRepository.delete(resultId);
    }

    async remove(result: Result) {
        await this.resultRepository.remove(result);
    }

    async removeResults(result: Result[]) {
        await this.resultRepository.remove(result);
    }

    async getByAnalysisId(analysisId: string, relations?: object): Promise<Result> {
        const analysis = await this.resultRepository.findOne({
            where: {
                analysis: { id: analysisId }
            },
            relations: relations
        });

        if (!analysis) {
            throw new EntityNotFound();
        }

        return analysis;
    }

    async getByAnalysisIdAndPluginType(analysisId: string, plugin: string, relations?: object) {
        const analysis = await this.resultRepository.findOne({
            where: {
                analysis: { id: analysisId },
                plugin: plugin
            },
            relations: relations
        });

        return analysis;
    }

    async resultOfAnalysisReady(analysysId: string): Promise<boolean> {
        return this.resultRepository.exists({
            where: {
                analysis: { id: analysysId }
            }
        });
    }

    async getAllByAnalysisId(analysisId: string): Promise<Result[]> {
        return this.resultRepository.find({
            where: {
                analysis: { id: analysisId }
            },
            order: {
                plugin: 'ASC'
            }
        });
    }
}
