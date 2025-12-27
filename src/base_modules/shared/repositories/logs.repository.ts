import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Log } from "src/base_modules/organizations/log/log.entity";
import { Repository } from "typeorm";

/**
 * Pure repository for log database operations.
 */
@Injectable()
export class LogsRepository {
  constructor(
    @InjectRepository(Log, "codeclarity")
    private logRepository: Repository<Log>,
  ) {}

  /**
   * Save a log entry.
   */
  async saveLog(log: Log): Promise<Log> {
    return this.logRepository.save(log);
  }
}
