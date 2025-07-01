/**
 * Graph dependency node representing a package in the dependency tree.
 * Updated to support multiple parents since a package can be required by multiple other packages.
 */
export interface GraphDependency {
    id: string;
    /** Array of parent dependency IDs. Empty array for root nodes, undefined if not processed yet */
    parentIds?: string[];
    /** Array of direct child dependency IDs */
    childrenIds?: string[];
    /** True if this dependency is a production dependency (direct child of root) */
    prod?: boolean;
    /** True if this dependency is a dev dependency (direct child of root) */
    dev?: boolean;
}

/**
 * Result interface for node traversal operations
 */
export interface NodeTraversalResult {
    /** All parent nodes found during traversal */
    parents: GraphDependency[];
    /** All children nodes found during traversal */
    children: GraphDependency[];
    /** The target node itself */
    node: GraphDependency | null;
}

/**
 * Utility class for graph traversal operations
 */
export class GraphTraversalUtils {
    /**
     * Finds all parents and children of a specified node in the dependency graph
     * @param nodeId - The ID of the node to find parents and children for
     * @param graph - Array of GraphDependency nodes representing the entire graph
     * @returns NodeTraversalResult containing parents, children, and the node itself
     */
    static findAllParentsAndChildren(nodeId: string, graph: GraphDependency[]): NodeTraversalResult {
        const result: NodeTraversalResult = {
            parents: [],
            children: [],
            node: null
        };

        // Create a map for faster lookups
        const nodeMap = new Map<string, GraphDependency>();
        const childrenMap = new Map<string, GraphDependency[]>();

        // Build maps for efficient traversal
        for (const node of graph) {
            nodeMap.set(node.id, node);
            
            // Build children map for each node based on parentIds
            if (node.parentIds && node.parentIds.length > 0) {
                for (const parentId of node.parentIds) {
                    if (!childrenMap.has(parentId)) {
                        childrenMap.set(parentId, []);
                    }
                    childrenMap.get(parentId)!.push(node);
                }
            }
        }

        // Find the target node
        const targetNode = nodeMap.get(nodeId);
        if (!targetNode) {
            return result; // Node not found
        }
        result.node = targetNode;

        // Find all parents recursively
        const visitedParents = new Set<string>();
        this.findParentsRecursive(targetNode, nodeMap, visitedParents, result.parents);

        // Find all children recursively
        const visitedChildren = new Set<string>();
        this.findChildrenRecursive(targetNode, childrenMap, visitedChildren, result.children);

        return result;
    }

    /**
     * Recursively finds all parent nodes
     * @param node - Current node to find parents for
     * @param nodeMap - Map of all nodes for quick lookup
     * @param visited - Set to track visited nodes and prevent cycles
     * @param parents - Array to collect all parent nodes
     */
    private static findParentsRecursive(
        node: GraphDependency,
        nodeMap: Map<string, GraphDependency>,
        visited: Set<string>,
        parents: GraphDependency[]
    ): void {
        if (!node.parentIds || node.parentIds.length === 0) {
            return; // No parents
        }

        for (const parentId of node.parentIds) {
            if (visited.has(parentId)) {
                continue; // Already visited (cycle prevention)
            }

            const parent = nodeMap.get(parentId);
            if (parent) {
                visited.add(parent.id);
                parents.push(parent);
                
                // Recursively find parents of this parent
                this.findParentsRecursive(parent, nodeMap, visited, parents);
            }
        }
    }

    /**
     * Recursively finds all children nodes
     * @param node - Current node to find children for
     * @param childrenMap - Map of node ID to its direct children
     * @param visited - Set to track visited nodes and prevent cycles
     * @param children - Array to collect all children nodes
     */
    private static findChildrenRecursive(
        node: GraphDependency,
        childrenMap: Map<string, GraphDependency[]>,
        visited: Set<string>,
        children: GraphDependency[]
    ): void {
        const directChildren = childrenMap.get(node.id) || [];
        
        for (const child of directChildren) {
            if (visited.has(child.id)) {
                continue; // Already visited (cycle prevention)
            }
            
            visited.add(child.id);
            children.push(child);
            
            // Recursively find children of this child
            this.findChildrenRecursive(child, childrenMap, visited, children);
        }
    }

