export declare interface AnalysisStats {
    number_of_dev_dependencies: number;
    number_of_non_dev_dependencies: number;
    number_of_peer_dependencies: number;
    number_of_bundled_dependencies: number;
    number_of_optional_dependencies: number;
    number_of_outdated_dependencies: number;
    number_of_deprecated_dependencies: number;
    number_of_unlicensed_dependencies: number;
    number_of_direct_dependencies: number;
    number_of_transitive_dependencies: number;
    number_of_both_direct_transitive_dependencies: number;
    number_of_dependencies: number;
    average_dependency_age: number;
    number_of_dev_dependencies_diff: number;
    number_of_non_dev_dependencies_diff: number;
    number_of_peer_dependencies_diff: number;
    number_of_bundled_dependencies_diff: number;
    number_of_optional_dependencies_diff: number;
    number_of_outdated_dependencies_diff: number;
    number_of_deprecated_dependencies_diff: number;
    number_of_unlicensed_dependencies_diff: number;
    number_of_direct_dependencies_diff: number;
    number_of_transitive_dependencies_diff: number;
    number_of_dependencies_diff: number;
    average_dependency_age_diff: number;
    node_min_supported_version: string;
    node_max_supported_version: string;
}

export function newAnalysisStats(): AnalysisStats {
    return {
        number_of_dev_dependencies: 0,
        number_of_non_dev_dependencies: 0,
        number_of_bundled_dependencies: 0,
        number_of_optional_dependencies: 0,
        number_of_peer_dependencies: 0,
        number_of_direct_dependencies: 0,
        number_of_transitive_dependencies: 0,
        number_of_both_direct_transitive_dependencies: 0,
        number_of_deprecated_dependencies: 0,
        number_of_unlicensed_dependencies: 0,
        number_of_outdated_dependencies: 0,
        number_of_dependencies: 0,
        average_dependency_age: 0,
        number_of_dev_dependencies_diff: 0,
        number_of_non_dev_dependencies_diff: 0,
        number_of_bundled_dependencies_diff: 0,
        number_of_optional_dependencies_diff: 0,
        number_of_peer_dependencies_diff: 0,
        number_of_direct_dependencies_diff: 0,
        number_of_transitive_dependencies_diff: 0,
        number_of_deprecated_dependencies_diff: 0,
        number_of_unlicensed_dependencies_diff: 0,
        number_of_outdated_dependencies_diff: 0,
        number_of_dependencies_diff: 0,
        average_dependency_age_diff: 0,
        node_min_supported_version: '0.0.0',
        node_max_supported_version: '100.0.0'
    };
}
