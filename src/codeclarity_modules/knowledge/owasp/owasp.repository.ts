import { Injectable } from '@nestjs/common';
import { OwaspTop10Info } from 'src/types/entities/knowledge/OWASP';
import { EntityNotFound } from 'src/types/errors/types';

const owaspData: { [key: string]: OwaspTop10Info } = {
    // OWASP Top 10 2021
    '1345': {
        id: 'A01',
        name: 'A01: Broken Access Control',
        description:
            'Improper enforcement of access restrictions on what authenticated users are allow to access or perform within a system, may lead to loss of confidentiality, integrity and availability of sensitive resources, tampering with or destruction of data, and may allow users to act outside of their intended privileges, such as executing (business) functions not intended for them.'
    },

    '1346': {
        id: 'A02',
        name: 'A02: Cryptographic Failures',
        description:
            'Weaknesses or misuse of cryptographic algorithms, protocols, or implementations may lead to exposure or tampering of sensitive data or systems.'
    },

    '1347': {
        id: 'A03',
        name: 'A03: Injection',
        description:
            'Improper handling of untrusted input, be it user-supplied or data fetched from external and internal sources, may lead to control-flow manipulation or code execution on the vulnerable system - if the injected data is interpreted. This is known as injection as the attacker can coerce the vulnerable system to misbehave by providing specially crafted input.'
    },

    '1348': {
        id: 'A04',
        name: 'A04: Insecure Design',
        description:
            "Insecure design is a broad category encompassing different weaknesses, falling under the umbrella of 'missing or ineffective control design' that are the result of poor or insecure architectural and design descisions made during software or system design. This category, as well as the others, are mutally exclusive, meaning that all other Owasp Top 10 categories do not cover weakness caused by design, but rather implementation."
    },

    '1349': {
        id: 'A05',
        name: 'A05: Security Misconfiguration',
        description:
            'Poorly configured security settings, default configurations, or mismanagement of security-related controls, may lead to vulnerabilities and potential unauthorized access'
    },

    '1352': {
        id: 'A06',
        name: 'A06: Vulnerable and Outdated Components',
        description:
            'Use of vulnerable or outdated components, frameworks, or libraries, which may introduce security weaknesses into an application that may be exploited by an attacker.'
    },

    '1353': {
        id: 'A07',
        name: 'A07: Identification and Authentication Failures',
        description:
            'Insufficiently secure implementation of user identification and authentication within an application or system can lead to unauthorized access, identity theft, or account compromise. Vulnerabilities in this category may include: insufficient password policies leading to weak or easily guessable passwords, insecure credential storage, improper session management and inadequate or missing multi-factor authentication.'
    },

    '1354': {
        id: 'A08',
        name: 'A08: Software and Data Integrity Failures',
        description:
            'Insufficient detection or preventive measures against unauthorized modification, tampering, or corruption of data or software results in integrity failures, potential malfunctions or security breaches.'
    },

    '1355': {
        id: 'A09',
        name: 'A09: Security Logging and Monitoring Failures',
        description:
            'Insufficient or missing security logging and monitoring may result in delayed detection and reaction to active attacks and breaches, or complete failure thereof.'
    },

    '1356': {
        id: 'A10',
        name: 'A10: Server-Side Request Forgery',
        description:
            'Insufficent or missing validation of user-supplied URLs or service-requests may lead to Server-Side Request Forgery (SSRF). SSRF is a security vulnerability that occurs when an attacker tricks a server into making unauthorized requests on behalf of the server itself, typically to gain access to internal resources, or services, or bypass access control measures.'
    }
};

@Injectable()
export class OWASPRepository {
    getOwaspTop10CategoryInfo(owasp_top_10_cwe_list_id: string): OwaspTop10Info | null {
        if (owasp_top_10_cwe_list_id in owaspData) {
            return owaspData[owasp_top_10_cwe_list_id];
        }
        throw new EntityNotFound();
    }
}