    /**
     * Finds only direct parents and children (non-recursive)
     * @param nodeId - The ID of the node to find direct relations for
     * @param graph - Array of GraphDependency nodes representing the entire graph
     * @returns NodeTraversalResult containing only direct parents and children
     */
    static findDirectParentsAndChildren(nodeId: string, graph: GraphDependency[]): NodeTraversalResult {
        const result: NodeTraversalResult = {
            parents: [],
            children: [],
            node: null
        };

        // Find the target node
        const targetNode = graph.find(node => node.id === nodeId);
        if (!targetNode) {
            return result;
        }
        result.node = targetNode;

        // Find direct parents
        if (targetNode.parentIds && targetNode.parentIds.length > 0) {
            for (const parentId of targetNode.parentIds) {
                const parent = graph.find(node => node.id === parentId);
                if (parent) {
                    result.parents.push(parent);
                }
            }
        }

        // Find direct children
        const children = graph.filter(node => 
            node.parentIds && node.parentIds.includes(nodeId)
        );
        result.children.push(...children);

        return result;
    }

    /**
     * Finds only the paths that lead to or from the target dependency.
     * This excludes branches that don't contain the target dependency.
     * 
     * @param nodeId - The ID of the target dependency
     * @param graph - Array of GraphDependency nodes representing the entire graph
     * @returns Array of GraphDependency nodes that are in paths containing the target
     */
    static findPathsContaining(nodeId: string, graph: GraphDependency[]): GraphDependency[] {
        const result: GraphDependency[] = [];
        const nodeMap = new Map<string, GraphDependency>();
        const nodesInPaths = new Set<string>();

        // Build node map for efficient lookups
        for (const node of graph) {
            nodeMap.set(node.id, node);
        }

        // Find the target dependency
        const targetNode = nodeMap.get(nodeId);
        if (!targetNode) {
            return result; // Target not found
        }

        console.log(`Finding paths for target dependency: ${nodeId}`);

        // Mark the target node as part of a relevant path
        nodesInPaths.add(targetNode.id);

        // Find all paths from root to target (mark ancestors that lead to target)
        this.markPathsToTarget(targetNode, nodeMap, nodesInPaths);

        // Find all paths from target to leaves (mark descendants of target)
        this.markPathsFromTarget(targetNode, nodeMap, nodesInPaths);

        // Collect all nodes that are marked as part of relevant paths
        for (const nodeId of nodesInPaths) {
            const node = nodeMap.get(nodeId);
            if (node) {
                result.push(node);
            }
        }

        console.log(`Total nodes in paths containing ${nodeId}:`, result.length);
        console.log(`Node IDs in result:`, result.map(n => n.id));

        return result;
    }

    /**
     * Marks all ancestor nodes that have a path leading to the target
     * @param targetNode - The target dependency node
     * @param nodeMap - Map of all nodes for quick lookup
     * @param nodesInPaths - Set to track nodes that are part of relevant paths
     */
    private static markPathsToTarget(
        targetNode: GraphDependency,
        nodeMap: Map<string, GraphDependency>,
        nodesInPaths: Set<string>
    ): void {
        if (!targetNode.parentIds || targetNode.parentIds.length === 0) {
            return; // Reached root
        }

        for (const parentId of targetNode.parentIds) {
            const parent = nodeMap.get(parentId);
            if (parent && !nodesInPaths.has(parent.id)) {
                // Mark this parent as part of a path to target
                nodesInPaths.add(parent.id);
                
                // Recursively mark ancestors of this parent
                this.markPathsToTarget(parent, nodeMap, nodesInPaths);
            }
        }
    }

