import { IsNotEmpty, Length } from 'class-validator';

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class AnalyzerCreateBody {
    @IsNotEmpty()
    steps: Stage[][];

    @IsNotEmpty()
    @Length(5, 50)
    name: string;

    @IsNotEmpty()
    @Length(10, 250)
    description: string;

    supported_languages?: string[];

    language_config?: {
        javascript?: { plugins: string[] };
        php?: { plugins: string[] };
        [key: string]: { plugins: string[] } | undefined;
    };

    logo?: string;
}

/********************************************/
/*                Other types               */
/********************************************/

export interface StageBase {
    name: string;
    version: string;
}

export interface Stage extends StageBase {
    config: { [key: string]: any };
    persistant_config: { [key: string]: any };
}
