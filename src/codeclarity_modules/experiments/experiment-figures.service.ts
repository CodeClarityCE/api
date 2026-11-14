import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsSelect, Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { EntityNotFound } from "src/types/error.types";

import { Experiment } from "./experiment.entity";
import { isUniqueViolation } from "./experiment-db-errors";
import { ExperimentFigure } from "./experiment-figure.entity";
import {
  definitionKey,
  FIGURE_CATALOG,
  type FigureCatalog,
  type FigureDefinition,
  parseFigureDefinition,
} from "./experiment-figure-catalog";
import { computeFigureData, type FigureData } from "./experiment-figure-data";
import { METRIC_VERSION } from "./experiment-metric-version";
import { ExperimentPublishedFigureData } from "./experiment-published-figure-data.entity";
import { ExperimentPublishedResults } from "./experiment-published-results.entity";
import { ExperimentResultsService } from "./experiment-results.service";
import { FigureVersionNotCurrent } from "./experiments.errors";
import { findExperimentInOrg } from "./experiments.service";

export interface FigureSummary {
  id: string;
  name: string;
  definition: FigureDefinition;
  created_on: Date;
  /** The Published results version it is tied to; null while a draft */
  metric_version: number | null;
}

/** Leaves out the frozen results payload of the linked version. */
const FIGURE_COLUMNS: FindOptionsSelect<ExperimentFigure> = {
  id: true,
  name: true,
  definition: true,
  created_on: true,
  published_results: { id: true, metric_version: true },
};

/** Previews kept per API instance; the oldest is dropped first */
const FIGURE_CACHE_ENTRIES = 256;

function summary(figure: ExperimentFigure): FigureSummary {
  return {
    id: figure.id,
    name: figure.name,
    definition: figure.definition,
    created_on: figure.created_on,
    metric_version: figure.published_results?.metric_version ?? null,
  };
}

