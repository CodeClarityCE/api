import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { EntityNotFound } from "src/types/error.types";

import { Experiment } from "./experiment.entity";
import { ExperimentFigure } from "./experiment-figure.entity";
import {
  FIGURE_CATALOG,
  type FigureCatalog,
  type FigureDefinition,
  parseFigureDefinition,
} from "./experiment-figure-catalog";
import { computeFigureData, type FigureData } from "./experiment-figure-data";
import { METRIC_VERSION } from "./experiment-metric-version";
import { ExperimentResultsService } from "./experiment-results.service";
import { findExperimentInOrg } from "./experiments.service";

export interface FigureSummary {
  id: string;
  name: string;
  definition: FigureDefinition;
  created_on: Date;
}

/** Previews kept per API instance; the oldest is dropped first */
const FIGURE_CACHE_ENTRIES = 256;

function summary(figure: ExperimentFigure): FigureSummary {
  return {
    id: figure.id,
    name: figure.name,
    definition: figure.definition,
    created_on: figure.created_on,
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
    const valid = parseFigureDefinition(definition);
    // Rows of a running experiment still change, so only ended ones are kept
    if (!experiment.ended_on) return this.compute(experiment, valid);

    const key = JSON.stringify([experiment.id, METRIC_VERSION, valid]);
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

  /** @throws {InvalidFigureDefinition} If the catalog does not allow it */
  async update(
    orgId: string,
    experimentId: string,
    figureId: string,
    body: { name?: string; definition?: unknown },
    user: AuthenticatedUser,
  ): Promise<void> {
    const figure = await this.figureFor(orgId, experimentId, figureId, user);
    if (body.definition !== undefined) {
      figure.definition = parseFigureDefinition(body.definition);
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
    const experiment = await this.experimentFor(orgId, experimentId, user);
    const figure = await this.figureRepository.findOne({
      where: { id: figureId, experiment: { id: experiment.id } },
    });
    if (!figure) throw new EntityNotFound();
    return figure;
  }
}
