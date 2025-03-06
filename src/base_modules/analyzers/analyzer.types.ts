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
