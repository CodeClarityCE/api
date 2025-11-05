import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/base_modules/users/users.entity';
import { EntityNotFound, UserDoesNotExist } from 'src/types/error.types';
import { Repository } from 'typeorm';

import { OrganizationsRepository } from '../organizations/organizations.repository';
import { ProjectsRepository } from '../projects/projects.repository';

/**
 * This service offers methods for working with users
 */
@Injectable()
export class UsersRepository {
    constructor(
        private readonly organizationsRepository: OrganizationsRepository,
        private readonly projectsRepository: ProjectsRepository,
        @InjectRepository(User, 'codeclarity')
        private userRepository: Repository<User>
    ) {}

    /**
     * Return the user with the given id.
     * @throws {EntityNotFound} in case no user with the given userId could be found
     *
     * @param userId userId
     * @returns the user
     */
    async getUserById(userId: string, relations?: object): Promise<User> {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            ...(relations ? { relations: relations } : {})
        });

        if (!user) {
            throw new EntityNotFound();
        }

        return user;
    }

    /**
     * Return the user with the given id.
     * @throws {EntityNotFound} in case no user with the given userId could be found
     *
     * @param email user's email
     * @returns the user
     */
    async getUserByEmail(mail: string): Promise<User> {
        const user = await this.userRepository.findOneBy({
            email: mail
        });

        if (!user) {
            throw new UserDoesNotExist();
        }

        return user;
    }

    async saveUser(user: User): Promise<User> {
        return this.userRepository.save(user);
    }

    async deleteUser(userId: string) {
        await this.organizationsRepository.removeUserMemberships(userId);
        await this.projectsRepository.deleteUserProjects(userId);
        await this.userRepository.delete(userId);
    }
}
