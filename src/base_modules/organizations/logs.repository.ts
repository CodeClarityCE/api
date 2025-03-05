import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Injectable } from "@nestjs/common";
import { Log } from "./log.entity";

/**
 * Injectable service for handling logs.
 */
@Injectable()
export class LogsRepository {
    /**
     * Constructor to initialize the log repository.
     *
     * @param logRepository - Repository for managing logs, connected to 'codeclarity' database.
     */
    constructor(
        @InjectRepository(Log, 'codeclarity')
        private logRepository: Repository<Log>,
    ) {}

    /**
     * Method to save a log entry to the repository.
     *
     * @param log - Log object to be saved in the repository.
     * @returns A promise that resolves to the saved log entry.
     */
    async saveLog(log: Log): Promise<Log> {
        return this.logRepository.save(log);
    }
}