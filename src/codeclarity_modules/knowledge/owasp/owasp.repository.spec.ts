import { Test, type TestingModule } from '@nestjs/testing';
import { EntityNotFound } from 'src/types/error.types';


import { OWASPRepository } from './owasp.repository';


describe('OWASPRepository', () => {
    let repository: OWASPRepository;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [OWASPRepository]
        }).compile();

        repository = module.get<OWASPRepository>(OWASPRepository);
    });

    describe('getOwaspTop10CategoryInfo', () => {
        it('should return OWASP category info for valid CWE ID A01', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1345');

            expect(result).toEqual({
                id: 'A01',
                name: 'A01: Broken Access Control',
                description:
                    'Improper enforcement of access restrictions on what authenticated users are allow to access or perform within a system, may lead to loss of confidentiality, integrity and availability of sensitive resources, tampering with or destruction of data, and may allow users to act outside of their intended privileges, such as executing (business) functions not intended for them.'
            });
        });

        it('should return OWASP category info for valid CWE ID A02', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1346');

            expect(result).toEqual({
                id: 'A02',
                name: 'A02: Cryptographic Failures',
                description:
                    'Weaknesses or misuse of cryptographic algorithms, protocols, or implementations may lead to exposure or tampering of sensitive data or systems.'
            });
        });

        it('should return OWASP category info for valid CWE ID A03', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1347');

            expect(result).toEqual({
                id: 'A03',
                name: 'A03: Injection',
                description:
                    'Improper handling of untrusted input, be it user-supplied or data fetched from external and internal sources, may lead to control-flow manipulation or code execution on the vulnerable system - if the injected data is interpreted. This is known as injection as the attacker can coerce the vulnerable system to misbehave by providing specially crafted input.'
            });
        });

        it('should return OWASP category info for valid CWE ID A04', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1348');

            expect(result).toEqual({
                id: 'A04',
                name: 'A04: Insecure Design',
                description:
                    "Insecure design is a broad category encompassing different weaknesses, falling under the umbrella of 'missing or ineffective control design' that are the result of poor or insecure architectural and design descisions made during software or system design. This category, as well as the others, are mutally exclusive, meaning that all other Owasp Top 10 categories do not cover weakness caused by design, but rather implementation."
            });
        });

        it('should return OWASP category info for valid CWE ID A05', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1349');

            expect(result).toEqual({
                id: 'A05',
                name: 'A05: Security Misconfiguration',
                description:
                    'Poorly configured security settings, default configurations, or mismanagement of security-related controls, may lead to vulnerabilities and potential unauthorized access'
            });
        });

        it('should return OWASP category info for valid CWE ID A06', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1352');

            expect(result).toEqual({
                id: 'A06',
                name: 'A06: Vulnerable and Outdated Components',
                description:
                    'Use of vulnerable or outdated components, frameworks, or libraries, which may introduce security weaknesses into an application that may be exploited by an attacker.'
            });
        });

        it('should return OWASP category info for valid CWE ID A07', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1353');

            expect(result).toEqual({
                id: 'A07',
                name: 'A07: Identification and Authentication Failures',
                description:
                    'Insufficiently secure implementation of user identification and authentication within an application or system can lead to unauthorized access, identity theft, or account compromise. Vulnerabilities in this category may include: insufficient password policies leading to weak or easily guessable passwords, insecure credential storage, improper session management and inadequate or missing multi-factor authentication.'
            });
        });

        it('should return OWASP category info for valid CWE ID A08', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1354');

            expect(result).toEqual({
                id: 'A08',
                name: 'A08: Software and Data Integrity Failures',
                description:
                    'Insufficient detection or preventive measures against unauthorized modification, tampering, or corruption of data or software results in integrity failures, potential malfunctions or security breaches.'
            });
        });

        it('should return OWASP category info for valid CWE ID A09', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1355');

            expect(result).toEqual({
                id: 'A09',
                name: 'A09: Security Logging and Monitoring Failures',
                description:
                    'Insufficient or missing security logging and monitoring may result in delayed detection and reaction to active attacks and breaches, or complete failure thereof.'
            });
        });

        it('should return OWASP category info for valid CWE ID A10', async () => {
            const result = repository.getOwaspTop10CategoryInfo('1356');

            expect(result).toEqual({
                id: 'A10',
                name: 'A10: Server-Side Request Forgery',
                description:
                    'Insufficent or missing validation of user-supplied URLs or service-requests may lead to Server-Side Request Forgery (SSRF). SSRF is a security vulnerability that occurs when an attacker tricks a server into making unauthorized requests on behalf of the server itself, typically to gain access to internal resources, or services, or bypass access control measures.'
            });
        });

        it('should throw EntityNotFound for invalid CWE ID', async () => {
            expect(() => {
                repository.getOwaspTop10CategoryInfo('9999');
            }).toThrow(EntityNotFound);
        });

        it('should throw EntityNotFound for empty CWE ID', async () => {
            expect(() => {
                repository.getOwaspTop10CategoryInfo('');
            }).toThrow(EntityNotFound);
        });

        it('should throw EntityNotFound for non-numeric CWE ID', async () => {
            expect(() => {
                repository.getOwaspTop10CategoryInfo('invalid');
            }).toThrow(EntityNotFound);
        });

        it('should throw EntityNotFound for null CWE ID', async () => {
            expect(() => {
                repository.getOwaspTop10CategoryInfo(null as any);
            }).toThrow(EntityNotFound);
        });

        it('should throw EntityNotFound for undefined CWE ID', async () => {
            expect(() => {
                repository.getOwaspTop10CategoryInfo(undefined as any);
            }).toThrow(EntityNotFound);
        });
    });
});
