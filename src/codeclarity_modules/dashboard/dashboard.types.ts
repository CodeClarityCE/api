import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { OptionalTransform } from 'src/transformers/transformer';
import { SortDirection } from 'src/types/sort.types';
import { IntegrationProvider } from '../../base_modules/integrations/integration.types';

export class DashboardQueryOptions {
    @IsOptional()
    @IsDateString()
    @OptionalTransform((v: unknown) => new Date(v as string))
    startDate?: Date;
    @IsOptional()
    @IsDateString()
    @OptionalTransform((v: unknown) => new Date(v as string))
    endDate?: Date;
    @IsOptional()
    @IsString({ each: true })
    @Transform(({ value }: { value: unknown }) => {
        if (Array.isArray(value)) {
            return value as string[];
        } else {
            return [value as string];
        }
    })
    integrationIds?: string[];
}

export class GetWeeklySeverityInfoQueryOptions extends DashboardQueryOptions {}
export class GetOverallAttackVectorDistQueryOptions extends DashboardQueryOptions {}
export class GetOverallCIADistQueryOptions extends DashboardQueryOptions {}
export class GetOverallLicenseDistQueryOptions extends DashboardQueryOptions {}
export class GetRecentVulnsQueryOptions extends DashboardQueryOptions {}
export class GetQuickStatsQueryOptions extends DashboardQueryOptions {}
export class GetProjectsQuickStatsQueryOptions extends DashboardQueryOptions {
    @IsOptional()
    @IsNumber()
    @Transform(({ value }: { value: string }) => parseInt(value, 10))
    page = 0;
    @IsOptional()
    @IsNumber()
    @Transform(({ value }: { value: string }) => parseInt(value, 10))
    entries_per_page = 10;
    @IsNotEmpty()
    sort_key?: string;
    @IsOptional()
    @IsEnum(SortDirection)
    sort_direction?: SortDirection;
}

export enum Trend {
    UP = 'UP',
    DOWN = 'DOWN',
    EQUAL = 'EQUAL'
}

export interface StatsTrend {
    trend: Trend;
    diff?: number;
}

export class WeekNumberGroup {
    @ApiProperty()
    week!: number;
    @ApiProperty()
    year!: number;
}

export class SeverityInfoByWeek {
    @ApiProperty()
    week_number!: WeekNumberGroup;
    @ApiProperty()
    nmb_critical!: number;
    @ApiProperty()
    nmb_high!: number;
    @ApiProperty()
    nmb_medium!: number;
    @ApiProperty()
    nmb_low!: number;
    @ApiProperty()
    nmb_none!: number;
    @ApiProperty()
    summed_severity!: number;

    projects!: string[];
}

export class SeverityInfoByWeekInternal {
    project_id!: string;
    analysis_date!: WeekNumberGroup;
    week_number!: WeekNumberGroup;
    nmb_critical!: number;
    nmb_high!: number;
    nmb_medium!: number;
    nmb_low!: number;
    nmb_none!: number;
    summed_severity!: number;
}

export class AttackVectorDist {
    @ApiProperty()
    attack_vector!: string;
    @ApiProperty()
    count!: number;
}

export class CIAImpact {
    @ApiProperty()
    cia!: string;
    @ApiProperty()
    impact!: number;
}

export class CIAImpactInternal {
    c!: number;
    i!: number;
    a!: number;
}

export class LatestVulnInfo {
    @ApiProperty()
    @OptionalTransform((v) => v)
    severity!: number;
    @ApiProperty()
    @OptionalTransform((v) => v)
    severity_class!: string;
    @ApiProperty()
    @OptionalTransform((v) => v)
    cwe!: string;
    @ApiProperty()
    cwe_name!: string;
}

export class SeverityClassCount {
    @ApiProperty()
    severity_class!: string | null;
    @ApiProperty()
    count!: number;
}

export class LatestVulns {
    // @ApiProperty({ type: [LatestVuln] })
    vulns!: Record<string, LatestVulnInfo>;
    @ApiProperty({ type: [SeverityClassCount] })
    severity_count!: SeverityClassCount[];
}

export interface QuickStatsInternal {
    max_grade: number;
    avg_severity: number;
    nmb_deprecated: number;
    owasp_top_10_cwe_id: string | null;
    cia: {
        c: number;
        i: number;
        a: number;
    };
}

export enum ProjectGradeClass {
    A_PLUS = 'A+',
    A = 'A',
    B_PLUS = 'B+',
    B = 'B',
    C_PLUS = 'C+',
    C = 'C',
    D_PLUS = 'D+',
    D = 'D'
}

export class ProjectGrade {
    @ApiProperty()
    score!: number;
    @ApiProperty()
    class!: ProjectGradeClass;
}

export class QuickStats {
    @ApiProperty()
    max_grade!: ProjectGrade;
    @ApiProperty()
    max_grade_trend!: StatsTrend;
    @ApiProperty()
    nmb_deprecated!: number;
    @ApiProperty()
    nmb_deprecated_trend!: StatsTrend;
    @ApiProperty()
    owasp_top_10?: string;
    @ApiProperty()
    most_affected_cia?: string;
}

export class ProjectGroup {
    @ApiProperty()
    id!: string;
    @ApiProperty()
    name!: string;
    @ApiProperty()
    provider!: IntegrationProvider;
    @ApiProperty()
    url!: string;
}

export class ProjectQuickStatsInternal {
    project!: ProjectGroup;
    nmb_license_compliance_violations!: number;
    nmb_vulnerabilities!: number;
    nmb_deprecated!: number;
    nmb_outdated!: number;
    sum_severity!: number;
    avg_severity!: number;
    grade!: number;
}

export class ProjectQuickStats {
    @ApiProperty()
    project!: ProjectGroup;
    @ApiProperty()
    nmb_license_compliance_violations!: number;
    @ApiProperty()
    nmb_vulnerabilities!: number;
    @ApiProperty()
    nmb_deprecated!: number;
    @ApiProperty()
    nmb_outdated!: number;
    @ApiProperty()
    sum_severity!: number;
    @ApiProperty()
    avg_severity!: number;
    @ApiProperty()
    grade!: ProjectGrade;
}
