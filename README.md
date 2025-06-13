<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/CodeClarityCE/identity/blob/main/logo/vectorized/logo_name_white.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/CodeClarityCE/identity/blob/main/logo/vectorized/logo_name_black.svg">
  <img alt="codeclarity-logo" src="https://github.com/CodeClarityCE/identity/blob/main/logo/vectorized/logo_name_black.svg">
</picture>
<br>
<br>

Secure your software empower your team.

[![License](https://img.shields.io/github/license/codeclarityce/codeclarity-dev)](LICENSE.txt)

<details open="open">
<summary>Table of Contents</summary>

- [CodeClarity API](#codeclarity-api)
  - [Contributing](#contributing)
  - [Reporting Issues](#reporting-issues)
  - [Purpose](#purpose)
  - [Getting started](#getting-started)
  - [API Responses](#api-responses)
    - [API data](#api-data)
    - [API conventions](#api-conventions)


</details>

---

# CodeClarity API

## Contributing

If you'd like to contribute code or documentation, please see [CONTRIBUTING.md](https://github.com/CodeClarityCE/codeclarity-dev/blob/main/CONTRIBUTING.md) for guidelines on how to do so.

## Reporting Issues

Please report any issues with the setup process or other problems encountered while using this repository by opening a new issue in this project's GitHub page.

## Purpose

The following repository contains the source code material for our public API, powered by NestJS.

## Getting started

1. `make build`
2. `make build-dev`
3. `TEST_EMAIL=<test-email-address> MAIL_AUTH_PASSWORD=<smtp-password> make up-dev`

    1. `<test-email-address>` is an email address on which you will recieve all emails during development. This is so we do not spam real-world email addresses of real people during development.
    2. `<smtp-password>` the password needed to authenticate to the smtp server. <span style='color:red'>Under no circumstance put this into one of the .env files!</span>
    3. To make your life easier, export these environment variables in `/etc/environment`, so you don't need to specify them every time.

## API Responses

### API data
Every response from the API includes two fields:
 - `status` a textual indication of whether the request succeeded or not (`"success"` or `"failure"`)
 - `status_code` the numerical http status code (`200`,`400`, `500`, ...)

Every error returned from the API includes two additional fields:
 - `error_code` a textual error code (`"UnkownAnalysis"`, `"UnkownWorkspace"`, `"UnprocessableEntity"`, ...)
 - `error_message` an error message/description

Note: that the presence of these fields is enforced by the `ExceptionFilter` and the `ResponseBodyInterceptor`.

### API conventions
 - **Error handling**: Our API indicates failures and success via HTTP status codes (`200`,`400`, `500`) and also by including respective fields in the returned JSON body. Allowing consumers of the API to employ their preffered style of error handling.
    - `Success`:
        ```json
        // HTTP status code: 200
        {
            "status_code": 200,
            "status": "success",
            "data": { ... }
        }
        ```
    - `Error`: 
        ```json
        // HTTP status code: 400
        {
            "status_code": 400,
            "status": "failure",
            "error_code": "UnkownWorkspace",
            "error_message": "The referenced workspace does not exist"
        }
        ```
 - **Casing**: All the responses from our API are in underscore/snake case. The same applies to query and body parameters.