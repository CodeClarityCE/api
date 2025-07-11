import type { OwaspTop10Info } from './owasp.types';

describe('OWASP Types', () => {
    describe('OwaspTop10Info', () => {
        it('should accept valid OwaspTop10Info objects', () => {
            const owaspInfo: OwaspTop10Info = {
                id: 'A01:2021',
                name: 'Broken Access Control',
                description:
                    'Restrictions on what authenticated users are allowed to do are often not properly enforced.'
            };

            expect(owaspInfo.id).toBe('A01:2021');
            expect(owaspInfo.name).toBe('Broken Access Control');
            expect(owaspInfo.description).toBe(
                'Restrictions on what authenticated users are allowed to do are often not properly enforced.'
            );
        });

        it('should handle empty string values', () => {
            const emptyInfo: OwaspTop10Info = {
                id: '',
                name: '',
                description: ''
            };

            expect(emptyInfo.id).toBe('');
            expect(emptyInfo.name).toBe('');
            expect(emptyInfo.description).toBe('');
        });

        it('should handle special characters in strings', () => {
            const specialCharInfo: OwaspTop10Info = {
                id: 'A01:2021-TEST',
                name: 'Test & Validation < > " \' ` \n \t',
                description: 'Description with special chars: <>{}[]()&*%$#@!?'
            };

            expect(specialCharInfo.id).toBe('A01:2021-TEST');
            expect(specialCharInfo.name).toBe('Test & Validation < > " \' ` \n \t');
            expect(specialCharInfo.description).toBe(
                'Description with special chars: <>{}[]()&*%$#@!?'
            );
        });

        it('should handle very long description text', () => {
            const longDescription = 'A'.repeat(5000);
            const longInfo: OwaspTop10Info = {
                id: 'A01:2021',
                name: 'Test Category',
                description: longDescription
            };

            expect(longInfo.description).toBe(longDescription);
            expect(longInfo.description.length).toBe(5000);
        });
    });

    describe('OWASP Top 10 2021 Categories', () => {
        it('should handle A01:2021 - Broken Access Control', () => {
            const a01: OwaspTop10Info = {
                id: 'A01:2021',
                name: 'Broken Access Control',
                description:
                    "Restrictions on what authenticated users are allowed to do are often not properly enforced. Attackers can exploit these flaws to access unauthorized functionality and/or data, such as access other users' accounts, view sensitive files, modify other users' data, change access rights, etc."
            };

            expect(a01.id).toBe('A01:2021');
            expect(a01.name).toBe('Broken Access Control');
            expect(a01.description).toContain('Restrictions on what authenticated users');
        });

        it('should handle A02:2021 - Cryptographic Failures', () => {
            const a02: OwaspTop10Info = {
                id: 'A02:2021',
                name: 'Cryptographic Failures',
                description:
                    "The first thing is to determine the protection needs of data in transit and at rest. For example, passwords, credit card numbers, health records, personal information, and business secrets require extra protection, mainly if that data falls under privacy laws, e.g., EU's General Data Protection Regulation (GDPR), or regulations, e.g., financial data protection such as PCI Data Security Standard (PCI DSS)."
            };

            expect(a02.id).toBe('A02:2021');
            expect(a02.name).toBe('Cryptographic Failures');
            expect(a02.description).toContain('protection needs of data');
        });

        it('should handle A03:2021 - Injection', () => {
            const a03: OwaspTop10Info = {
                id: 'A03:2021',
                name: 'Injection',
                description:
                    'An application is vulnerable to attack when: User-supplied data is not validated, filtered, or sanitized by the application. Dynamic queries or non-parameterized calls without context-aware escaping are used directly in the interpreter.'
            };

            expect(a03.id).toBe('A03:2021');
            expect(a03.name).toBe('Injection');
            expect(a03.description).toContain('User-supplied data is not validated');
        });

        it('should handle A04:2021 - Insecure Design', () => {
            const a04: OwaspTop10Info = {
                id: 'A04:2021',
                name: 'Insecure Design',
                description:
                    'Insecure design is a broad category representing different weaknesses, expressed as "missing or ineffective control design." Insecure design is not the source for all other Top 10 risk categories.'
            };

            expect(a04.id).toBe('A04:2021');
            expect(a04.name).toBe('Insecure Design');
            expect(a04.description).toContain('missing or ineffective control design');
        });

        it('should handle A05:2021 - Security Misconfiguration', () => {
            const a05: OwaspTop10Info = {
                id: 'A05:2021',
                name: 'Security Misconfiguration',
                description:
                    'The application might be vulnerable if the application is: Missing appropriate security hardening across any part of the application stack or improperly configured permissions on cloud services.'
            };

            expect(a05.id).toBe('A05:2021');
            expect(a05.name).toBe('Security Misconfiguration');
            expect(a05.description).toContain('Missing appropriate security hardening');
        });

        it('should handle A06:2021 - Vulnerable and Outdated Components', () => {
            const a06: OwaspTop10Info = {
                id: 'A06:2021',
                name: 'Vulnerable and Outdated Components',
                description:
                    'You are likely vulnerable: If you do not know the versions of all components you use (both client-side and server-side). This includes components you directly use as well as nested dependencies.'
            };

            expect(a06.id).toBe('A06:2021');
            expect(a06.name).toBe('Vulnerable and Outdated Components');
            expect(a06.description).toContain('do not know the versions');
        });

        it('should handle A07:2021 - Identification and Authentication Failures', () => {
            const a07: OwaspTop10Info = {
                id: 'A07:2021',
                name: 'Identification and Authentication Failures',
                description:
                    "Confirmation of the user's identity, authentication, and session management is critical to protect against authentication-related attacks."
            };

            expect(a07.id).toBe('A07:2021');
            expect(a07.name).toBe('Identification and Authentication Failures');
            expect(a07.description).toContain("Confirmation of the user's identity");
        });

        it('should handle A08:2021 - Software and Data Integrity Failures', () => {
            const a08: OwaspTop10Info = {
                id: 'A08:2021',
                name: 'Software and Data Integrity Failures',
                description:
                    'Software and data integrity failures relate to code and infrastructure that does not protect against integrity violations. An example of this is where an application relies upon plugins, libraries, or modules from untrusted sources, repositories, and content delivery networks (CDNs).'
            };

            expect(a08.id).toBe('A08:2021');
            expect(a08.name).toBe('Software and Data Integrity Failures');
            expect(a08.description).toContain('code and infrastructure that does not protect');
        });

        it('should handle A09:2021 - Security Logging and Monitoring Failures', () => {
            const a09: OwaspTop10Info = {
                id: 'A09:2021',
                name: 'Security Logging and Monitoring Failures',
                description:
                    'Returning to the OWASP Top 10 2021, this category is to help detect, escalate, and respond to active breaches. Without logging and monitoring, breaches cannot be detected.'
            };

            expect(a09.id).toBe('A09:2021');
            expect(a09.name).toBe('Security Logging and Monitoring Failures');
            expect(a09.description).toContain('help detect, escalate, and respond');
        });

        it('should handle A10:2021 - Server-Side Request Forgery', () => {
            const a10: OwaspTop10Info = {
                id: 'A10:2021',
                name: 'Server-Side Request Forgery',
                description:
                    'SSRF flaws occur whenever a web application is fetching a remote resource without validating the user-supplied URL. It allows an attacker to coerce the application to send a crafted request to an unexpected destination, even when protected by a firewall, VPN, or another type of network access control list (ACL).'
            };

            expect(a10.id).toBe('A10:2021');
            expect(a10.name).toBe('Server-Side Request Forgery');
            expect(a10.description).toContain('SSRF flaws occur whenever');
        });
    });

    describe('OWASP Top 10 2017 Categories (Legacy)', () => {
        it('should handle legacy A1:2017 - Injection', () => {
            const a1_2017: OwaspTop10Info = {
                id: 'A1:2017',
                name: 'Injection',
                description:
                    'Injection flaws, such as SQL, NoSQL, OS, and LDAP injection, occur when untrusted data is sent to an interpreter as part of a command or query.'
            };

            expect(a1_2017.id).toBe('A1:2017');
            expect(a1_2017.name).toBe('Injection');
            expect(a1_2017.description).toContain('Injection flaws, such as SQL');
        });

        it('should handle legacy A2:2017 - Broken Authentication', () => {
            const a2_2017: OwaspTop10Info = {
                id: 'A2:2017',
                name: 'Broken Authentication',
                description:
                    "Application functions related to authentication and session management are often implemented incorrectly, allowing attackers to compromise passwords, keys, or session tokens, or to exploit other implementation flaws to assume other users' identities temporarily or permanently."
            };

            expect(a2_2017.id).toBe('A2:2017');
            expect(a2_2017.name).toBe('Broken Authentication');
            expect(a2_2017.description).toContain('authentication and session management');
        });

        it('should handle legacy A3:2017 - Sensitive Data Exposure', () => {
            const a3_2017: OwaspTop10Info = {
                id: 'A3:2017',
                name: 'Sensitive Data Exposure',
                description:
                    'Many web applications and APIs do not properly protect sensitive data, such as financial, healthcare, and PII. Attackers may steal or modify such weakly protected data to conduct credit card fraud, identity theft, or other crimes.'
            };

            expect(a3_2017.id).toBe('A3:2017');
            expect(a3_2017.name).toBe('Sensitive Data Exposure');
            expect(a3_2017.description).toContain('do not properly protect sensitive data');
        });
    });

    describe('Edge cases and validation', () => {
        it('should handle non-standard ID formats', () => {
            const customId: OwaspTop10Info = {
                id: 'CUSTOM-001',
                name: 'Custom Security Issue',
                description: 'A custom security issue not part of the standard OWASP Top 10.'
            };

            expect(customId.id).toBe('CUSTOM-001');
            expect(customId.name).toBe('Custom Security Issue');
        });

        it('should handle Unicode characters', () => {
            const unicodeInfo: OwaspTop10Info = {
                id: 'A01:2021',
                name: "Contrôle d'Accès Cassé 🔒",
                description:
                    'Les restrictions sur ce que les utilisateurs authentifiés sont autorisés à faire ne sont souvent pas correctement appliquées. 中文测试 русский العربية'
            };

            expect(unicodeInfo.name).toBe("Contrôle d'Accès Cassé 🔒");
            expect(unicodeInfo.description).toContain('中文测试');
            expect(unicodeInfo.description).toContain('русский');
            expect(unicodeInfo.description).toContain('العربية');
        });

        it('should handle newlines and formatting in description', () => {
            const formattedInfo: OwaspTop10Info = {
                id: 'A01:2021',
                name: 'Broken Access Control',
                description: `Restrictions on what authenticated users are allowed to do are often not properly enforced.

                Common access control vulnerabilities include:
                
                • Violation of the principle of least privilege
                • Bypassing access control checks
                • Permitting viewing or editing someone else's account
                • Acting as a user without being logged in`
            };

            expect(formattedInfo.description).toContain('\n');
            expect(formattedInfo.description).toContain('•');
            expect(formattedInfo.description).toContain('Common access control vulnerabilities');
        });

        it('should handle null-like string values', () => {
            const nullLikeInfo: OwaspTop10Info = {
                id: 'null',
                name: 'undefined',
                description: 'NaN'
            };

            expect(nullLikeInfo.id).toBe('null');
            expect(nullLikeInfo.name).toBe('undefined');
            expect(nullLikeInfo.description).toBe('NaN');
        });

        it('should handle JSON-like strings in description', () => {
            const jsonInfo: OwaspTop10Info = {
                id: 'A01:2021',
                name: 'Test Category',
                description:
                    '{"type": "vulnerability", "severity": "high", "remediation": "implement proper access controls"}'
            };

            expect(jsonInfo.description).toBe(
                '{"type": "vulnerability", "severity": "high", "remediation": "implement proper access controls"}'
            );
        });
    });

    describe('Type compatibility', () => {
        it('should work with arrays of OwaspTop10Info', () => {
            const owaspCategories: OwaspTop10Info[] = [
                {
                    id: 'A01:2021',
                    name: 'Broken Access Control',
                    description: 'Access control description'
                },
                {
                    id: 'A02:2021',
                    name: 'Cryptographic Failures',
                    description: 'Cryptographic description'
                }
            ];

            expect(owaspCategories).toHaveLength(2);
            expect(owaspCategories[0].id).toBe('A01:2021');
            expect(owaspCategories[1].id).toBe('A02:2021');
        });

        it('should work as optional properties', () => {
            interface VulnerabilityWithOwasp {
                cve: string;
                owasp?: OwaspTop10Info;
            }

            const vulnWithOwasp: VulnerabilityWithOwasp = {
                cve: 'CVE-2023-1234',
                owasp: {
                    id: 'A01:2021',
                    name: 'Broken Access Control',
                    description: 'Test description'
                }
            };

            const vulnWithoutOwasp: VulnerabilityWithOwasp = {
                cve: 'CVE-2023-5678'
            };

            expect(vulnWithOwasp.owasp?.id).toBe('A01:2021');
            expect(vulnWithoutOwasp.owasp).toBeUndefined();
        });

        it('should work in nested objects', () => {
            interface SecurityReport {
                findings: {
                    owasp: OwaspTop10Info;
                    severity: string;
                }[];
            }

            const report: SecurityReport = {
                findings: [
                    {
                        owasp: {
                            id: 'A01:2021',
                            name: 'Broken Access Control',
                            description: 'Access control issue found'
                        },
                        severity: 'HIGH'
                    }
                ]
            };

            expect(report.findings[0].owasp.id).toBe('A01:2021');
            expect(report.findings[0].severity).toBe('HIGH');
        });
    });
});