    /**
     * Marks all descendant nodes that are children of the target
     * @param targetNode - The target dependency node
     * @param nodeMap - Map of all nodes for quick lookup
     * @param nodesInPaths - Set to track nodes that are part of relevant paths
     */
    private static markPathsFromTarget(
        targetNode: GraphDependency,
        nodeMap: Map<string, GraphDependency>,
        nodesInPaths: Set<string>
    ): void {
        if (!targetNode.childrenIds || targetNode.childrenIds.length === 0) {
            return; // Reached leaf
        }

        for (const childId of targetNode.childrenIds) {
            const child = nodeMap.get(childId);
            if (child && !nodesInPaths.has(child.id)) {
                // Mark this child as part of a path from target
                nodesInPaths.add(child.id);
                
                // Recursively mark descendants of this child
                this.markPathsFromTarget(child, nodeMap, nodesInPaths);
            }
        }
    }

    /**
     * Finds only the minimal paths that lead to the target dependency.
     * This is more restrictive than findPathsContaining - it only includes nodes
     * that are strictly necessary to show how the target is reached.
     * 
     * @param nodeId - The ID of the target dependency
     * @param graph - Array of GraphDependency nodes representing the entire graph
     * @returns Array of GraphDependency nodes that are in minimal paths to the target
     */
    static findMinimalPathsToTarget(nodeId: string, graph: GraphDependency[]): GraphDependency[] {
        const result: GraphDependency[] = [];
        const nodeMap = new Map<string, GraphDependency>();

        // Build node map for efficient lookups
        for (const node of graph) {
            nodeMap.set(node.id, node);
        }

        // Find the target dependency
        const targetNode = nodeMap.get(nodeId);
        if (!targetNode) {
            return result; // Target not found
        }

        console.log(`Finding minimal paths to target dependency: ${nodeId}`);

        // Always include the target
        result.push(targetNode);

        // Find all minimal paths from roots to target
        const pathsToTarget = this.findAllPathsToTarget(targetNode, nodeMap, []);
        
        console.log(`Found ${pathsToTarget.length} paths to target`);

        // Collect all unique nodes from these paths
        const uniqueNodes = new Set<string>();
        uniqueNodes.add(nodeId); // Always include target

        for (const path of pathsToTarget) {
            for (const node of path) {
                uniqueNodes.add(node.id);
            }
        }

        // Build result from unique nodes
        for (const nodeId of uniqueNodes) {
            const node = nodeMap.get(nodeId);
            if (node && !result.some(n => n.id === nodeId)) {
                result.push(node);
            }
        }

        console.log(`Minimal paths contain ${result.length} nodes:`, result.map(n => n.id));
        return result;
    }

    /**
     * Finds all complete paths from root nodes to the target
     * @param targetNode - The target dependency node
     * @param nodeMap - Map of all nodes for quick lookup
     * @param currentPath - Current path being built
     * @returns Array of paths (each path is an array of nodes)
     */
    private static findAllPathsToTarget(
        targetNode: GraphDependency,
        nodeMap: Map<string, GraphDependency>,
        currentPath: GraphDependency[]
    ): GraphDependency[][] {
        // If no parents, this is a root-to-target path
        if (!targetNode.parentIds || targetNode.parentIds.length === 0) {
            return [currentPath];
        }

        const allPaths: GraphDependency[][] = [];

        // For each parent, recursively find paths
        for (const parentId of targetNode.parentIds) {
            const parent = nodeMap.get(parentId);
            if (parent) {
                // Avoid cycles
                if (!currentPath.some(node => node.id === parent.id)) {
                    const newPath = [parent, ...currentPath];
                    const pathsFromParent = this.findAllPathsToTarget(parent, nodeMap, newPath);
                    allPaths.push(...pathsFromParent);
                }
            }
        }

        return allPaths;
    }
}