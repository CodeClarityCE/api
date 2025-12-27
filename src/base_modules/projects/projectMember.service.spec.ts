import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { NotAuthorized } from "../../types/error.types";
import { Project } from "./project.entity";
import { ProjectMemberService } from "./projectMember.service";

describe("ProjectMemberService", () => {
  let service: ProjectMemberService;
  let projectRepository: jest.Mocked<Repository<Project>>;

  const mockProject = {
    id: "test-project-id",
    name: "Test Project",
    description: "A test project",
    url: "https://github.com/test/project",
    organizations: [
      {
        id: "test-org-id",
        name: "Test Organization",
      },
    ],
  } as Project;

  const mockProjectId = "test-project-id";
  const mockOrgId = "test-org-id";

  beforeEach(async () => {
    const mockProjectRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMemberService,
        {
          provide: getRepositoryToken(Project, "codeclarity"),
          useValue: mockProjectRepository,
        },
      ],
    }).compile();

    service = module.get<ProjectMemberService>(ProjectMemberService);
    projectRepository = module.get(getRepositoryToken(Project, "codeclarity"));
  });

  describe("doesProjectBelongToOrg", () => {
    it("should return successfully when project belongs to organization", async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      await expect(
        service.doesProjectBelongToOrg(mockProjectId, mockOrgId),
      ).resolves.not.toThrow();

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        relations: {
          organizations: true,
        },
        where: { id: mockProjectId, organizations: { id: mockOrgId } },
      });
    });

    it("should throw NotAuthorized when project does not belong to organization", async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.doesProjectBelongToOrg(mockProjectId, mockOrgId),
      ).rejects.toThrow(NotAuthorized);

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        relations: {
          organizations: true,
        },
        where: { id: mockProjectId, organizations: { id: mockOrgId } },
      });
    });

    it("should throw NotAuthorized when project does not exist", async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.doesProjectBelongToOrg("nonexistent-project-id", mockOrgId),
      ).rejects.toThrow(NotAuthorized);

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        relations: {
          organizations: true,
        },
        where: {
          id: "nonexistent-project-id",
          organizations: { id: mockOrgId },
        },
      });
    });

    it("should handle database errors gracefully", async () => {
      const databaseError = new Error("Database connection failed");
      projectRepository.findOne.mockRejectedValue(databaseError);

      await expect(
        service.doesProjectBelongToOrg(mockProjectId, mockOrgId),
      ).rejects.toThrow(databaseError);

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        relations: {
          organizations: true,
        },
        where: { id: mockProjectId, organizations: { id: mockOrgId } },
      });
    });

    it("should handle empty project ID gracefully", async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.doesProjectBelongToOrg("", mockOrgId),
      ).rejects.toThrow(NotAuthorized);

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        relations: {
          organizations: true,
        },
        where: { id: "", organizations: { id: mockOrgId } },
      });
    });

    it("should handle empty organization ID gracefully", async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.doesProjectBelongToOrg(mockProjectId, ""),
      ).rejects.toThrow(NotAuthorized);

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        relations: {
          organizations: true,
        },
        where: { id: mockProjectId, organizations: { id: "" } },
      });
    });

    it("should handle null project ID gracefully", async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.doesProjectBelongToOrg(null as any, mockOrgId),
      ).rejects.toThrow(NotAuthorized);

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        relations: {
          organizations: true,
        },
        where: { id: null, organizations: { id: mockOrgId } },
      });
    });

    it("should handle null organization ID gracefully", async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.doesProjectBelongToOrg(mockProjectId, null as any),
      ).rejects.toThrow(NotAuthorized);

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        relations: {
          organizations: true,
        },
        where: { id: mockProjectId, organizations: { id: null } },
      });
    });

    it("should handle project with multiple organizations", async () => {
      const projectWithMultipleOrgs = {
        ...mockProject,
        organizations: [
          { id: "org-1", name: "Organization 1" },
          { id: "test-org-id", name: "Test Organization" },
          { id: "org-3", name: "Organization 3" },
        ],
      } as Project;

      projectRepository.findOne.mockResolvedValue(projectWithMultipleOrgs);

      await expect(
        service.doesProjectBelongToOrg(mockProjectId, mockOrgId),
      ).resolves.not.toThrow();

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        relations: {
          organizations: true,
        },
        where: { id: mockProjectId, organizations: { id: mockOrgId } },
      });
    });
  });
});
