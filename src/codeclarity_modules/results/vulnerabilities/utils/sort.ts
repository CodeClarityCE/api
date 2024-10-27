// import { compare } from 'compare-versions';
import { VulnerabilityMerged } from 'src/types/entities/services/Vulnerabilities';

function sort(
    vulnerabilities: VulnerabilityMerged[],
    sortBy: string | undefined,
    sortDirection: string | undefined
): VulnerabilityMerged[] {
    // Defaults
    const ALLOWED_SORT_BY = [
        'cve',
        'dep_name',
        'dep_version',
        'file_path',
        'severity',
        'weakness',
        'exploitability',
        'owasp_top_10'
    ];
    const DEFAULT_SORT = 'severity';
    const DEFAULT_SORT_DIRECTION = 'DESC';

    const mapping: { [key: string]: string } = {
        cve: 'Vulnerability'
    };

    // Validation of input
    let sortBySafe: string;
    let sortDirectionSafe: string;

    if (sortBy == null || !ALLOWED_SORT_BY.includes(sortBy)) {
        sortBySafe = DEFAULT_SORT;
    } else {
        sortBySafe = sortBy;
    }

    if (sortDirection == null || (sortDirection != 'DESC' && sortDirection != 'ASC')) {
        sortDirectionSafe = DEFAULT_SORT_DIRECTION;
    } else {
        sortDirectionSafe = sortDirection;
    }

    if (sortBySafe in mapping) sortBySafe = mapping[sortBySafe];

    // Sorting
    let sorted: VulnerabilityMerged[] = [];

    if (sortBySafe == 'severity') {
        sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
            if ((a.Severity?.Severity ?? 0.0) > (b.Severity?.Severity ?? 0.0))
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            if ((a.Severity?.Severity ?? 0.0) < (b.Severity?.Severity ?? 0.0))
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            return 0;
        });
    }

    // else if (sortBySafe == 'dep_name') {
    //     sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
    //         if ((a.AffectedDependencyObject?.name ?? '') > (b.AffectedDependencyObject?.name ?? ''))
    //             return sortDirectionSafe == 'DESC' ? 1 : -1;
    //         if ((a.AffectedDependencyObject?.name ?? '') < (b.AffectedDependencyObject?.name ?? ''))
    //             return sortDirectionSafe == 'DESC' ? -1 : 1;
    //         return 0;
    //     });
    // } else if (sortBySafe == 'dep_version') {
    //     sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
    //         if (
    //             compare(
    //                 a.AffectedDependencyObject?.version ?? '0.0.0',
    //                 b.AffectedDependencyObject?.version ?? '0.0.0',
    //                 '>'
    //             )
    //         )
    //             return sortDirectionSafe == 'DESC' ? -1 : 1;
    //         if (
    //             compare(
    //                 a.AffectedDependencyObject?.version ?? '0.0.0',
    //                 b.AffectedDependencyObject?.version ?? '0.0.0',
    //                 '<'
    //             )
    //         )
    //             return sortDirectionSafe == 'DESC' ? 1 : -1;
    //         return 0;
    //     });
    // }
    else if (sortBySafe == 'exploitability') {
        sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
            if ((a.Severity.Exploitability ?? 0.0) > (b.Severity.Exploitability ?? 0.0))
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            if ((a.Severity.Exploitability ?? 0.0) < (b.Severity.Exploitability ?? 0.0))
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            return 0;
        });
    } else if (sortBySafe == 'owasp_top_10') {
        sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
            if (
                (a.Weaknesses == null ||
                    a.Weaknesses.length == 0 ||
                    a.Weaknesses[0].OWASPTop10Id == '') &&
                (b.Weaknesses == null ||
                    b.Weaknesses.length == 0 ||
                    b.Weaknesses[0].OWASPTop10Id == '')
            )
                return 0;
            if (
                a.Weaknesses == null ||
                a.Weaknesses.length == 0 ||
                a.Weaknesses[0].OWASPTop10Id == ''
            )
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            if (
                b.Weaknesses == null ||
                b.Weaknesses.length == 0 ||
                b.Weaknesses[0].OWASPTop10Id == ''
            )
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            if (parseInt(a.Weaknesses[0].OWASPTop10Id) > parseInt(b.Weaknesses[0].OWASPTop10Id))
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            if (parseInt(a.Weaknesses[0].OWASPTop10Id) < parseInt(b.Weaknesses[0].OWASPTop10Id))
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            return 0;
        });
    } else if (sortBySafe == 'weakness') {
        sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
            if (
                (a.Weaknesses == null ||
                    a.Weaknesses.length == 0 ||
                    a.Weaknesses[0].WeaknessId == '') &&
                (b.Weaknesses == null ||
                    b.Weaknesses.length == 0 ||
                    b.Weaknesses[0].WeaknessId == '')
            )
                return 0;
            if (
                a.Weaknesses == null ||
                a.Weaknesses.length == 0 ||
                a.Weaknesses[0].WeaknessId == ''
            )
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            if (
                b.Weaknesses == null ||
                b.Weaknesses.length == 0 ||
                b.Weaknesses[0].WeaknessId == ''
            )
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            if (
                (parseInt(a.Weaknesses[0].WeaknessId.replace('CWE-', '')) ?? 0) >
                (parseInt(b.Weaknesses[0].WeaknessId.replace('CWE-', '')) ?? 0)
            )
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            if (
                (parseInt(a.Weaknesses[0].WeaknessId.replace('CWE-', '')) ?? 0) <
                (parseInt(b.Weaknesses[0].WeaknessId.replace('CWE-', '')) ?? 0)
            )
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            return 0;
        });
    } else if (sortBySafe == 'Vulnerability') {
        sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
            if ((a.Vulnerability ?? '') > (b.Vulnerability ?? ''))
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            if ((a.Vulnerability ?? '') < (b.Vulnerability ?? ''))
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            return 0;
        });
    } else {
        sorted = vulnerabilities.sort((a: any, b: any) => {
            if ((a[sortBySafe] ?? '') > (b[sortBySafe] ?? ''))
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            if ((a[sortBySafe] ?? '') < (b[sortBySafe] ?? ''))
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            return 0;
        });
    }

    return sorted;
}

export { sort };
