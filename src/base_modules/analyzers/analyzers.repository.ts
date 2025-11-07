import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Analyzer } from 'src/base_modules/analyzers/analyzer.entity';
import { NotAuthorized } from 'src/types/error.types';
import { TypedPaginatedData } from 'src/types/pagination.types';
import { Repository } from 'typeorm';
import { AnalyzerDoesNotExist } from './analyzers.errors';

/**
 * Service that handles the database operations related to Analyzers.
 */
@Injectable()
export class AnalyzersRepository {
    constructor(
        @InjectRepository(Analyzer, 'codeclarity')
        private analyzerRepository: Repository<Analyzer>
    ) {}

    /**
     * Finds an Analyzer by its ID and returns it.
     * Throws an AnalyzerDoesNotExist error if no Analyzer is found with the given ID.
     *
     * @param analyzerId - The ID of the Analyzer to find.
     * @returns A promise that resolves to the found Analyzer.
     */
    async getAnalyzerById(analyzerId: string): Promise<Analyzer> {
        const analyzer = await this.analyzerRepository.findOneBy({
            id: analyzerId
        });

        if (!analyzer) {
            throw new AnalyzerDoesNotExist();
        }
        return analyzer;
    }

    /**
     * Saves an Analyzer to the database.
     *
     * @param analyzer - The Analyzer to save.
     * @returns A promise that resolves to the saved Analyzer.
     */
    async saveAnalyzer(analyzer: Analyzer): Promise<Analyzer> {
        return this.analyzerRepository.save(analyzer);
    }

    /**
     * Deletes an Analyzer from the database by its ID.
     *
     * @param analyzerId - The ID of the Analyzer to delete.
     */
    async deleteAnalyzer(analyzerId: string): Promise<void> {
        await this.analyzerRepository.delete(analyzerId);
    }

    /**
     * Checks whether an Analyzer with a given ID belongs to an Organization with a given ID.
     * Throws a NotAuthorized error if the Analyzer does not belong to the Organization.
     *
     * @param analyzerId - The ID of the Analyzer.
     * @param orgId - The ID of the Organization.
     */
    async doesAnalyzerBelongToOrg(analyzerId: string, orgId: string): Promise<void> {
        // Check if analyzer is global
        let analyzer = await this.analyzerRepository.findOne({
            where: {
                global: true,
                id: analyzerId
            }
        });
        if (analyzer) {
            return;
        }

        // Else check if it belongs to organization
        analyzer = await this.analyzerRepository.findOne({
            relations: {
                organization: true
            },
            where: { id: analyzerId, organization: { id: orgId } }
        });
        if (!analyzer) {
            throw new NotAuthorized();
        }
    }

    /**
     * Finds an Analyzer by its name and Organization ID.
     * Throws an error if no Analyzer is found with the given name and Organization ID.
     *
     * @param name - The name of the Analyzer.
     * @param orgId - The ID of the Organization.
     * @returns A promise that resolves to the found Analyzer.
     */
    async getByNameAndOrganization(name: string, orgId: string): Promise<Analyzer> {
        const analyzer = await this.analyzerRepository
            .createQueryBuilder('analyzer')
            .leftJoinAndSelect('analyzer.organization', 'organization')
            .where('(organization.id = :orgId or analyzer.global = true)', { orgId })
            .andWhere('analyzer.name = :name', { name })
            .getOne();

        if (!analyzer) {
            throw new Error('Analyzer not found');
        }
        return analyzer;
    }

    /**
     * Fetches a paginated list of Analyzers for a given Organization ID.
     *
     * @param orgId - The ID of the Organization.
     * @param currentPage - The current page number (for pagination).
     * @param entriesPerPage - The number of entries per page (for pagination).
     * @returns A promise that resolves to a paginated list of Analyzers.
     */
    async getManyAnalyzers(
        orgId: string,
        currentPage: number,
        entriesPerPage: number
    ): Promise<TypedPaginatedData<Analyzer>> {
        const analyzersQueryBuilder = this.analyzerRepository
            .createQueryBuilder('analyzer')
            .leftJoinAndSelect('analyzer.organization', 'organization')
            .where('organization.id = :orgId', { orgId })
            .orWhere('analyzer.global = true');

        const fullCount = await analyzersQueryBuilder.getCount();

        const analyzers = await analyzersQueryBuilder
            .skip(currentPage * entriesPerPage)
            .take(entriesPerPage)
            .getMany();

        return {
            data: analyzers,
            page: currentPage,
            entry_count: analyzers.length,
            entries_per_page: entriesPerPage,
            total_entries: fullCount,
            total_pages: Math.ceil(fullCount / entriesPerPage),
            matching_count: fullCount, // once you apply filters this needs to change
            filter_count: {}
        };
    }
}
