import { IsArray, IsNotEmpty, Length } from "class-validator";

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class AnalyzerCreateBody {
  @IsArray({ each: true })
  @IsArray()
  steps!: Stage[][];

  // The name column is varchar(25).
  @IsNotEmpty()
  @Length(5, 25)
  name!: string;

  @IsNotEmpty()
  @Length(10, 250)
  description!: string;

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
  config: Record<string, unknown>;
  persistant_config: Record<string, unknown>;
}
