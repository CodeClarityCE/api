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
}