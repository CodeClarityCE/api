import { Injectable } from '@nestjs/common';
import { EntityNotFound } from 'src/types/errors/types';
import { Package } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class NPMPackageRepository {
    constructor(
        @InjectRepository(Package, 'knowledge')
        private packageRepository: Repository<Package>
    ) {}

    async getNpmPackageData(dependencyName: string): Promise<Package> {
        const dependency = await this.packageRepository.findOne({
            where: {
                name: dependencyName
            }
        });
        if (!dependency) {
            throw new EntityNotFound();
        }
        return dependency;
    }
}
