import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/base_modules/users/users.entity';
import { EntityNotFound, UserDoesNotExist } from 'src/types/error.types';
import { Repository } from 'typeorm';

/**
 * Pure repository for user database operations.
 * Does NOT depend on other repositories - cross-entity logic belongs in services.
 */
@Injectable()
export class UsersRepository {
    constructor(
        @InjectRepository(User, 'codeclarity')
        private userRepository: Repository<User>
    ) {}

    /**
     * Return the user with the given id.
     * @throws {EntityNotFound} in case no user with the given userId could be found
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
     * Return the user with the given email.
     * @throws {UserDoesNotExist} in case no user with the given email could be found
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

    /**
     * Check if a user with the given email exists.
     */
    async userExistsByEmail(mail: string): Promise<boolean> {
        return this.userRepository.existsBy({ email: mail });
    }

    /**
     * Save a user entity to the database.
     */
    async saveUser(user: User): Promise<User> {
        return this.userRepository.save(user);
    }

    /**
     * Delete a user by ID.
     * Note: Cross-entity cleanup (memberships, projects) should be handled by the service layer.
     */
    async deleteUser(userId: string): Promise<void> {
        await this.userRepository.delete(userId);
    }
}
