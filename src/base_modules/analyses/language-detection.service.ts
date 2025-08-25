import { Injectable } from '@nestjs/common';

export interface LanguageDetectionResult {
    detected_languages: string[];
    primary_language: string;
    detection_confidence: number;
    detected_files: {
        [language: string]: string[];
    };
}

@Injectable()
export class LanguageDetectionService {
    /**
     * Detect programming languages in a project based on file patterns and manifest files
     * This is a simplified detection service that can be enhanced with more sophisticated logic
     *
     * @param projectPath - Path to the project directory (for local analysis)
     * @param repositoryUrl - URL of the repository (for remote analysis)
     * @param branch - Branch to analyze
     * @returns Language detection results
     */
    async detectLanguages(
        _projectPath?: string,
        repositoryUrl?: string,
        _branch?: string
    ): Promise<LanguageDetectionResult> {
        // For now, implement a basic detection based on common manifest files
        // In a production environment, this could integrate with:
        // - GitHub Linguist API
        // - File system scanning
        // - Repository metadata analysis

        const detectedLanguages: string[] = [];
        const detectedFiles: { [language: string]: string[] } = {};

        // JavaScript detection patterns
        const jsFiles = ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

        // PHP detection patterns
        const phpFiles = ['composer.json', 'composer.lock'];

        // Python detection patterns (future use)
        const _pythonFiles = ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'];

        // This is a simplified implementation
        // In practice, you would scan the actual repository or file system

        // For demo purposes, detect based on common patterns
        // Real implementation would check actual files in the repository

        // Default detection logic for multi-language support
        // This should be enhanced with actual file system or repository API calls
        if (this.hasJavaScriptIndicators(repositoryUrl)) {
            detectedLanguages.push('javascript');
            detectedFiles.javascript = jsFiles;
        }

        if (this.hasPHPIndicators(repositoryUrl)) {
            detectedLanguages.push('php');
            detectedFiles.php = phpFiles;
        }

        // If no languages detected, we should return empty rather than assuming JavaScript
        // This forces proper repository scanning or manual language specification
        if (detectedLanguages.length === 0) {
            console.warn('No programming languages detected for repository:', repositoryUrl);
            // Don't assume JavaScript - let the analysis fail properly so it can be investigated
        }

        // Determine primary language (first detected or most common)
        const primaryLanguage = detectedLanguages.length > 0 ? detectedLanguages[0] : 'unknown';

        // Calculate confidence based on number of indicator files found
        // Lower confidence if no languages detected
        const confidence =
            detectedLanguages.length > 0
                ? Math.min(0.9, 0.3 + detectedLanguages.length * 0.3)
                : 0.0;

        return {
            detected_languages: detectedLanguages,
            primary_language: primaryLanguage,
            detection_confidence: confidence,
            detected_files: detectedFiles
        };
    }

    /**
     * Check if repository has JavaScript/Node.js indicators
     * This is a simplified check - in practice would scan actual repository
     */
    private hasJavaScriptIndicators(repositoryUrl?: string): boolean {
        if (!repositoryUrl) return false;

        const jsPatterns = [
            'node',
            'npm',
            'yarn',
            'react',
            'vue',
            'angular',
            'express',
            'next',
            'javascript',
            'js',
            'typescript',
            'ts'
        ];

        const urlLower = repositoryUrl.toLowerCase();
        return jsPatterns.some((pattern) => urlLower.includes(pattern));
    }

    /**
     * Check if repository has PHP indicators
     * This is a simplified check - in practice would scan actual repository
     */
    private hasPHPIndicators(repositoryUrl?: string): boolean {
        // Simplified logic - could be enhanced to check repository via API
        // Look for common PHP framework patterns in URL or repository metadata
        if (!repositoryUrl) return false;

        const phpPatterns = [
            'laravel',
            'symfony',
            'wordpress',
            'drupal',
            'cakephp',
            'codeigniter',
            'slim',
            'yii',
            'composer',
            'php',
            // Add common PHP applications and libraries
            'magento', // E-commerce platform
            'prestashop', // E-commerce platform
            'phpunit', // Testing framework
            'doctrine', // ORM
            'twig', // Template engine
            'monolog', // Logging library
            'guzzle', // HTTP client
            'phpmailer', // Email library
            'phpbb', // Forum software
            'mediawiki', // Wiki software
            'opencart', // E-commerce
            'phpmyadmin' // Database administration
        ];

        const urlLower = repositoryUrl.toLowerCase();
        return phpPatterns.some((pattern) => urlLower.includes(pattern));
    }

    /**
     * Validate that the analyzer supports the detected languages
     */
    validateAnalyzerLanguageSupport(
        detectedLanguages: string[],
        analyzerSupportedLanguages: string[]
    ): { supported: string[]; unsupported: string[] } {
        const supported = detectedLanguages.filter((lang) =>
            analyzerSupportedLanguages.includes(lang)
        );

        const unsupported = detectedLanguages.filter(
            (lang) => !analyzerSupportedLanguages.includes(lang)
        );

        return { supported, unsupported };
    }

    /**
     * Get the supported languages for the platform
     */
    getSupportedLanguages(): string[] {
        return ['javascript', 'php'];
    }
}
