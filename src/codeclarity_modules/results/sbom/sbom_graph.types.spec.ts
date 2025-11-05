import type { GraphDependency, NodeTraversalResult} from './sbom_graph.types';
import { GraphTraversalUtils } from './sbom_graph.types';

describe('SBOM Graph Types', () => {
    describe('GraphDependency interface', () => {
        it('should define graph dependency structure', () => {
            const dependency: GraphDependency = {
                id: 'test-package@1.0.0',
                parentIds: ['parent-package@2.0.0'],
                childrenIds: ['child-package@3.0.0'],
                prod: true,
                dev: false
            };

            expect(dependency.id).toBe('test-package@1.0.0');
            expect(dependency.parentIds).toEqual(['parent-package@2.0.0']);
            expect(dependency.childrenIds).toEqual(['child-package@3.0.0']);
            expect(dependency.prod).toBe(true);
            expect(dependency.dev).toBe(false);
        });

        it('should allow optional parentIds and childrenIds', () => {
            const dependency: GraphDependency = {
                id: 'test-package@1.0.0',
                prod: true,
                dev: false
            };

            expect(dependency.parentIds).toBeUndefined();
            expect(dependency.childrenIds).toBeUndefined();
        });

        it('should allow empty arrays for parentIds and childrenIds', () => {
            const dependency: GraphDependency = {
                id: 'test-package@1.0.0',
                parentIds: [],
                childrenIds: [],
                prod: true,
                dev: false
            };

            expect(dependency.parentIds).toEqual([]);
            expect(dependency.childrenIds).toEqual([]);
        });

        it('should allow multiple parents and children', () => {
            const dependency: GraphDependency = {
                id: 'test-package@1.0.0',
                parentIds: ['parent1@1.0.0', 'parent2@2.0.0'],
                childrenIds: ['child1@1.0.0', 'child2@2.0.0', 'child3@3.0.0'],
                prod: true,
                dev: true
            };

            expect(dependency.parentIds).toEqual(['parent1@1.0.0', 'parent2@2.0.0']);
            expect(dependency.childrenIds).toEqual([
                'child1@1.0.0',
                'child2@2.0.0',
                'child3@3.0.0'
            ]);
        });
    });

    describe('NodeTraversalResult interface', () => {
        it('should define node traversal result structure', () => {
            const parents: GraphDependency[] = [
                { id: 'parent1@1.0.0', prod: true, dev: false },
                { id: 'parent2@2.0.0', prod: true, dev: false }
            ];

            const children: GraphDependency[] = [
                { id: 'child1@1.0.0', prod: true, dev: false },
                { id: 'child2@2.0.0', prod: true, dev: false }
            ];

            const node: GraphDependency = {
                id: 'target@1.0.0',
                prod: true,
                dev: false
            };

            const result: NodeTraversalResult = {
                parents,
                children,
                node
            };

            expect(result.parents).toEqual(parents);
            expect(result.children).toEqual(children);
            expect(result.node).toEqual(node);
        });

        it('should allow null node', () => {
            const result: NodeTraversalResult = {
                parents: [],
                children: [],
                node: null
            };

            expect(result.parents).toEqual([]);
            expect(result.children).toEqual([]);
            expect(result.node).toBeNull();
        });
    });

    describe('GraphTraversalUtils', () => {
        let mockGraph: GraphDependency[];

        beforeEach(() => {
            // Create a mock dependency graph
            mockGraph = [
                {
                    id: 'root@1.0.0',
                    parentIds: [],
                    childrenIds: ['levelA@1.0.0', 'levelB@1.0.0'],
                    prod: true,
                    dev: false
                },
                {
                    id: 'levelA@1.0.0',
                    parentIds: ['root@1.0.0'],
                    childrenIds: ['levelA-child@1.0.0'],
                    prod: true,
                    dev: false
                },
                {
                    id: 'levelB@1.0.0',
                    parentIds: ['root@1.0.0'],
                    childrenIds: ['levelB-child@1.0.0'],
                    prod: true,
                    dev: false
                },
                {
                    id: 'levelA-child@1.0.0',
                    parentIds: ['levelA@1.0.0'],
                    childrenIds: ['shared-grandchild@1.0.0'],
                    prod: true,
                    dev: false
                },
                {
                    id: 'levelB-child@1.0.0',
                    parentIds: ['levelB@1.0.0'],
                    childrenIds: ['shared-grandchild@1.0.0'],
                    prod: true,
                    dev: false
                },
                {
                    id: 'shared-grandchild@1.0.0',
                    parentIds: ['levelA-child@1.0.0', 'levelB-child@1.0.0'],
                    childrenIds: [],
                    prod: true,
                    dev: false
                }
            ];
        });

        describe('findAllParentsAndChildren', () => {
            it('should find all parents and children of a node', () => {
                const result = GraphTraversalUtils.findAllParentsAndChildren(
                    'levelA@1.0.0',
                    mockGraph
                );

                expect(result.node).toBeDefined();
                expect(result.node?.id).toBe('levelA@1.0.0');
                expect(result.parents).toHaveLength(1);
                expect(result.parents[0]!.id).toBe('root@1.0.0');
                expect(result.children).toHaveLength(2);
                expect(result.children.map((c) => c.id)).toContain('levelA-child@1.0.0');
                expect(result.children.map((c) => c.id)).toContain('shared-grandchild@1.0.0');
            });

            it('should return empty result when node is not found', () => {
                const result = GraphTraversalUtils.findAllParentsAndChildren(
                    'nonexistent@1.0.0',
                    mockGraph
                );

                expect(result.node).toBeNull();
                expect(result.parents).toEqual([]);
                expect(result.children).toEqual([]);
            });

            it('should handle root node with no parents', () => {
                const result = GraphTraversalUtils.findAllParentsAndChildren(
                    'root@1.0.0',
                    mockGraph
                );

                expect(result.node?.id).toBe('root@1.0.0');
                expect(result.parents).toEqual([]);
                expect(result.children).toHaveLength(5); // All descendants
            });

            it('should handle leaf node with no children', () => {
                const result = GraphTraversalUtils.findAllParentsAndChildren(
                    'shared-grandchild@1.0.0',
                    mockGraph
                );

                expect(result.node?.id).toBe('shared-grandchild@1.0.0');
                expect(result.parents).toHaveLength(5); // All ancestors
                expect(result.children).toEqual([]);
            });

            it('should handle cycles in the graph', () => {
                const cyclicGraph: GraphDependency[] = [
                    {
                        id: 'A@1.0.0',
                        parentIds: ['B@1.0.0'],
                        childrenIds: ['B@1.0.0'],
                        prod: true,
                        dev: false
                    },
                    {
                        id: 'B@1.0.0',
                        parentIds: ['A@1.0.0'],
                        childrenIds: ['A@1.0.0'],
                        prod: true,
                        dev: false
                    }
                ];

                const result = GraphTraversalUtils.findAllParentsAndChildren(
                    'A@1.0.0',
                    cyclicGraph
                );

                expect(result.node?.id).toBe('A@1.0.0');
                expect(result.parents).toHaveLength(2);
                expect(result.parents.map((p) => p.id)).toContain('B@1.0.0');
                expect(result.children).toHaveLength(2);
                expect(result.children.map((c) => c.id)).toContain('B@1.0.0');
            });

            it('should handle empty graph', () => {
                const result = GraphTraversalUtils.findAllParentsAndChildren('any@1.0.0', []);

                expect(result.node).toBeNull();
                expect(result.parents).toEqual([]);
                expect(result.children).toEqual([]);
            });
        });

        describe('findDirectParentsAndChildren', () => {
            it('should find only direct parents and children', () => {
                const result = GraphTraversalUtils.findDirectParentsAndChildren(
                    'levelA@1.0.0',
                    mockGraph
                );

                expect(result.node?.id).toBe('levelA@1.0.0');
                expect(result.parents).toHaveLength(1);
                expect(result.parents[0]!.id).toBe('root@1.0.0');
                expect(result.children).toHaveLength(1);
                expect(result.children[0]!.id).toBe('levelA-child@1.0.0');
            });

            it('should handle multiple direct parents', () => {
                const result = GraphTraversalUtils.findDirectParentsAndChildren(
                    'shared-grandchild@1.0.0',
                    mockGraph
                );

                expect(result.node?.id).toBe('shared-grandchild@1.0.0');
                expect(result.parents).toHaveLength(2);
                expect(result.parents.map((p) => p.id)).toContain('levelA-child@1.0.0');
                expect(result.parents.map((p) => p.id)).toContain('levelB-child@1.0.0');
                expect(result.children).toEqual([]);
            });

            it('should return empty result when node is not found', () => {
                const result = GraphTraversalUtils.findDirectParentsAndChildren(
                    'nonexistent@1.0.0',
                    mockGraph
                );

                expect(result.node).toBeNull();
                expect(result.parents).toEqual([]);
                expect(result.children).toEqual([]);
            });
        });

        describe('findPathsContaining', () => {
            let consoleSpy: jest.SpyInstance;

            beforeEach(() => {
                consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            });

            afterEach(() => {
                consoleSpy.mockRestore();
            });

            it('should find all nodes in paths containing the target', () => {
                const result = GraphTraversalUtils.findPathsContaining('levelA@1.0.0', mockGraph);

                expect(result).toContainEqual(expect.objectContaining({ id: 'levelA@1.0.0' }));
                expect(result).toContainEqual(expect.objectContaining({ id: 'root@1.0.0' }));
                expect(result).toContainEqual(
                    expect.objectContaining({ id: 'levelA-child@1.0.0' })
                );
                expect(result).toContainEqual(
                    expect.objectContaining({ id: 'shared-grandchild@1.0.0' })
                );
            });

            it('should return empty array when target is not found', () => {
                const result = GraphTraversalUtils.findPathsContaining(
                    'nonexistent@1.0.0',
                    mockGraph
                );

                expect(result).toEqual([]);
            });

            it('should log debug information', () => {
                GraphTraversalUtils.findPathsContaining('levelA@1.0.0', mockGraph);

                expect(consoleSpy).toHaveBeenCalledWith(
                    'Finding paths for target dependency: levelA@1.0.0'
                );
                expect(consoleSpy).toHaveBeenCalledWith(
                    'Total nodes in paths containing levelA@1.0.0:',
                    expect.any(Number)
                );
                expect(consoleSpy).toHaveBeenCalledWith('Node IDs in result:', expect.any(Array));
            });
        });

        describe('findMinimalPathsToTarget', () => {
            let consoleSpy: jest.SpyInstance;

            beforeEach(() => {
                consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            });

            afterEach(() => {
                consoleSpy.mockRestore();
            });

            it('should find minimal paths to target', () => {
                const result = GraphTraversalUtils.findMinimalPathsToTarget(
                    'shared-grandchild@1.0.0',
                    mockGraph
                );

                expect(result).toContainEqual(
                    expect.objectContaining({ id: 'shared-grandchild@1.0.0' })
                );
                expect(result).toContainEqual(expect.objectContaining({ id: 'root@1.0.0' }));
                expect(result).toContainEqual(expect.objectContaining({ id: 'levelA@1.0.0' }));
                expect(result).toContainEqual(expect.objectContaining({ id: 'levelB@1.0.0' }));
            });

            it('should return empty array when target is not found', () => {
                const result = GraphTraversalUtils.findMinimalPathsToTarget(
                    'nonexistent@1.0.0',
                    mockGraph
                );

                expect(result).toEqual([]);
            });

            it('should handle root node as target', () => {
                const result = GraphTraversalUtils.findMinimalPathsToTarget(
                    'root@1.0.0',
                    mockGraph
                );

                expect(result).toHaveLength(1);
                expect(result[0]!.id).toBe('root@1.0.0');
            });

            it('should log debug information', () => {
                GraphTraversalUtils.findMinimalPathsToTarget('levelA@1.0.0', mockGraph);

                expect(consoleSpy).toHaveBeenCalledWith(
                    'Finding minimal paths to target dependency: levelA@1.0.0'
                );
                expect(consoleSpy).toHaveBeenCalledWith('Found 1 paths to target');
                expect(consoleSpy).toHaveBeenCalledWith(
                    'Minimal paths contain 2 nodes:',
                    expect.any(Array)
                );
            });

            it('should handle multiple paths to target', () => {
                const result = GraphTraversalUtils.findMinimalPathsToTarget(
                    'shared-grandchild@1.0.0',
                    mockGraph
                );

                // Should include all nodes in paths from root to shared-grandchild
                expect(result.length).toBeGreaterThan(1);
                expect(result).toContainEqual(
                    expect.objectContaining({ id: 'shared-grandchild@1.0.0' })
                );
            });
        });

        describe('edge cases', () => {
            it('should handle nodes with undefined parentIds', () => {
                const graphWithUndefinedParents: GraphDependency[] = [
                    {
                        id: 'nodeA@1.0.0',
                        prod: true,
                        dev: false
                    },
                    {
                        id: 'nodeB@1.0.0',
                        parentIds: ['nodeA@1.0.0'],
                        prod: true,
                        dev: false
                    }
                ];

                const result = GraphTraversalUtils.findAllParentsAndChildren(
                    'nodeA@1.0.0',
                    graphWithUndefinedParents
                );

                expect(result.node?.id).toBe('nodeA@1.0.0');
                expect(result.parents).toEqual([]);
                expect(result.children).toHaveLength(1);
                expect(result.children[0]!.id).toBe('nodeB@1.0.0');
            });

            it('should handle nodes with undefined childrenIds', () => {
                const graphWithUndefinedChildren: GraphDependency[] = [
                    {
                        id: 'nodeA@1.0.0',
                        parentIds: [],
                        prod: true,
                        dev: false
                    },
                    {
                        id: 'nodeB@1.0.0',
                        parentIds: ['nodeA@1.0.0'],
                        prod: true,
                        dev: false
                    }
                ];

                const result = GraphTraversalUtils.findAllParentsAndChildren(
                    'nodeA@1.0.0',
                    graphWithUndefinedChildren
                );

                expect(result.node?.id).toBe('nodeA@1.0.0');
                expect(result.parents).toEqual([]);
                expect(result.children).toHaveLength(1);
            });

            it('should handle orphaned nodes (no parents or children)', () => {
                const orphanedGraph: GraphDependency[] = [
                    {
                        id: 'orphan@1.0.0',
                        parentIds: [],
                        childrenIds: [],
                        prod: true,
                        dev: false
                    }
                ];

                const result = GraphTraversalUtils.findAllParentsAndChildren(
                    'orphan@1.0.0',
                    orphanedGraph
                );

                expect(result.node?.id).toBe('orphan@1.0.0');
                expect(result.parents).toEqual([]);
                expect(result.children).toEqual([]);
            });

            it('should handle complex graph with multiple roots', () => {
                const multiRootGraph: GraphDependency[] = [
                    {
                        id: 'root1@1.0.0',
                        parentIds: [],
                        childrenIds: ['shared@1.0.0'],
                        prod: true,
                        dev: false
                    },
                    {
                        id: 'root2@1.0.0',
                        parentIds: [],
                        childrenIds: ['shared@1.0.0'],
                        prod: false,
                        dev: true
                    },
                    {
                        id: 'shared@1.0.0',
                        parentIds: ['root1@1.0.0', 'root2@1.0.0'],
                        childrenIds: [],
                        prod: true,
                        dev: true
                    }
                ];

                const result = GraphTraversalUtils.findAllParentsAndChildren(
                    'shared@1.0.0',
                    multiRootGraph
                );

                expect(result.node?.id).toBe('shared@1.0.0');
                expect(result.parents).toHaveLength(2);
                expect(result.parents.map((p) => p.id)).toContain('root1@1.0.0');
                expect(result.parents.map((p) => p.id)).toContain('root2@1.0.0');
                expect(result.children).toEqual([]);
            });
        });
    });
});
