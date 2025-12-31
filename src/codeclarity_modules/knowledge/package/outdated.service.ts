import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { compare as semverCompare, valid as semverValid } from "semver";
import { Repository, In } from "typeorm";
import {
  OutdatedCheckRequestBody,
  OutdatedCheckResponse,
  PackageEcosystem,
  PackageVersionResult,
  PackageVersionRequestItem,
} from "./outdated.types";
import { Package } from "./package.entity";

@Injectable()
export class OutdatedCheckService {
  // Simple in-memory cache
  private cache = new Map<
    string,
    { data: PackageVersionResult; timestamp: number }
  >();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly CACHE_MAX_SIZE = 5000; // Maximum cache entries

  constructor(
    @InjectRepository(Package, "knowledge")
    private packageRepository: Repository<Package>,
  ) {}

  /**
   * Check multiple packages for outdated versions
   * @param request Request containing packages to check
   * @returns Response with outdated check results
   */
  async checkOutdated(
    request: OutdatedCheckRequestBody,
  ): Promise<OutdatedCheckResponse> {
    const results: PackageVersionResult[] = [];

    // Group packages by ecosystem for optimized queries
    const npmPackages = request.packages.filter(
      (p) => p.ecosystem === PackageEcosystem.NPM,
    );
    const packagistPackages = request.packages.filter(
      (p) => p.ecosystem === PackageEcosystem.PACKAGIST,
    );

    // Check cache and identify packages needing database lookup
    const uncachedNpm: PackageVersionRequestItem[] = [];
    const uncachedPackagist: PackageVersionRequestItem[] = [];

    for (const pkg of npmPackages) {
      const cached = this.getFromCache(pkg.name, pkg.ecosystem);
      if (cached) {
        results.push({
          ...cached,
          currentVersion: pkg.currentVersion,
          isOutdated: this.isVersionOutdated(
            pkg.currentVersion,
            cached.latestVersion,
          ),
        });
      } else {
        uncachedNpm.push(pkg);
      }
    }

    for (const pkg of packagistPackages) {
      const cached = this.getFromCache(pkg.name, pkg.ecosystem);
      if (cached) {
        results.push({
          ...cached,
          currentVersion: pkg.currentVersion,
          isOutdated: this.isVersionOutdated(
            pkg.currentVersion,
            cached.latestVersion,
          ),
        });
      } else {
        uncachedPackagist.push(pkg);
      }
    }

    // Batch query for uncached npm packages
    if (uncachedNpm.length > 0) {
      const npmResults = await this.batchCheckPackages(
        uncachedNpm,
        "javascript",
        PackageEcosystem.NPM,
      );
      results.push(...npmResults);
    }

    // Batch query for uncached packagist packages
    if (uncachedPackagist.length > 0) {
      const packagistResults = await this.batchCheckPackages(
        uncachedPackagist,
        "php",
        PackageEcosystem.PACKAGIST,
      );
      results.push(...packagistResults);
    }

    return {
      packages: results,
      checkedAt: new Date().toISOString(),
    };
  }

  private async batchCheckPackages(
    packages: PackageVersionRequestItem[],
    language: string,
    ecosystem: PackageEcosystem,
  ): Promise<PackageVersionResult[]> {
    const results: PackageVersionResult[] = [];
    const packageNames = packages.map((p) => p.name);

    // Batch query packages from database
    const dbPackages = await this.packageRepository.find({
      where: {
        name: In(packageNames),
        language: language,
      },
      select: ["name", "latest_version"],
    });

    // Create lookup map
    const packageMap = new Map<string, string>();
    for (const dbPkg of dbPackages) {
      packageMap.set(dbPkg.name, dbPkg.latest_version);
    }

    // Build results
    for (const pkg of packages) {
      const latestVersion = packageMap.get(pkg.name) ?? null;
      const result: PackageVersionResult = {
        name: pkg.name,
        currentVersion: pkg.currentVersion,
        latestVersion,
        isOutdated: this.isVersionOutdated(pkg.currentVersion, latestVersion),
        ecosystem,
      };

      results.push(result);

      // Add to cache (only cache the latest version lookup)
      this.addToCache(pkg.name, ecosystem, latestVersion);
    }

    return results;
  }

  private isVersionOutdated(
    currentVersion: string,
    latestVersion: string | null,
  ): boolean {
    if (!latestVersion) {
      return false; // Can't determine if outdated without latest version
    }

    // Validate semver versions
    const validCurrent = semverValid(currentVersion);
    const validLatest = semverValid(latestVersion);

    if (!validCurrent || !validLatest) {
      // Fall back to string comparison for non-semver versions
      return currentVersion !== latestVersion;
    }

    // Compare versions: returns -1 if current < latest (outdated)
    return semverCompare(validCurrent, validLatest) < 0;
  }

  private getCacheKey(name: string, ecosystem: PackageEcosystem): string {
    return `${ecosystem}:${name}`;
  }

  private getFromCache(
    name: string,
    ecosystem: PackageEcosystem,
  ): PackageVersionResult | null {
    const key = this.getCacheKey(name, ecosystem);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if cache entry is expired
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private addToCache(
    name: string,
    ecosystem: PackageEcosystem,
    latestVersion: string | null,
  ): void {
    // Prevent cache from growing too large
    if (this.cache.size >= this.CACHE_MAX_SIZE) {
      // Remove oldest entries (simple LRU)
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 500);
      oldestKeys.forEach((k) => this.cache.delete(k));
    }

    const key = this.getCacheKey(name, ecosystem);
    this.cache.set(key, {
      data: {
        name,
        currentVersion: "", // Will be filled in when retrieved
        latestVersion,
        isOutdated: false, // Will be recalculated when retrieved
        ecosystem,
      },
      timestamp: Date.now(),
    });
  }
}
