/**
 * Ecosystem Mapper for SBOM Multi-Language Support
 *
 * This service maps SBOM plugins to their corresponding package ecosystems.
 * Designed to be easily extensible for future language support.
 */

export interface EcosystemInfo {
    name: string;
    ecosystem: string;
    language: string;
    packageManagerPattern: RegExp;
    defaultPackageManager: string;
}

/**
 * Plugin to ecosystem mapping
 *
 * To add a new language:
 * 1. Add the plugin name as a key
 * 2. Define the ecosystem information
 * 3. The system will automatically support it
 */
export const PLUGIN_ECOSYSTEM_MAP: Record<string, EcosystemInfo> = {
    'js-sbom': {
        name: 'npm Registry',
        ecosystem: 'npm',
        language: 'JavaScript',
        packageManagerPattern: /(npm|yarn|pnpm|bun)/i,
        defaultPackageManager: 'npm'
    },
    'php-sbom': {
        name: 'Packagist',
        ecosystem: 'packagist',
        language: 'PHP',
        packageManagerPattern: /composer/i,
        defaultPackageManager: 'composer'
    },
    // Future language support examples:
    'python-sbom': {
        name: 'PyPI',
        ecosystem: 'pypi',
        language: 'Python',
        packageManagerPattern: /(pip|poetry|pipenv|conda)/i,
        defaultPackageManager: 'pip'
    },
    'rust-sbom': {
        name: 'crates.io',
        ecosystem: 'cargo',
        language: 'Rust',
        packageManagerPattern: /cargo/i,
        defaultPackageManager: 'cargo'
    },
    'java-sbom': {
        name: 'Maven Central',
        ecosystem: 'maven',
        language: 'Java',
        packageManagerPattern: /(maven|gradle|sbt)/i,
        defaultPackageManager: 'maven'
    },
    'dotnet-sbom': {
        name: 'NuGet',
        ecosystem: 'nuget',
        language: 'C#',
        packageManagerPattern: /(dotnet|nuget|paket)/i,
        defaultPackageManager: 'dotnet'
    },
    'go-sbom': {
        name: 'Go Modules',
        ecosystem: 'go',
        language: 'Go',
        packageManagerPattern: /go/i,
        defaultPackageManager: 'go'
    },
    'ruby-sbom': {
        name: 'RubyGems',
        ecosystem: 'rubygems',
        language: 'Ruby',
        packageManagerPattern: /(gem|bundler)/i,
        defaultPackageManager: 'gem'
    }
};

export class EcosystemMapper {
    /**
     * Gets ecosystem info for a given plugin name
     */
    static getEcosystemInfo(pluginName: string): EcosystemInfo | null {
        return PLUGIN_ECOSYSTEM_MAP[pluginName] || null;
    }

    /**
     * Gets all supported SBOM plugins
     */
    static getSupportedSbomPlugins(): string[] {
        return Object.keys(PLUGIN_ECOSYSTEM_MAP);
    }

    /**
     * Gets all supported ecosystems
     */
    static getSupportedEcosystems(): string[] {
        return Object.values(PLUGIN_ECOSYSTEM_MAP).map((info) => info.ecosystem);
    }

    /**
     * Gets ecosystem info by ecosystem name
     */
    static getEcosystemByName(ecosystem: string): EcosystemInfo | null {
        const entry = Object.values(PLUGIN_ECOSYSTEM_MAP).find(
            (info) => info.ecosystem === ecosystem
        );
        return entry || null;
    }

    /**
     * Maps package manager string to ecosystem
     */
    static mapPackageManagerToEcosystem(packageManager: string): string | null {
        for (const [, info] of Object.entries(PLUGIN_ECOSYSTEM_MAP)) {
            if (info.packageManagerPattern.test(packageManager)) {
                return info.ecosystem;
            }
        }
        return null;
    }

    /**
     * Validates if an ecosystem filter is supported
     */
    static isValidEcosystem(ecosystem: string): boolean {
        return this.getSupportedEcosystems().includes(ecosystem);
    }

    /**
     * Gets ecosystem from dependency PURL (Package URL) if available
     */
    static getEcosystemFromPurl(purl: string): string | null {
        if (!purl || !purl.startsWith('pkg:')) {
            return null;
        }

        try {
            const purlParts = purl.split('/');
            const typeWithPrefix = purlParts[0]; // "pkg:type"
            const type = typeWithPrefix.split(':')[1]; // "type"

            // Map PURL types to our ecosystem names
            const purlToEcosystem: Record<string, string> = {
                npm: 'npm',
                composer: 'packagist',
                pypi: 'pypi',
                cargo: 'cargo',
                maven: 'maven',
                nuget: 'nuget',
                golang: 'go',
                gem: 'rubygems'
            };

            return purlToEcosystem[type] || null;
        } catch {
            return null;
        }
    }

    /**
     * Detects ecosystem from dependency name patterns
     */
    static detectEcosystemFromName(name: string): string | null {
        // PHP Composer packages typically have vendor/package format
        if (name.includes('/') && !name.startsWith('@')) {
            return 'packagist';
        }

        // npm scoped packages start with @
        if (name.startsWith('@')) {
            return 'npm';
        }

        // Go modules typically have domain/path format
        if (name.includes('.') && name.includes('/')) {
            return 'go';
        }

        return null;
    }
}