/** Saved Figures of an experiment, and the data they plot. */
@Injectable()
export class ExperimentFiguresService {
  private readonly dataCache = new Map<string, Promise<FigureData>>();

  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    @InjectRepository(Experiment, "codeclarity")
    private readonly experimentRepository: Repository<Experiment>,
    @InjectRepository(ExperimentFigure, "codeclarity")
    private readonly figureRepository: Repository<ExperimentFigure>,
    @InjectRepository(ExperimentPublishedResults, "codeclarity")
    private readonly publishedRepository: Repository<ExperimentPublishedResults>,
    @InjectRepository(ExperimentPublishedFigureData, "codeclarity")
    private readonly figureDataRepository: Repository<ExperimentPublishedFigureData>,
    private readonly resultsService: ExperimentResultsService,
  ) {}

  /** @throws {NotAuthorized} @throws {EntityNotFound} */
  async catalog(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<FigureCatalog> {
    await this.experimentFor(orgId, experimentId, user);
    return FIGURE_CATALOG;
  }

  /**
   * Plots a definition: the composer's preview and a reopened Figure.
   * @throws {InvalidFigureDefinition} If the catalog does not allow it
   */
  async computeData(
    orgId: string,
    experimentId: string,
    definition: unknown,
    user: AuthenticatedUser,
  ): Promise<FigureData> {
    const experiment = await this.experimentFor(orgId, experimentId, user);
    return this.draftData(experiment, parseFigureDefinition(definition));
  }

  /**
   * The data of a saved Figure: stored if it is tied to a version, otherwise
   * computed from the current rows.
   * @throws {EntityNotFound} If the experiment has no such Figure
   */
  async getData(
    orgId: string,
    experimentId: string,
    figureId: string,
    user: AuthenticatedUser,
  ): Promise<FigureData> {
    const experiment = await this.experimentFor(orgId, experimentId, user);
    const figure = await this.figureIn(experiment, figureId);
    if (!figure.published_results) {
      return this.draftData(experiment, figure.definition);
    }
    const stored = await this.storedData(
      figure.published_results,
      figure.definition,
    );
    if (!stored) throw new EntityNotFound();
    return stored.data;
  }

  /**
   * Ties a Figure to a Published results version, or unties it with null.
   * @throws {EntityNotFound} If the experiment has no such Figure or version
   * @throws {FigureVersionNotCurrent} If the version's data cannot be produced
   */
  async moveToVersion(
    orgId: string,
    experimentId: string,
    figureId: string,
    metricVersion: number | null,
    user: AuthenticatedUser,
  ): Promise<void> {
    const experiment = await this.experimentFor(orgId, experimentId, user);
    const figure = await this.figureIn(experiment, figureId);
    if (metricVersion === null) {
      figure.published_results = null;
      await this.figureRepository.save(figure);
      return;
    }
    const published = await this.publishedRepository.findOne({
      where: {
        experiment: { id: experiment.id },
        metric_version: metricVersion,
      },
      select: { id: true, metric_version: true },
    });
    if (!published) throw new EntityNotFound();
    await this.freeze(experiment, published, figure.definition);
    figure.published_results = published;
    await this.figureRepository.save(figure);
  }

  private storedData(
    published: Pick<ExperimentPublishedResults, "id">,
    definition: FigureDefinition,
  ): Promise<ExperimentPublishedFigureData | null> {
    return this.figureDataRepository.findOne({
      where: {
        published_results: { id: published.id },
        definition_key: definitionKey(definition),
      },
    });
  }

  /**
   * Stores what a definition plots under a version. Only the metric code of
   * that version may compute it, so older versions serve what is already stored.
   */
  private async freeze(
    experiment: Experiment,
    published: ExperimentPublishedResults,
    definition: FigureDefinition,
  ): Promise<void> {
    if (await this.storedData(published, definition)) return;
    if (published.metric_version !== METRIC_VERSION) {
      throw new FigureVersionNotCurrent();
    }
    const data = await this.compute(experiment, definition);
    await this.figureDataRepository
      .save({
        published_results: published,
        definition_key: definitionKey(definition),
        data,
      })
      .catch((error: unknown) => {
        // A concurrent tie stored the same data first
        if (!isUniqueViolation(error)) throw error;
      });
  }

  private draftData(
    experiment: Experiment,
    valid: FigureDefinition,
  ): Promise<FigureData> {
    // Rows of a running experiment still change, so only ended ones are kept
    if (!experiment.ended_on) return this.compute(experiment, valid);

    const key = `${experiment.id}:${METRIC_VERSION}:${definitionKey(valid)}`;
    const cached = this.dataCache.get(key);
    if (cached) return cached;

    const data = this.compute(experiment, valid);
    this.dataCache.set(key, data);
    data.catch(() => this.dataCache.delete(key));
    if (this.dataCache.size > FIGURE_CACHE_ENTRIES) {
      this.dataCache.delete(this.dataCache.keys().next().value!);
    }
    return data;
  }

  private async compute(
    experiment: Experiment,
    definition: FigureDefinition,
  ): Promise<FigureData> {
    return computeFigureData(
      await this.resultsService.figureRows(experiment),
      definition,
    );
  }

  /** @throws {InvalidFigureDefinition} If the catalog does not allow it */
  async create(
    orgId: string,
    experimentId: string,
    body: { name: string; definition: unknown },
    user: AuthenticatedUser,
  ): Promise<string> {
    const experiment = await this.experimentFor(orgId, experimentId, user);
    const figure = await this.figureRepository.save(
      this.figureRepository.create({
        name: body.name,
        definition: parseFigureDefinition(body.definition),
        created_on: new Date(),
        experiment,
      }),
    );
    return figure.id;
  }

  /** The Figures of an experiment, newest first. */
  async list(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<FigureSummary[]> {
    const experiment = await this.experimentFor(orgId, experimentId, user);
    const figures = await this.figureRepository.find({
      where: { experiment: { id: experiment.id } },
      select: FIGURE_COLUMNS,
      relations: { published_results: true },
      order: { created_on: "DESC" },
    });
    return figures.map(summary);
  }

  /** @throws {EntityNotFound} If the experiment has no such Figure */
  async get(
    orgId: string,
    experimentId: string,
    figureId: string,
    user: AuthenticatedUser,
  ): Promise<FigureSummary> {
    return summary(await this.figureFor(orgId, experimentId, figureId, user));
  }

  /**
   * @throws {InvalidFigureDefinition} If the catalog does not allow it
   * @throws {FigureVersionNotCurrent} If a tied Figure's changed definition cannot be computed
   */
  async update(
    orgId: string,
    experimentId: string,
    figureId: string,
    body: { name?: string; definition?: unknown },
    user: AuthenticatedUser,
  ): Promise<void> {
    const experiment = await this.experimentFor(orgId, experimentId, user);
    const figure = await this.figureIn(experiment, figureId);
    if (body.definition !== undefined) {
      const definition = parseFigureDefinition(body.definition);
      if (definitionKey(definition) !== definitionKey(figure.definition)) {
        if (figure.published_results) {
          await this.freeze(experiment, figure.published_results, definition);
        }
        figure.definition = definition;
      }
    }
    if (body.name !== undefined) figure.name = body.name;
    await this.figureRepository.save(figure);
  }

  /** @throws {EntityNotFound} If the experiment has no such Figure */
  async delete(
    orgId: string,
    experimentId: string,
    figureId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.figureRepository.remove(
      await this.figureFor(orgId, experimentId, figureId, user),
    );
  }

  private async experimentFor(
    orgId: string,
    experimentId: string,
    user: AuthenticatedUser,
  ): Promise<Experiment> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    return findExperimentInOrg(this.experimentRepository, orgId, experimentId);
  }

  private async figureFor(
    orgId: string,
    experimentId: string,
    figureId: string,
    user: AuthenticatedUser,
  ): Promise<ExperimentFigure> {
    return this.figureIn(
      await this.experimentFor(orgId, experimentId, user),
      figureId,
    );
  }

  private async figureIn(
    experiment: Experiment,
    figureId: string,
  ): Promise<ExperimentFigure> {
    const figure = await this.figureRepository.findOne({
      where: { id: figureId, experiment: { id: experiment.id } },
      select: FIGURE_COLUMNS,
      relations: { published_results: true },
    });
    if (!figure) throw new EntityNotFound();
    return figure;
  }
}
